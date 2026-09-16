-- Fiş düzeni: her kalemin karşısında tek fiyat (satır toplamı) ve altta Gesamtbetrag.
-- Yük (`print_jobs.payload`) her kaleme `priceCents` = unit_price_cents × quantity ekler.
-- STORNO yükü fiyat taşımaz (iptal fişinde toplam basılmaz). Eski işlerde alan yoktur;
-- `renderTicket` o durumda fiyat sütununu ve toplamı hiç basmaz.

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
               'groups',     internal.option_groups_for_ticket(i.selected_options),
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

create or replace function public.enqueue_test_print() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles;
begin
  v_me := internal.require_role('admin');
  insert into public.print_jobs (type, payload, created_by)
  select 'test', jsonb_build_object(
      'kind', 'test', 'header', s.ticket_header, 'footer', s.ticket_footer, 'table', 'Tisch 12',
      'orderNo', 0, 'round', 1, 'createdAt', now(), 'waiter', v_me.display_name, 'note', 'Testdruck',
      'settings', jsonb_build_object('host', s.printer_host, 'port', s.printer_port,
                                     'codepage', s.printer_codepage, 'codepageNumber', s.printer_codepage_number,
                                     'transliterate', s.printer_transliterate),
      'sampleLine', 'ÄÖÜ äöü ß · Şş Ğğ İı Çç · 0123456789 · #*-+ · €',
      'items', jsonb_build_array(
        jsonb_build_object('qty', 2, 'code', '05', 'name', 'Drehspieß Sandwich', 'isBeverage', false,
          'variant', 'Kalb', 'without', jsonb_build_array('Zwiebeln', 'Tomaten'),
          'groups', jsonb_build_array(
            jsonb_build_object('label', 'Soße', 'format', 'label_values', 'values', jsonb_build_array('Knoblauch', 'Kräuter')),
            jsonb_build_object('label', 'Schärfe', 'format', 'values_only', 'values', jsonb_build_array('scharf (Chili)')),
            jsonb_build_object('label', 'Extras', 'format', 'plus_each', 'values', jsonb_build_array('Extra Weichkäse'))),
          'note', 'Soße extra', 'priceCents', 1700),
        jsonb_build_object('qty', 1, 'code', '59', 'name', 'Kuzu Şiş', 'isBeverage', false, 'variant', null,
          'without', '[]'::jsonb,
          'groups', jsonb_build_array(jsonb_build_object('label', 'Beilage', 'format', 'values_only',
                                                         'values', jsonb_build_array('Reis'))),
          'note', null, 'priceCents', 1890),
        jsonb_build_object('qty', 3, 'code', null, 'name', 'Cola 0,33 l', 'isBeverage', true, 'variant', null,
          'without', '[]'::jsonb, 'groups', '[]'::jsonb, 'note', null, 'priceCents', 900))),
    v_me.id
  from public.settings s;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
