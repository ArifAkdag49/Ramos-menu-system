-- 0013 — Tablet yazıcı istasyonu + Firebase (FCM) bildirim jetonları.
--
-- 1) Üçüncü baskı yolu `print_route = 'station'`: yerel Android uygulamasındaki mutfak tableti fişleri kuyruktan
--    alıp aynı Wi-Fi'daki yazıcıya kendisi basar (bilgisayar yok). İstasyon ayrı bir hesap değildir: mutfak ya da
--    admin oturumuyla `station_*` RPC'lerini çağırır. Rota tek seçimdir — ajan ('agent'), Epson SDP ('epson_sdp')
--    ve istasyon ('station') yalnız kendi rotasında iş alır; aynı fiş iki yoldan basılmaz.
-- 2) Kuyruk mantığı (sıradaki işi sahiplen / sonucu kaydet / durum satırı) üç yolda da AYNI olsun diye
--    `internal.*` yardımcılarına ayrıldı. Mevcut public imzalar ve davranışlar DEĞİŞMEDİ
--    (supabase/tests/print.test.ts, epson_sdp.test.ts bunu doğrular).
-- 3) `push_subscriptions.kind`: 'webpush' (tarayıcı, VAPID) | 'fcm' (yerel uygulama, endpoint = FCM jetonu).
--
-- KURAL (0010/0011/0012 notları): dosya sonundaki toplu revoke/grant bloğundan SONRA ready_push_targets
-- daraltması, SDP daraltmaları ve public_menu anon izni tekrarlanır.

alter table public.settings drop constraint settings_print_route_check;
alter table public.settings
  add constraint settings_print_route_check check (print_route in ('agent', 'epson_sdp', 'station'));

-- ---------- ortak kuyruk yardımcıları (yalnız SECURITY DEFINER sarmalayıcılardan çağrılır) ----------

-- Sıradaki işleri sahiplenir: bekleyen ve zamanı gelmiş (`next_attempt_at <= now()`) ya da 60 sn'den uzun süredir
-- 'printing'de takılı kalmış işler, en eskiden başlayarak; `skip locked` eşzamanlı çağıranların aynı işi almasını önler.
create function internal.claim_print_jobs(p_claimed_by text, p_limit int) returns setof public.print_jobs
language plpgsql set search_path = '' as $$
begin
  return query
  with next_jobs as (
    select j.id from public.print_jobs j
    where (j.status = 'pending' and j.next_attempt_at <= now())
       or (j.status = 'printing' and j.claimed_at < now() - interval '60 seconds')
    order by j.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.print_jobs j
       set status = 'printing', claimed_by = p_claimed_by, claimed_at = now()
      from next_jobs
     where j.id = next_jobs.id
    returning j.*
  )
  select * from claimed;
end $$;

-- Baskı sonucunu kaydeder (R49 korumasıyla): iş yalnız 'printing' iken ve — verilmişse — sahibi eşleşirken kapanır.
-- p_claimed_by: tam sahip (null = denetleme yok); p_claimed_like: sahip deseni (ör. 'station:%', null = yok).
-- Başarısızlıkta 5/15/30/60/120 sn geri çekilme, 6. hatada 'failed'. printer_status'a DOKUNMAZ (her yol kendi yazar).
-- Dönüş: 'ok' | 'job_not_found' | 'job_not_printing'.
create function internal.complete_print_job(p_job_id uuid, p_ok boolean, p_error text,
                                            p_claimed_by text, p_claimed_like text default null) returns text
language plpgsql set search_path = '' as $$
declare v public.print_jobs; v_backoff int[] := array[5, 15, 30, 60, 120];
begin
  select * into v from public.print_jobs j where j.id = p_job_id for update;
  if not found then return 'job_not_found'; end if;
  if v.status <> 'printing'
     or (p_claimed_by is not null and v.claimed_by is distinct from p_claimed_by)
     or (p_claimed_like is not null and coalesce(v.claimed_by, '') not like p_claimed_like) then
    return 'job_not_printing';
  end if;
  if p_ok then
    update public.print_jobs set status = 'printed', printed_at = now(), last_error = null
     where id = p_job_id and status = 'printing' and claimed_at is not distinct from v.claimed_at;
  elsif v.attempts + 1 >= 6 then
    update public.print_jobs set status = 'failed', attempts = v.attempts + 1, last_error = p_error
     where id = p_job_id and status = 'printing' and claimed_at is not distinct from v.claimed_at;
  else
    update public.print_jobs
       set status = 'pending', attempts = v.attempts + 1, last_error = p_error,
           next_attempt_at = now() + make_interval(secs => v_backoff[v.attempts + 1])
     where id = p_job_id and status = 'printing' and claimed_at is not distinct from v.claimed_at;
  end if;
  return 'ok';
end $$;

-- Ajan / istasyon heartbeat'i: tek satırlık printer_status'u yazar.
create function internal.write_printer_heartbeat(p_agent_id text, p_version text, p_host text,
                                                 p_reachable boolean, p_state jsonb, p_error text) returns void
language sql set search_path = '' as $$
  update public.printer_status
     set agent_id = p_agent_id, agent_version = p_version, host = p_host, last_seen_at = now(),
         printer_reachable = p_reachable, printer_state = coalesce(p_state, '{}'::jsonb), last_error = p_error
   where id = 'main';
$$;

create function internal.print_route() returns text
language sql stable set search_path = '' as $$
  select s.print_route from public.settings s where s.id = 1;
$$;

-- ---------- ajan (printer rolü): imzalar ve davranış 0005_fix/0012 ile aynı ----------
create or replace function public.claim_print_job(p_agent_id text) returns setof public.print_jobs
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('printer');
  if internal.print_route() <> 'agent' then
    return;
  end if;
  return query select * from internal.claim_print_jobs(p_agent_id, 1);
end $$;

create or replace function public.complete_print_job(p_job_id uuid, p_ok boolean, p_error text default null,
                                                     p_agent_id text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_result text;
begin
  perform internal.require_role('printer');
  v_result := internal.complete_print_job(p_job_id, p_ok, left(p_error, 500), p_agent_id);
  if v_result <> 'ok' then perform internal.fail(v_result); end if;
  if p_ok then
    update public.printer_status set last_printed_at = now() where id = 'main';
  end if;
end $$;

create or replace function public.agent_heartbeat(p_agent_id text, p_version text, p_host text,
                                                  p_reachable boolean, p_state jsonb, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('printer');
  if internal.print_route() <> 'agent' then
    return;
  end if;
  perform internal.write_printer_heartbeat(p_agent_id, p_version, p_host, p_reachable, p_state, p_error);
end $$;

-- ---------- Epson SDP (service_role): imzalar ve davranış 0012 ile aynı ----------
create or replace function public.sdp_claim_next(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_p public.sdp_printers; v_agent text; v_s public.settings; v_jobs jsonb;
begin
  select * into v_p from public.sdp_printers p where p.token_hash = p_token_hash;
  if not found then return jsonb_build_object('printer', 'unknown', 'jobs', '[]'::jsonb); end if;
  if not v_p.is_active then return jsonb_build_object('printer', 'inactive', 'jobs', '[]'::jsonb); end if;

  update public.sdp_printers set last_seen_at = now() where id = v_p.id;
  select * into v_s from public.settings s where s.id = 1;
  v_agent := 'epson-sdp:' || v_p.id::text;

  if v_s.print_route <> 'epson_sdp' then
    return jsonb_build_object('printer', 'ok', 'jobs', '[]'::jsonb);
  end if;

  update public.printer_status ps
     set printer_reachable = case when ps.agent_id is distinct from v_agent then true else ps.printer_reachable end,
         printer_state     = case when ps.agent_id is distinct from v_agent then '{}'::jsonb else ps.printer_state end,
         last_error        = case when ps.agent_id is distinct from v_agent then null else ps.last_error end,
         agent_id = v_agent, agent_version = null, host = 'Epson SDP', last_seen_at = now()
   where ps.id = 'main';

  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'payload', c.payload)
                            order by c.created_at), '[]'::jsonb)
    into v_jobs from internal.claim_print_jobs(v_agent, 5) c;

  return jsonb_build_object(
    'printer', 'ok',
    'jobs', v_jobs,
    'settings', jsonb_build_object('codepage', v_s.printer_codepage, 'codepageNumber', v_s.printer_codepage_number,
                                   'transliterate', v_s.printer_transliterate));
end $$;

create or replace function public.sdp_complete(p_token_hash text, p_job_id uuid, p_success boolean, p_error text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_p public.sdp_printers; v_agent text; v_result text;
        v_err text := left(coalesce(nullif(btrim(p_error), ''), 'print_failed'), 500);
begin
  select * into v_p from public.sdp_printers p where p.token_hash = p_token_hash;
  if not found then return 'unknown'; end if;
  if not v_p.is_active then return 'inactive'; end if;
  v_agent := 'epson-sdp:' || v_p.id::text;

  v_result := internal.complete_print_job(p_job_id, p_success, v_err, v_agent);
  if v_result <> 'ok' then return v_result; end if;

  update public.sdp_printers
     set last_seen_at = now(), last_error = case when p_success then null else v_err end
   where id = v_p.id;

  update public.printer_status
     set agent_id = v_agent, agent_version = null, host = 'Epson SDP', last_seen_at = now(),
         printer_reachable = p_success or v_err !~ '^(EX_BADPORT|EX_TIMEOUT|DeviceNotFound|PrintSystemError)',
         printer_state = case when p_success then '{}'::jsonb
                              else jsonb_build_object('paper_end', v_err ~ '^EPTR_REC_EMPTY',
                                                      'cover_open', v_err ~ '^EPTR_COVER_OPEN',
                                                      'error', v_err) end,
         last_error = case when p_success then null else v_err end,
         last_printed_at = case when p_success then now() else last_printed_at end
   where id = 'main';
  return 'ok';
end $$;

-- ---------- tablet yazıcı istasyonu (kitchen | admin) ----------
-- İstasyon kimliği cihazda üretilip saklanır; kuyrukta `claimed_by = 'station:<id>'` olarak görünür.
create function public.station_claim_print_job(p_station_id text) returns setof public.print_jobs
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('kitchen', 'admin');
  if internal.print_route() <> 'station' then
    return;
  end if;
  if length(btrim(coalesce(p_station_id, ''))) not between 1 and 100 then
    perform internal.fail('station_id_invalid');
  end if;
  return query select * from internal.claim_print_jobs('station:' || p_station_id, 1);
end $$;

-- complete_print_job semantiği. p_station_id verilmezse iş yine de yalnız bir istasyonun sahiplendiği
-- ('station:%') iş olmalıdır — mutfak oturumu ajanın/SDP'nin basmakta olduğu işi kapatamaz.
create function public.station_complete_print_job(p_job_id uuid, p_ok boolean, p_error text default null,
                                                  p_station_id text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v_result text;
begin
  perform internal.require_role('kitchen', 'admin');
  v_result := internal.complete_print_job(p_job_id, p_ok, left(p_error, 500),
                                          case when p_station_id is not null then 'station:' || p_station_id end,
                                          'station:%');
  if v_result <> 'ok' then perform internal.fail(v_result); end if;
  if p_ok then
    update public.printer_status set last_printed_at = now() where id = 'main';
  end if;
end $$;

-- Rota 'station' değilse no-op: başka yolun (ajan/SDP) durum satırı ezilmez.
create function public.station_heartbeat(p_station_id text, p_version text, p_host text,
                                         p_reachable boolean, p_state jsonb, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('kitchen', 'admin');
  if internal.print_route() <> 'station' then
    return;
  end if;
  perform internal.write_printer_heartbeat('station:' || coalesce(p_station_id, ''), p_version, p_host,
                                           p_reachable, p_state, left(p_error, 500));
end $$;

-- ---------- FCM bildirim jetonları ----------
alter table public.push_subscriptions
  add column kind text not null default 'webpush'
  constraint push_subscriptions_kind_check check (kind in ('webpush', 'fcm'));
alter table public.push_subscriptions alter column p256dh drop not null;
alter table public.push_subscriptions alter column auth drop not null;
alter table public.push_subscriptions
  add constraint push_subscriptions_webpush_keys_check
  check (kind <> 'webpush' or (p256dh is not null and auth is not null));

-- save_push_subscription kalıbı: aynı jeton başka kullanıcıyla gelirse (cihazda hesap değişti) ona yeniden atanır.
-- Silme için mevcut delete_push_subscription(p_endpoint => jeton) kullanılır.
create function public.save_fcm_token(p_token text, p_ua text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles;
begin
  v_me := internal.require_role('admin', 'waiter', 'kitchen');
  if length(btrim(coalesce(p_token, ''))) not between 1 and 4096 then
    perform internal.fail('fcm_token_invalid');
  end if;
  insert into public.push_subscriptions (user_id, endpoint, kind, p256dh, auth, user_agent)
  values (v_me.id, p_token, 'fcm', null, null, left(p_ua, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, kind = 'fcm', p256dh = null, auth = null,
        user_agent = excluded.user_agent, created_at = now();
end $$;

-- 0010 ile aynı; hedeflere `kind` eklendi (Web Push alanları olduğu gibi, FCM'de p256dh/auth null).
create or replace function public.ready_push_targets(p_order_id uuid) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'order', (select jsonb_build_object(
                'id', o.id, 'order_no', o.order_no, 'table', t.name,
                'items', (select coalesce(jsonb_agg(jsonb_build_object(
                                   'qty', i.quantity, 'code', i.product_code, 'name', i.product_name)
                                 order by i.is_beverage, i.category_sort, i.sort), '[]'::jsonb)
                          from public.order_items i
                          where i.order_id = o.id and i.status = 'active'))
              from public.orders o
              join public.table_sessions ts on ts.id = o.session_id
              join public.dining_tables t on t.id = ts.table_id
              where o.id = p_order_id),
    'targets', (select coalesce(jsonb_agg(jsonb_build_object(
                         'id', ps.id, 'kind', ps.kind, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth,
                         'locale', p.locale)
                       order by ps.created_at), '[]'::jsonb)
                from public.push_subscriptions ps
                join public.profiles p on p.id = ps.user_id
                where p.is_active
                  and p.role in ('waiter', 'admin')
                  and public.is_on_duty(p.on_duty_since)));
$$;

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

-- 0011: anon'un çağırabildiği TEK fonksiyon — toplu revoke'tan SONRA.
grant execute on function public.public_menu() to anon, authenticated;
