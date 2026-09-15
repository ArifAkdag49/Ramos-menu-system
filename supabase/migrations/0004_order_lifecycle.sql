-- 0004 — sipariş yaşam döngüsü, masa, mesai, push, rapor (spec §3.5, §6, §8, §11.4)

create function internal.build_storno_payload(p_order_id uuid, p_item_ids uuid[], p_reason text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kind', 'storno', 'header', s.ticket_header, 'footer', s.ticket_footer,
    'table', t.name, 'orderNo', o.order_no, 'refOrderNo', o.order_no, 'round', o.round_no,
    'createdAt', now(), 'reason', p_reason, 'note', null,
    'waiter', (select p.display_name from public.profiles p where p.id = auth.uid()),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'qty', i.quantity, 'code', i.product_code, 'name', i.product_name,
               'isBeverage', i.is_beverage, 'variant', i.variant_name_de,
               'without', (select coalesce(jsonb_agg(r->>'name_de'), '[]'::jsonb)
                           from jsonb_array_elements(i.removed_ingredients) r),
               'groups', internal.option_groups_for_ticket(i.selected_options),
               'note', i.note)
             order by i.is_beverage, i.category_sort, i.sort)
      from public.order_items i where i.id = any (p_item_ids)), '[]'::jsonb))
  from public.orders o
  join public.table_sessions ts on ts.id = o.session_id
  join public.dining_tables t on t.id = ts.table_id
  cross join public.settings s
  where o.id = p_order_id;
$$;

create function public.cancel_order_item(p_item_id uuid, p_reason text) returns jsonb
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

  if not exists (select 1 from public.order_items i where i.order_id = v_order.id and i.status = 'active') then
    update public.orders set status = 'cancelled', cancelled_at = now() where id = v_order.id;
  end if;
  select o.status into v_status from public.orders o where o.id = v_order.id;

  perform internal.audit('item_cancel', 'order_item', p_item_id::text,
    jsonb_build_object('order_no', v_order.order_no, 'product', v_item.product_name,
                       'qty', v_item.quantity, 'reason', btrim(p_reason)));
  return jsonb_build_object('order_id', v_order.id, 'order_status', v_status);
end $$;

create function public.mark_order_ready(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_order public.orders;
begin
  v_me := internal.require_role('admin', 'kitchen');
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'in_kitchen' then perform internal.fail('order_not_in_kitchen'); end if;
  update public.orders set status = 'ready', ready_at = now(), ready_by = v_me.id where id = p_order_id;
  perform internal.audit('order_ready', 'order', p_order_id::text, jsonb_build_object('order_no', v_order.order_no));
end $$;

create function public.undo_order_ready(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_order public.orders;
begin
  perform internal.require_role('admin', 'kitchen');
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status <> 'ready' then perform internal.fail('order_not_ready'); end if;
  if v_order.ready_at < now() - interval '30 seconds' then perform internal.fail('undo_window_expired'); end if;
  update public.orders set status = 'in_kitchen', ready_at = null, ready_by = null where id = p_order_id;
  perform internal.audit('order_ready_undo', 'order', p_order_id::text, jsonb_build_object('order_no', v_order.order_no));
end $$;

create function public.mark_order_served(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_order public.orders;
begin
  v_me := internal.require_role('admin', 'waiter');
  select * into v_order from public.orders o where o.id = p_order_id for update;
  if not found or v_order.status not in ('in_kitchen', 'ready') then perform internal.fail('order_not_open'); end if;
  update public.orders set status = 'served', served_at = now(), served_by = v_me.id where id = p_order_id;
  perform internal.audit('order_served', 'order', p_order_id::text, jsonb_build_object('order_no', v_order.order_no));
end $$;

create function public.close_table_session(p_session_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_session public.table_sessions;
begin
  v_me := internal.require_role('admin', 'waiter');
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

create function public.move_table_session(p_session_id uuid, p_target_table_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  v_me public.profiles; v_session public.table_sessions;
  v_from public.dining_tables; v_to public.dining_tables;
begin
  v_me := internal.require_role('admin', 'waiter');
  select * into v_session from public.table_sessions s where s.id = p_session_id for update;
  if not found or v_session.status <> 'open' then perform internal.fail('session_closed'); end if;
  select * into v_to from public.dining_tables t where t.id = p_target_table_id for update;
  if not found or not v_to.is_active then perform internal.fail('table_inactive'); end if;
  if exists (select 1 from public.table_sessions s where s.table_id = p_target_table_id and s.status = 'open') then
    perform internal.fail('target_table_busy');
  end if;
  select * into v_from from public.dining_tables t where t.id = v_session.table_id;
  update public.table_sessions set table_id = p_target_table_id where id = p_session_id;
  insert into public.print_jobs (type, session_id, payload, created_by)
  select 'table_move', p_session_id, jsonb_build_object(
           'kind', 'table_move', 'header', s.ticket_header, 'footer', s.ticket_footer,
           'table', v_to.name, 'fromTable', v_from.name, 'toTable', v_to.name,
           'openOrderNos', (select coalesce(jsonb_agg(o.order_no order by o.order_no), '[]'::jsonb)
                            from public.orders o
                            where o.session_id = p_session_id and o.status in ('in_kitchen', 'ready')),
           'createdAt', now(), 'waiter', v_me.display_name, 'items', '[]'::jsonb),
         v_me.id
  from public.settings s;
  perform internal.audit('session_move', 'table_session', p_session_id::text,
    jsonb_build_object('from', v_from.name, 'to', v_to.name));
end $$;

create function public.set_product_sold_out(p_product_id uuid, p_sold_out boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('admin', 'kitchen');
  update public.products set is_sold_out = p_sold_out where id = p_product_id;
  if not found then perform internal.fail('product_not_found'); end if;
  perform internal.audit(case when p_sold_out then 'product_sold_out' else 'product_available' end,
                         'product', p_product_id::text, '{}'::jsonb);
end $$;

create function public.get_session_bill(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform internal.require_role('admin', 'waiter');
  with l as (
    select i.product_code, i.product_name, i.variant_name_de, i.variant_name_tr, i.unit_price_cents,
           (select coalesce(jsonb_agg(e->>'name_de' order by e->>'name_de'), '[]'::jsonb)
            from jsonb_array_elements(i.selected_options) e
            where (e->>'price_delta_cents')::int > 0) as extras,
           i.quantity, i.category_sort, i.sort, o.round_no
    from public.order_items i join public.orders o on o.id = i.order_id
    where o.session_id = p_session_id and i.status = 'active'
  ), g as (
    select product_code, product_name, variant_name_de, variant_name_tr, extras, unit_price_cents,
           sum(quantity)::int as quantity, min(category_sort) as cs, min(round_no * 1000 + sort) as fs
    from l group by product_code, product_name, variant_name_de, variant_name_tr, extras, unit_price_cents
  )
  select jsonb_build_object(
    'session_id', ts.id, 'table', t.name, 'opened_at', ts.opened_at,
    'lines', coalesce((select jsonb_agg(jsonb_build_object(
                 'product_code', g.product_code, 'product_name', g.product_name,
                 'variant_name_de', g.variant_name_de, 'variant_name_tr', g.variant_name_tr,
                 'extras', g.extras, 'unit_price_cents', g.unit_price_cents, 'quantity', g.quantity,
                 'line_total_cents', g.unit_price_cents * g.quantity) order by g.cs, g.fs) from g), '[]'::jsonb),
    'total_cents', coalesce((select sum(g.unit_price_cents * g.quantity) from g), 0))
  into v
  from public.table_sessions ts join public.dining_tables t on t.id = ts.table_id
  where ts.id = p_session_id;
  if v is null then perform internal.fail('session_not_found'); end if;
  return v;
end $$;

create function public.table_overview()
returns table (table_id uuid, name text, sort int, session_id uuid, opened_at timestamptz,
               opened_by_name text, total_cents bigint, orders_in_kitchen int, orders_ready int, failed_prints int)
language sql stable security definer set search_path = '' as $$
  select t.id, t.name, t.sort, s.id, s.opened_at, p.display_name,
         coalesce((select sum(i.unit_price_cents * i.quantity) from public.order_items i
                   join public.orders o on o.id = i.order_id
                   where o.session_id = s.id and i.status = 'active'), 0)::bigint,
         (select count(*) from public.orders o where o.session_id = s.id and o.status = 'in_kitchen')::int,
         (select count(*) from public.orders o where o.session_id = s.id and o.status = 'ready')::int,
         (select count(*) from public.print_jobs j where j.session_id = s.id and j.status = 'failed')::int
  from public.dining_tables t
  left join public.table_sessions s on s.table_id = t.id and s.status = 'open'
  left join public.profiles p on p.id = s.opened_by
  where t.is_active and public.has_role('admin', 'waiter', 'kitchen')
  order by t.sort, t.name;
$$;

create function public.set_on_duty(p_on boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles;
begin
  v_me := internal.require_role('admin', 'waiter');
  update public.profiles set on_duty_since = case when p_on then now() end where id = v_me.id;
  perform internal.audit(case when p_on then 'duty_on' else 'duty_off' end, 'profile', v_me.id::text, '{}'::jsonb);
  return jsonb_build_object('on_duty', p_on);
end $$;

create function public.set_my_locale(p_locale text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not public.is_active_staff() then perform internal.fail('not_authorized'); end if;
  if p_locale not in ('tr', 'de') then perform internal.fail('locale_invalid'); end if;
  update public.profiles set locale = p_locale where id = auth.uid();
end $$;

create function public.save_push_subscription(p_endpoint text, p_p256dh text, p_auth text, p_ua text)
returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles;
begin
  v_me := internal.require_role('admin', 'waiter', 'kitchen');
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, user_agent)
  values (v_me.id, p_endpoint, p_p256dh, p_auth, left(p_ua, 300))
  on conflict (endpoint) do update
    set user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
        user_agent = excluded.user_agent, created_at = now();
end $$;

create function public.delete_push_subscription(p_endpoint text) returns void
language sql security definer set search_path = '' as $$
  delete from public.push_subscriptions where endpoint = p_endpoint and user_id = auth.uid();
$$;

create function public.report_range(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform internal.require_role('admin');
  with o as (select * from public.orders where business_date between p_from and p_to),
       i as (select i.*, o.waiter_id, o.created_at as order_created
             from public.order_items i join o on o.id = i.order_id)
  select jsonb_build_object(
    'from', p_from, 'to', p_to,
    'orders', (select count(*) from o where o.status <> 'cancelled'),
    'items', (select coalesce(sum(quantity), 0) from i where status = 'active'),
    'value_cents', (select coalesce(sum(unit_price_cents * quantity), 0) from i where status = 'active'),
    'cancelled_items', (select coalesce(sum(quantity), 0) from i where status = 'cancelled'),
    'cancelled_value_cents', (select coalesce(sum(unit_price_cents * quantity), 0) from i where status = 'cancelled'),
    'by_waiter', (select coalesce(jsonb_agg(x order by x.value_cents desc), '[]'::jsonb) from (
        select p.display_name, count(distinct i.order_id) as orders,
               sum(i.unit_price_cents * i.quantity) as value_cents
        from i join public.profiles p on p.id = i.waiter_id
        where i.status = 'active' group by p.display_name) x),
    'top_products', (select coalesce(jsonb_agg(x order by x.qty desc), '[]'::jsonb) from (
        select product_code, product_name, sum(quantity) as qty, sum(unit_price_cents * quantity) as value_cents
        from i where status = 'active' group by product_code, product_name
        order by 3 desc limit 10) x),
    'by_hour', (select coalesce(jsonb_agg(x order by x.hour), '[]'::jsonb) from (
        select extract(hour from (order_created at time zone 'Europe/Berlin'))::int as hour,
               count(distinct order_id) as orders
        from i group by 1) x))
  into v;
  return v;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
