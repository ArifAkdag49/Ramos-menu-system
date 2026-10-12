-- Admin > Masalar: masa durumunu CANLI yönetme (işletme talebi, 12.10.2026).
--
-- Bugüne kadar masa yalnız garson akışıyla açılıp kapanıyordu: ilk siparişle açılır (`submit_order`),
-- garson hesabı kapatır (`close_table_session`). Admin ekranında masa yalnız adlandırılıp sıralanıyor,
-- "açık hesap var" rozeti dışında bir şey yapılamıyordu. İşletmenin isteği: admin masayı istediği an
-- açabilsin, kapatabilsin ve yanlışlıkla dolu kalan masayı sıfırlayabilsin.
--
-- Üç yeni fonksiyon (hepsi YALNIZ admin):
--   * `admin_table_states()` — pasif masalar da dahil tüm masaların canlı durumu. `table_overview`
--     pasif masaları süzer; pasifleştirilmiş bir masada açık oturum kalırsa admin onu görmeli ki
--     kapatabilsin (aksi hâlde oturum hiçbir ekranda görünmez ve sonsuza kadar açık kalır).
--   * `admin_open_table_session(table)` — sipariş olmadan hesap açar (masa garson ekranında "dolu").
--   * `admin_reset_table_session(session, reason)` — masadaki TÜM aktif kalemleri iptal eder
--     (ciroya girmez: `report_range` yalnız `active` kalemleri sayar), mutfakta/hazır bekleyen her
--     sipariş için STORNO fişi basar ve hesabı kapatır. Sebep zorunlu, her şey denetim kaydına düşer.
--
-- Hesabı OLDUĞU GİBİ kapatmak (ciro kalsın) için yeni fonksiyon yok: `close_table_session` zaten
-- `admin` rolüne de açık (0004), admin ekranı doğrudan onu çağırır.
--
-- Kilit sırası 0004_order_lifecycle_session_lock / 0008 ile aynı: önce masa satırı, sonra oturum.

create function public.admin_table_states()
returns table (table_id uuid, name text, sort int, is_active boolean, session_id uuid,
               opened_at timestamptz, opened_by_name text, total_cents bigint,
               items int, orders_in_kitchen int, orders_ready int)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.sort, t.is_active, s.id, s.opened_at, p.display_name,
         coalesce((select sum(i.unit_price_cents * i.quantity) from public.order_items i
                   join public.orders o on o.id = i.order_id
                   where o.session_id = s.id and i.status = 'active'), 0)::bigint,
         coalesce((select sum(i.quantity) from public.order_items i
                   join public.orders o on o.id = i.order_id
                   where o.session_id = s.id and i.status = 'active'), 0)::int,
         (select count(*) from public.orders o where o.session_id = s.id and o.status = 'in_kitchen')::int,
         (select count(*) from public.orders o where o.session_id = s.id and o.status = 'ready')::int
  from public.dining_tables t
  left join public.table_sessions s on s.table_id = t.id and s.status = 'open'
  left join public.profiles p on p.id = s.opened_by
  where public.has_role('admin')
  order by t.sort, t.name;
$$;

create function public.admin_open_table_session(p_table_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_table public.dining_tables; v_session public.table_sessions;
begin
  v_me := internal.require_role('admin');
  select * into v_table from public.dining_tables t where t.id = p_table_id for update;
  if not found then perform internal.fail('table_not_found'); end if;
  if not v_table.is_active then perform internal.fail('table_inactive'); end if;
  -- Masa satırı kilitli olduğu için bu kontrol yeterli; `table_sessions_one_open` kısmi tekil
  -- indeksi aynı kuralı veritabanı tarafında yine de uygular.
  if exists (select 1 from public.table_sessions s where s.table_id = p_table_id and s.status = 'open')
  then perform internal.fail('session_already_open'); end if;

  insert into public.table_sessions (table_id, opened_by) values (p_table_id, v_me.id)
  returning * into v_session;
  -- Eylem adı `session_open`: garsonun ilk siparişiyle açılan oturumla aynı satır türü. `manual`
  -- bayrağı elle açıldığını söyler (denetim ekranında ayrıntıda görünür).
  perform internal.audit('session_open', 'table_session', v_session.id::text,
    jsonb_build_object('table', v_table.name, 'manual', true));
  return jsonb_build_object('session_id', v_session.id, 'table', v_table.name);
end $$;

create function public.admin_reset_table_session(p_session_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me      public.profiles;
  v_session public.table_sessions;
  v_table   text;
  v_reason  text;
  v_order   record;
  v_items   int := 0;
  v_value   int := 0;
  v_stornos int := 0;
begin
  v_me := internal.require_role('admin');
  v_reason := nullif(btrim(coalesce(p_reason, '')), '');
  if v_reason is null then perform internal.fail('reason_required'); end if;
  if length(v_reason) > 200 then perform internal.fail('reason_too_long'); end if;

  perform 1 from public.dining_tables t
   where t.id = (select s.table_id from public.table_sessions s where s.id = p_session_id)
   for update;
  select * into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found or v_session.status <> 'open' then perform internal.fail('session_closed'); end if;
  select t.name into v_table from public.dining_tables t where t.id = v_session.table_id;

  select coalesce(sum(i.quantity), 0)::int, coalesce(sum(i.unit_price_cents * i.quantity), 0)::int
    into v_items, v_value
    from public.order_items i join public.orders o on o.id = i.order_id
   where o.session_id = p_session_id and i.status = 'active';

  -- STORNO yalnız mutfağın elinde iş olan siparişler için ve sipariş başına TEK fiş: mutfak
  -- hazırladığı şeyin iptal edildiğini görmeli. Teslim edilmiş siparişe fiş basılmaz (R42 ile aynı
  -- gerekçe: mutfakta karşılığı kalmamıştır). Yük, kalemler iptal edilmeden ÖNCE hazırlanır.
  for v_order in
    select o.id, array_agg(i.id) as item_ids
      from public.orders o join public.order_items i on i.order_id = o.id
     where o.session_id = p_session_id and o.status in ('in_kitchen', 'ready') and i.status = 'active'
     group by o.id
  loop
    insert into public.print_jobs (type, order_id, session_id, payload, created_by)
    values ('storno', v_order.id, p_session_id,
            internal.build_storno_payload(v_order.id, v_order.item_ids, v_reason), v_me.id);
    v_stornos := v_stornos + 1;
  end loop;

  update public.order_items i
     set status = 'cancelled', cancel_reason = v_reason, cancelled_by = v_me.id, cancelled_at = now()
   where i.status = 'active'
     and i.order_id in (select o.id from public.orders o where o.session_id = p_session_id);

  -- spec §3.5 / `cancel_order_item` ile aynı kural: sipariş yalnız in_kitchen / ready durumundan
  -- iptale geçer (üstteki döngüden sonra hiçbirinde aktif kalem kalmamıştır); teslim edilmiş
  -- sipariş `served` kalır, kalemleri iptalli görünür.
  update public.orders o
     set status = 'cancelled', cancelled_at = now()
   where o.session_id = p_session_id and o.status in ('in_kitchen', 'ready');

  update public.table_sessions set status = 'closed', closed_at = now(), closed_by = v_me.id
   where id = p_session_id;

  perform internal.audit('session_reset', 'table_session', p_session_id::text,
    jsonb_build_object('table', v_table, 'reason', v_reason, 'items', v_items,
                       'value_cents', v_value, 'storno_jobs', v_stornos));
  return jsonb_build_object('items', v_items, 'value_cents', v_value, 'storno_jobs', v_stornos);
end $$;

-- ---------- toplu fonksiyon yetkileri (önceki migration'lardaki kalıp) ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;

-- 0010: ready_push_targets yalnız service_role.
revoke execute on function public.ready_push_targets(uuid) from public, anon, authenticated;
grant execute on function public.ready_push_targets(uuid) to service_role;

-- 0012: SDP iç fonksiyonları yalnız service_role (Edge Function).
revoke execute on function public.sdp_claim_next(text) from public, anon, authenticated;
revoke execute on function public.sdp_complete(text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.sdp_claim_next(text) to service_role;
grant execute on function public.sdp_complete(text, uuid, boolean, text) to service_role;

-- 0015: station-feed iç fonksiyonları yalnız service_role (Edge Function).
revoke execute on function public.station_feed_claim(text) from public, anon, authenticated;
revoke execute on function public.station_feed_complete(text, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.station_feed_heartbeat(text, text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.station_feed_claim(text) to service_role;
grant execute on function public.station_feed_complete(text, uuid, boolean, text) to service_role;
grant execute on function public.station_feed_heartbeat(text, text, boolean, jsonb, text) to service_role;

-- 0016: menu-sync iç fonksiyonları yalnız service_role (Edge Function).
revoke execute on function public.menu_sync_pull(text, timestamptz, int) from public, anon, authenticated;
revoke execute on function public.menu_sync_push(text, jsonb) from public, anon, authenticated;
revoke execute on function public.menu_sync_touch(text, text) from public, anon, authenticated;
grant execute on function public.menu_sync_pull(text, timestamptz, int) to service_role;
grant execute on function public.menu_sync_push(text, jsonb) to service_role;
grant execute on function public.menu_sync_touch(text, text) to service_role;

-- 0011: anon'un çağırabildiği TEK fonksiyon — toplu revoke'tan SONRA.
grant execute on function public.public_menu() to anon, authenticated;
