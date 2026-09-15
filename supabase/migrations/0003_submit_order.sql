-- 0003 — sipariş oluşturma ve fiş payload'u (spec §6.1, §6.2, §7)

create function internal.option_groups_for_ticket(p_selected jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select coalesce(jsonb_agg(g.obj order by g.gsort), '[]'::jsonb)
  from (
    select min((e->>'group_sort')::int) as gsort,
           jsonb_build_object(
             'label',  min(e->>'group_name_de'),
             'format', min(e->>'ticket_format'),
             'values', jsonb_agg(e->>'name_de' order by x.ord)) as obj
    from jsonb_array_elements(p_selected) with ordinality as x(e, ord)
    group by e->>'group_id'
  ) g;
$$;

create function internal.build_order_payload(p_order_id uuid, p_kind text) returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'kind',      p_kind,
    'header',    s.ticket_header,
    'footer',    s.ticket_footer,
    'table',     t.name,
    'orderNo',   o.order_no,
    'round',     o.round_no,
    'createdAt', o.created_at,
    'waiter',    w.display_name,
    'note',      o.note,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
               'qty',        i.quantity,
               'code',       i.product_code,
               'name',       i.product_name,
               'isBeverage', i.is_beverage,
               'variant',    i.variant_name_de,
               'without',    (select coalesce(jsonb_agg(r->>'name_de'), '[]'::jsonb)
                              from jsonb_array_elements(i.removed_ingredients) r),
               'groups',     internal.option_groups_for_ticket(i.selected_options),
               'note',       i.note)
             order by i.is_beverage, i.category_sort, i.sort)
      from public.order_items i
      where i.order_id = o.id and i.status = 'active'), '[]'::jsonb))
  from public.orders o
  join public.table_sessions ts on ts.id = o.session_id
  join public.dining_tables t   on t.id = ts.table_id
  join public.profiles w        on w.id = o.waiter_id
  cross join public.settings s
  where o.id = p_order_id;
$$;

create function public.submit_order(p_order_id uuid, p_table_id uuid, p_items jsonb, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me       public.profiles;
  v_existing public.orders;
  v_table    public.dining_tables;
  v_session  public.table_sessions;
  v_product  public.products;
  v_cat      public.categories;
  v_variant  public.product_variants;
  v_group    record;
  v_item     jsonb;
  v_bdate    date;
  v_order_no int;
  v_round    int;
  v_qty      int;
  v_unit     int;
  v_delta    int;
  v_cnt      int;
  v_excl     int;
  v_total    int := 0;
  v_sort     int := 0;
  v_opt_ids  uuid[];
  v_ing_ids  uuid[];
  v_options  jsonb;
  v_removed  jsonb;
  v_type     public.print_job_type;
begin
  v_me := internal.require_role('admin', 'waiter');

  -- idempotency: aynı id tekrar gelirse mevcut sonucu döndür
  select * into v_existing from public.orders o where o.id = p_order_id;
  if found then
    if v_existing.waiter_id <> v_me.id then perform internal.fail('order_id_conflict'); end if;
    return jsonb_build_object(
      'order_id', v_existing.id, 'order_no', v_existing.order_no, 'round_no', v_existing.round_no,
      'session_id', v_existing.session_id, 'duplicate', true,
      'total_cents', (select coalesce(sum(i.unit_price_cents * i.quantity), 0)
                      from public.order_items i where i.order_id = v_existing.id and i.status = 'active'));
  end if;

  select * into v_table from public.dining_tables t where t.id = p_table_id for update;
  if not found or not v_table.is_active then perform internal.fail('table_inactive'); end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform internal.fail('empty_order');
  end if;
  if jsonb_array_length(p_items) > 50 then perform internal.fail('too_many_items'); end if;
  if length(coalesce(p_note, '')) > 500 then perform internal.fail('note_too_long'); end if;

  -- masa satırı kilitli: oturum bul ya da aç
  select * into v_session from public.table_sessions s where s.table_id = p_table_id and s.status = 'open';
  if not found then
    insert into public.table_sessions (table_id, opened_by) values (p_table_id, v_me.id) returning * into v_session;
    perform internal.audit('session_open', 'table_session', v_session.id::text, jsonb_build_object('table', v_table.name));
  end if;
  select count(*) + 1 into v_round from public.orders o where o.session_id = v_session.id;

  v_bdate := public.business_date(now());
  insert into public.daily_counters as d (business_date, last_order_no) values (v_bdate, 1)
  on conflict (business_date) do update set last_order_no = d.last_order_no + 1
  returning d.last_order_no into v_order_no;

  insert into public.orders (id, session_id, waiter_id, business_date, order_no, round_no, note)
  values (p_order_id, v_session.id, v_me.id, v_bdate, v_order_no, v_round, nullif(btrim(p_note), ''));

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_sort := v_sort + 1;
    v_qty := coalesce((v_item->>'quantity')::int, 0);
    if v_qty < 1 or v_qty > 99 then perform internal.fail('quantity_invalid'); end if;

    select * into v_product from public.products p where p.id = (v_item->>'product_id')::uuid;
    if not found or not v_product.is_active or v_product.archived_at is not null then
      perform internal.fail('product_unavailable', v_item->>'product_id');
    end if;
    if v_product.is_sold_out then perform internal.fail('product_sold_out', v_product.id::text); end if;
    select * into v_cat from public.categories c where c.id = v_product.category_id;

    -- varyant → taban fiyat
    v_variant := null;
    if exists (select 1 from public.product_variants pv where pv.product_id = v_product.id and pv.is_active) then
      if nullif(v_item->>'variant_id', '') is null then perform internal.fail('variant_required', v_product.id::text); end if;
      select * into v_variant from public.product_variants pv
      where pv.id = (v_item->>'variant_id')::uuid and pv.product_id = v_product.id and pv.is_active;
      if not found then perform internal.fail('variant_invalid', v_product.id::text); end if;
      v_unit := v_variant.price_cents;
    else
      if nullif(v_item->>'variant_id', '') is not null then perform internal.fail('variant_invalid', v_product.id::text); end if;
      if v_product.base_price_cents is null then perform internal.fail('product_unavailable', v_product.id::text); end if;
      v_unit := v_product.base_price_cents;
    end if;

    -- seçenekler: ürüne bağlı aktif gruplara ait, tekrar etmeyen aktif seçenekler
    v_opt_ids := coalesce(array(select jsonb_array_elements_text(coalesce(v_item->'option_ids', '[]'::jsonb))::uuid), '{}');
    if cardinality(v_opt_ids) <> (select count(distinct x) from unnest(v_opt_ids) x)
       or exists (select 1 from unnest(v_opt_ids) as u(oid)
                  where not exists (
                    select 1 from public.options o
                    join public.option_groups g on g.id = o.group_id and g.is_active
                    join public.product_option_groups pog on pog.group_id = g.id and pog.product_id = v_product.id
                    where o.id = u.oid and o.is_active)) then
      perform internal.fail('option_invalid', v_product.id::text);
    end if;
    for v_group in
      select g.id, g.min_select, g.max_select
      from public.product_option_groups pog
      join public.option_groups g on g.id = pog.group_id and g.is_active
      where pog.product_id = v_product.id
    loop
      select count(*), count(*) filter (where o.is_exclusive) into v_cnt, v_excl
      from public.options o where o.group_id = v_group.id and o.id = any (v_opt_ids);
      if v_cnt < v_group.min_select then perform internal.fail('option_group_min', v_group.id::text); end if;
      if v_cnt > v_group.max_select then perform internal.fail('option_group_max', v_group.id::text); end if;
      if v_excl > 0 and v_cnt > 1 then perform internal.fail('option_exclusive_conflict', v_group.id::text); end if;
    end loop;
    select coalesce(jsonb_agg(jsonb_build_object(
             'group_id', g.id, 'group_name_de', g.name_de, 'group_name_tr', g.name_tr,
             'ticket_format', g.ticket_format, 'group_sort', pog.sort,
             'option_id', o.id, 'name_de', o.name_de, 'name_tr', o.name_tr,
             'price_delta_cents', o.price_delta_cents) order by pog.sort, o.sort), '[]'::jsonb),
           coalesce(sum(o.price_delta_cents), 0)
    into v_options, v_delta
    from public.options o
    join public.option_groups g on g.id = o.group_id
    join public.product_option_groups pog on pog.group_id = g.id and pog.product_id = v_product.id
    where o.id = any (v_opt_ids);
    v_unit := v_unit + v_delta;

    -- çıkarılan malzemeler (ürüne bağlı olmalı)
    v_ing_ids := coalesce(array(select jsonb_array_elements_text(
                   coalesce(v_item->'removed_ingredient_ids', '[]'::jsonb))::uuid), '{}');
    if exists (select 1 from unnest(v_ing_ids) as u(iid)
               where not exists (select 1 from public.product_ingredients pi
                                 where pi.product_id = v_product.id and pi.ingredient_id = u.iid)) then
      perform internal.fail('ingredient_invalid', v_product.id::text);
    end if;
    select coalesce(jsonb_agg(jsonb_build_object('id', i.id, 'name_de', i.name_de, 'name_tr', i.name_tr)
                              order by pi.sort), '[]'::jsonb)
    into v_removed
    from public.product_ingredients pi join public.ingredients i on i.id = pi.ingredient_id
    where pi.product_id = v_product.id and pi.ingredient_id = any (v_ing_ids);

    if length(coalesce(v_item->>'note', '')) > 200 then perform internal.fail('note_too_long'); end if;

    insert into public.order_items (
      order_id, product_id, category_sort, is_beverage, product_code, product_name,
      variant_id, variant_name_de, variant_name_tr, unit_price_cents, quantity,
      removed_ingredients, selected_options, note, sort)
    values (
      p_order_id, v_product.id, v_cat.sort, v_cat.is_beverage, v_product.code, v_product.name,
      v_variant.id, v_variant.name_de, v_variant.name_tr, v_unit, v_qty,
      v_removed, v_options, nullif(btrim(v_item->>'note'), ''), v_sort);
    v_total := v_total + v_unit * v_qty;
  end loop;

  v_type := case when v_round = 1 then 'order' else 'addition' end;
  insert into public.print_jobs (type, order_id, session_id, payload, created_by)
  values (v_type, p_order_id, v_session.id, internal.build_order_payload(p_order_id, v_type::text), v_me.id);

  perform internal.audit('order_submit', 'order', p_order_id::text, jsonb_build_object(
    'table', v_table.name, 'order_no', v_order_no, 'round', v_round, 'total_cents', v_total));

  return jsonb_build_object('order_id', p_order_id, 'order_no', v_order_no, 'round_no', v_round,
                            'session_id', v_session.id, 'total_cents', v_total, 'duplicate', false);
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
