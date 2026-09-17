-- Serbest "ekstra ücret" (garson önerisi, 17.09.2026): menüde olmayan bir istek için garson ürün panelinde
-- açıklama + tutar yazar (ör. "ekstra peynir", 1,00 €). Seçeneklerdeki fiyat farkları gibi ADET BAŞINA
-- birim fiyata eklenir; böylece satır fiyatı, fiş Gesamtbetrag'ı, hesap özeti ve raporlar ekstrayı
-- ayrıca bir şey yapmadan sayar (hepsi unit_price_cents × quantity).
--
-- Kurallar (sunucuda zorunlu, istemci aynısını uygular — packages/shared/src/pricing.ts):
--   kalem başına en fazla 5 ekstra; açıklama kırpılmış 1–40 karakter (satır sonları boşluğa çevrilir);
--   tutar tam sayı sent, 1–5000 (0,01–50,00 €). İndirim / negatif tutar yok. Aksi hâlde `extra_charge_invalid`.
--   Alan hiç gönderilmezse (eski istemci) davranış değişmez.
--
-- Fiş: ekstralar mevcut `groups` biçimine (`plus_each`, etiket "Extra") eklenir → "+ ekstra peynir (+1,00)".
-- Restoranlarda kurulu yazdırma ajanlarının güncellenmesi gerekmez. Tutarda € işareti yok (kod sayfası).

alter table public.order_items
  add column extra_charges jsonb not null default '[]'::jsonb;

-- Fiş yükü için ekstra grubu (boşsa boş dizi).
create or replace function internal.extra_charges_for_ticket(p_extras jsonb) returns jsonb
language sql immutable set search_path = '' as $$
  select case
    when jsonb_array_length(coalesce(p_extras, '[]'::jsonb)) = 0 then '[]'::jsonb
    else jsonb_build_array(jsonb_build_object(
      'label', 'Extra',
      'format', 'plus_each',
      'values', (select jsonb_agg(format('%s (+%s)', e->>'label',
                                         replace(to_char((e->>'cents')::int / 100.0, 'FM999990.00'), '.', ','))
                                  order by x.ord)
                 from jsonb_array_elements(p_extras) with ordinality as x(e, ord))))
  end;
$$;

create or replace function public.submit_order(p_order_id uuid, p_table_id uuid, p_items jsonb, p_note text default null)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_me        public.profiles;
  v_existing  public.orders;
  v_table     public.dining_tables;
  v_session   public.table_sessions;
  v_product   public.products;
  v_cat       public.categories;
  v_variant   public.product_variants;
  v_group     record;
  v_item      jsonb;
  v_bdate     date;
  v_order_no  int;
  v_round     int;
  v_qty       int;
  v_unit      int;
  v_delta     int;
  v_cnt       int;
  v_excl      int;
  v_total     int := 0;
  v_sort      int := 0;
  v_opt_ids   uuid[];
  v_ing_ids   uuid[];
  v_options   jsonb;
  v_removed   jsonb;
  v_type      public.print_job_type;
  v_extras    jsonb;
  v_extra     jsonb;
  v_extra_sum int;
  v_label     text;
  v_num       numeric;
begin
  v_me := internal.require_role('admin', 'waiter');

  -- R36: masa satırı idempotency kontrolünden ÖNCE kilitlenir.
  select * into v_table from public.dining_tables t where t.id = p_table_id for update;

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

  if v_table.id is null or not v_table.is_active then perform internal.fail('table_inactive'); end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    perform internal.fail('empty_order');
  end if;
  if jsonb_array_length(p_items) > 50 then perform internal.fail('too_many_items'); end if;
  if length(coalesce(p_note, '')) > 500 then perform internal.fail('note_too_long'); end if;

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

    -- serbest ekstra ücretler (0009): adet başına birim fiyata eklenir
    v_extras := '[]'::jsonb;
    v_extra_sum := 0;
    if coalesce(jsonb_typeof(v_item->'extra_charges'), 'null') <> 'null' then
      if jsonb_typeof(v_item->'extra_charges') <> 'array' or jsonb_array_length(v_item->'extra_charges') > 5 then
        perform internal.fail('extra_charge_invalid', v_product.id::text);
      end if;
      for v_extra in select * from jsonb_array_elements(v_item->'extra_charges') loop
        -- İç içe kontroller: SQL'de OR kısa devre garanti değil; tür doğrulanmadan ::numeric dönüşümü yapılmaz.
        if jsonb_typeof(v_extra) <> 'object' or jsonb_typeof(v_extra->'cents') is distinct from 'number' then
          perform internal.fail('extra_charge_invalid', v_product.id::text);
        end if;
        v_label := btrim(regexp_replace(coalesce(v_extra->>'label', ''), '\s+', ' ', 'g'));
        v_num := (v_extra->>'cents')::numeric;
        if length(v_label) < 1 or length(v_label) > 40 or v_num <> trunc(v_num) or v_num < 1 or v_num > 5000 then
          perform internal.fail('extra_charge_invalid', v_product.id::text);
        end if;
        v_extras := v_extras || jsonb_build_array(jsonb_build_object('label', v_label, 'cents', v_num::int));
        v_extra_sum := v_extra_sum + v_num::int;
      end loop;
    end if;
    v_unit := v_unit + v_extra_sum;

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
      removed_ingredients, selected_options, extra_charges, note, sort)
    values (
      p_order_id, v_product.id, v_cat.sort, v_cat.is_beverage, v_product.code, v_product.name,
      v_variant.id, v_variant.name_de, v_variant.name_tr, v_unit, v_qty,
      v_removed, v_options, v_extras, nullif(btrim(v_item->>'note'), ''), v_sort);
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

-- Fiş yükü (0007 sürümü + ekstra grubu).
create or replace function internal.build_order_payload(p_order_id uuid, p_kind text) returns jsonb
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
               'groups',     internal.option_groups_for_ticket(i.selected_options)
                               || internal.extra_charges_for_ticket(i.extra_charges),
               'note',       i.note,
               'priceCents', i.unit_price_cents * i.quantity)
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

-- STORNO yükü (0004 sürümü + ekstra grubu; iptal fişinde fiyat basılmaz).
create or replace function internal.build_storno_payload(p_order_id uuid, p_item_ids uuid[], p_reason text) returns jsonb
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
               'groups', internal.option_groups_for_ticket(i.selected_options)
                           || internal.extra_charges_for_ticket(i.extra_charges),
               'note', i.note)
             order by i.is_beverage, i.category_sort, i.sort)
      from public.order_items i where i.id = any (p_item_ids)), '[]'::jsonb))
  from public.orders o
  join public.table_sessions ts on ts.id = o.session_id
  join public.dining_tables t on t.id = ts.table_id
  cross join public.settings s
  where o.id = p_order_id;
$$;

-- Hesap özeti (0004 sürümü): `extras` listesine serbest ekstralar tutarlarıyla eklenir.
create or replace function public.get_session_bill(p_session_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v jsonb;
begin
  perform internal.require_role('admin', 'waiter');
  with l as (
    select i.product_code, i.product_name, i.variant_name_de, i.variant_name_tr, i.unit_price_cents,
           (select coalesce(jsonb_agg(e->>'name_de' order by e->>'name_de'), '[]'::jsonb)
            from jsonb_array_elements(i.selected_options) e
            where (e->>'price_delta_cents')::int > 0)
           || (select coalesce(jsonb_agg(format('%s (+%s €)', x->>'label',
                                                replace(to_char((x->>'cents')::int / 100.0, 'FM999990.00'), '.', ','))
                                         order by y.ord), '[]'::jsonb)
               from jsonb_array_elements(i.extra_charges) with ordinality as y(x, ord)) as extras,
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

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
