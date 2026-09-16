-- 0004 düzeltme — report_range: by_hour da iptal edilen siparişleri saymaz (R39)
-- `orders`, `items` ve `value_cents` iptalleri dışarıda bırakırken `by_hour` hepsini sayıyordu.
-- Diğer tüm alanlar birebir aynıdır.

create or replace function public.report_range(p_from date, p_to date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform internal.require_role('admin');
  with o as (select * from public.orders where business_date between p_from and p_to),
       i as (select i.*, o.waiter_id, o.created_at as order_created, o.status as order_status
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
        from i where order_status <> 'cancelled' group by 1) x))
  into v;
  return v;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
