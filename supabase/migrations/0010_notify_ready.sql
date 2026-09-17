-- 0010 — "Hazır" push hattı (spec §11.3, Plan 4 · Görev 26)
-- orders.status → 'ready' geçişinde pg_net, notify-ready Edge Function'ını çağırır. Fonksiyon,
-- ready_push_targets ile mesaideki garson/admin aboneliklerini alır ve Web Push gönderir.
-- URL ve webhook sırrı Vault'ta durur (scripts/setup-push.mjs yazar); repoya/migration'a girmez.

create extension if not exists pg_net with schema extensions;

-- Sipariş özeti + hedef abonelikler. YALNIZ service_role çağırır (dosya sonundaki revoke).
create function public.ready_push_targets(p_order_id uuid) returns jsonb
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
                         'id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth,
                         'locale', p.locale)
                       order by ps.created_at), '[]'::jsonb)
                from public.push_subscriptions ps
                join public.profiles p on p.id = ps.user_id
                where p.is_active
                  and p.role in ('waiter', 'admin')
                  and public.is_on_duty(p.on_duty_since)));
$$;

-- Trigger: Vault'ta URL/sır yoksa sessizce çıkar. Push hattındaki hiçbir hata siparişi "hazır"
-- yapma işlemini bozmaz (yalnız uyarı loglanır). İstek, işlem commit olunca kuyruğa düşer.
create function internal.notify_ready() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_url text;
  v_secret text;
begin
  select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 'notify_ready_url';
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds where ds.name = 'notify_ready_webhook_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('order_id', new.id),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-secret', v_secret),
    timeout_milliseconds := 5000);
  return null;
exception when others then
  raise warning 'notify_ready: %', sqlerrm;
  return null;
end $$;

create trigger orders_notify_ready after update of status on public.orders
  for each row when (new.status = 'ready' and old.status is distinct from 'ready')
  execute function internal.notify_ready();

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;

-- KURAL: ready_push_targets toplu grant'tan SONRA daraltılır — yalnız service_role.
-- Bundan sonraki bir migration "grant execute on all functions in schema public to authenticated"
-- kullanırsa bu iki satırı da tekrar etmelidir (supabase/tests/push.test.ts ilk testi yakalar).
revoke execute on function public.ready_push_targets(uuid) from public, anon, authenticated;
grant execute on function public.ready_push_targets(uuid) to service_role;
