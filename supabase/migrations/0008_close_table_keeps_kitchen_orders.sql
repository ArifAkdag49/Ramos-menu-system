-- Masa kapatma artık mutfakta hazırlanan sipariş yüzünden ENGELLENMEZ (işletme talebi, 17.09.2026).
--
-- Önceki kural (0004): `in_kitchen` sipariş varsa `open_orders_in_kitchen` hatası. Garson masayı
-- ancak siparişler hazır/teslim edildikten ya da iptal edildikten sonra kapatabiliyordu.
--
-- Yeni kural:
--   - `ready` siparişler eskisi gibi kapanışta `served` sayılır.
--   - `in_kitchen` siparişlere DOKUNULMAZ: mutfak ekranında kalır, mutfak hazırlamaya devam eder
--     (ör. paket servis, peşin ödenmiş sipariş). Mutfak HAZIR deyince garsonun Hazır listesine
--     düşer ve oradan teslim edilir — `mark_order_ready` / `mark_order_served` oturumun açık
--     olmasını zaten şart koşmaz, mutfak ekranı ve Hazır listesi oturumdan bağımsız sorgular.
--   - Sipariş iptal edilmez, fiş (STORNO) basılmaz, hiçbir kayıt silinmez.
-- Kilit sırası 0004_order_lifecycle_session_lock ile aynı: önce masa, sonra oturum.

create or replace function public.close_table_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles;
  v_session public.table_sessions;
  v_in_kitchen int;
begin
  v_me := internal.require_role('admin', 'waiter');
  perform 1 from public.dining_tables t
   where t.id = (select s.table_id from public.table_sessions s where s.id = p_session_id)
   for update;
  select * into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found or v_session.status <> 'open' then perform internal.fail('session_closed'); end if;

  select count(*)::int into v_in_kitchen
    from public.orders o where o.session_id = p_session_id and o.status = 'in_kitchen';

  update public.orders set status = 'served', served_at = now(), served_by = v_me.id
   where session_id = p_session_id and status = 'ready';
  update public.table_sessions set status = 'closed', closed_at = now(), closed_by = v_me.id where id = p_session_id;
  perform internal.audit('session_close', 'table_session', p_session_id::text,
    jsonb_build_object('orders_in_kitchen', v_in_kitchen));
end $$;

revoke execute on function public.close_table_session(uuid) from public, anon;
grant execute on function public.close_table_session(uuid) to authenticated, service_role;
