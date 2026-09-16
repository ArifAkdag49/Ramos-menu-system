-- 0004 düzeltme — masa kilidi (R41) ve teslim edilmiş siparişin otomatik iptali (R42)
-- R41: close_table_session yalnız oturum satırını kilitliyordu. submit_order masa satırını kilitli tutup
--      açık oturumu kilitsiz okuduğu için araya giren bir kapatma, kapanmış oturuma yeni bir in_kitchen
--      sipariş bağlanmasına izin veriyordu. Kilit sırası masa → oturum → siparişler olacak şekilde
--      masa satırı ilk iş olarak kilitlenir.
-- R42: spec §3.5 otomatik iptali yalnız in_kitchen/ready durumundan kabul eder; served sipariş served kalır.

create or replace function public.close_table_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_session public.table_sessions;
begin
  v_me := internal.require_role('admin', 'waiter');
  -- kilit sırası: önce masa (submit_order ile aynı sıra), sonra oturum
  perform 1 from public.dining_tables t
   where t.id = (select s.table_id from public.table_sessions s where s.id = p_session_id)
   for update;
  select * into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found or v_session.status <> 'open' then perform internal.fail('session_closed'); end if;
  if exists (select 1 from public.orders o where o.session_id = p_session_id and o.status = 'in_kitchen') then
    perform internal.fail('open_orders_in_kitchen');
  end if;
  update public.orders set status = 'served', served_at = now(), served_by = v_me.id
   where session_id = p_session_id and status = 'ready';
  update public.table_sessions set status = 'closed', closed_at = now(), closed_by = v_me.id where id = p_session_id;
  perform internal.audit('session_close', 'table_session', p_session_id::text, '{}'::jsonb);
end $$;

create or replace function public.cancel_order_item(p_item_id uuid, p_reason text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles; v_item public.order_items; v_order public.orders; v_session public.table_sessions;
  v_status public.order_status;
begin
  v_me := internal.require_role('admin', 'waiter');
  if nullif(btrim(coalesce(p_reason, '')), '') is null then perform internal.fail('reason_required'); end if;
  if length(p_reason) > 200 then perform internal.fail('reason_too_long'); end if;
  select * into v_item from public.order_items i where i.id = p_item_id for update;
  if not found then perform internal.fail('item_not_found'); end if;
  if v_item.status = 'cancelled' then perform internal.fail('item_already_cancelled'); end if;
  select * into v_order from public.orders o where o.id = v_item.order_id for update;
  select * into v_session from public.table_sessions s where s.id = v_order.session_id;
  if v_session.status <> 'open' then perform internal.fail('session_closed'); end if;

  update public.order_items
     set status = 'cancelled', cancel_reason = btrim(p_reason), cancelled_by = v_me.id, cancelled_at = now()
   where id = p_item_id;

  if v_order.status in ('in_kitchen', 'ready') then
    insert into public.print_jobs (type, order_id, session_id, payload, created_by)
    values ('storno', v_order.id, v_order.session_id,
            internal.build_storno_payload(v_order.id, array[p_item_id], btrim(p_reason)), v_me.id);
  end if;

  -- spec §3.5: otomatik iptal yalnız in_kitchen / ready durumundan olur (served sipariş served kalır)
  if v_order.status in ('in_kitchen', 'ready')
     and not exists (select 1 from public.order_items i where i.order_id = v_order.id and i.status = 'active') then
    update public.orders set status = 'cancelled', cancelled_at = now() where id = v_order.id;
  end if;
  select o.status into v_status from public.orders o where o.id = v_order.id;

  perform internal.audit('item_cancel', 'order_item', p_item_id::text,
    jsonb_build_object('order_no', v_order.order_no, 'product', v_item.product_name,
                       'qty', v_item.quantity, 'reason', btrim(p_reason)));
  return jsonb_build_object('order_id', v_order.id, 'order_status', v_status);
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
