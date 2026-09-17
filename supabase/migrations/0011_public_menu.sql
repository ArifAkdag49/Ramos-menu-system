-- 0011 — Müşteri QR menüsü (girişsiz, salt okunur)
-- categories'e EN/AR adları + public.public_menu(): anon'un çağırabildiği TEK fonksiyon.
-- Tablolar anon'a KAPALI kalır; menü yalnız bu fonksiyonun döndürdüğü süzülmüş JSON ile okunur.
--
-- KURAL: Bundan sonraki bir migration toplu `revoke execute on all functions in schema public from public, anon`
-- satırını tekrarlarsa, dosyanın EN SONUNDA `grant execute on function public.public_menu() to anon, authenticated;`
-- satırını da tekrar etmelidir (0010'daki ready_push_targets kalıbı gibi). supabase/tests/anon.test.ts yakalar.

alter table public.categories
  add column name_en text,
  add column name_ar text;

update public.categories set name_en = 'Soups',                name_ar = 'شوربات'             where name_de = 'Suppen';
update public.categories set name_en = 'Breakfast',            name_ar = 'فطور'               where name_de = 'Frühstück';
update public.categories set name_en = 'Doner kebab',          name_ar = 'دونر كباب'          where name_de = 'Drehspieß';
update public.categories set name_en = 'Vegetarian & Falafel', name_ar = 'نباتي وفلافل'       where name_de = 'Vegetarisch & Falafel';
update public.categories set name_en = 'Side dishes',          name_ar = 'أطباق جانبية'       where name_de = 'Beilagen';
update public.categories set name_en = 'Lahmacun',             name_ar = 'لحم بعجين'          where name_de = 'Lahmacun';
update public.categories set name_en = 'Pide',                 name_ar = 'بيدا تركية'         where name_de = 'Pide';
update public.categories set name_en = 'Pizza',                name_ar = 'بيتزا'              where name_de = 'Pizza';
update public.categories set name_en = 'Calzone',              name_ar = 'كالزوني'            where name_de = 'Calzone';
update public.categories set name_en = 'Salads',               name_ar = 'سلطات'              where name_de = 'Salate';
update public.categories set name_en = 'Grilled dishes',       name_ar = 'مشويات'             where name_de = 'Grill Gerichte';
update public.categories set name_en = 'Grilled wraps (Dürüm)', name_ar = 'مشويات في خبز الصاج' where name_de = 'Grill im Dürüm';
update public.categories set name_en = 'Burgers',              name_ar = 'برغر'               where name_de = 'Burger';
update public.categories set name_en = 'Value meals',          name_ar = 'وجبات التوفير'      where name_de = 'Spar Menü';
update public.categories set name_en = 'Desserts',             name_ar = 'حلويات'             where name_de = 'Dessert';
update public.categories set name_en = 'Cold drinks',          name_ar = 'مشروبات باردة'      where name_de = 'Kalte Getränke';

-- Herkese açık menü. Dönen alanlar sözleşmedir (apps/web/src/features/publicMenu): iç alanlar
-- (slug, is_active, archived_at, malzemeler, seçim grupları, fiş/yazıcı ayarları) DÖNMEZ.
create or replace function public.public_menu() returns jsonb
language sql stable security definer set search_path = '' as $$
  with vis_products as (
    select p.*, c.sort as category_sort
    from public.products p
    join public.categories c on c.id = p.category_id
    where p.is_active and p.archived_at is null and c.is_active
  ),
  vis_categories as (
    select c.*
    from public.categories c
    where c.is_active and exists (select 1 from vis_products vp where vp.category_id = c.id)
  )
  select jsonb_build_object(
    'restaurant_name', (select s.restaurant_name from public.settings s order by s.id limit 1),
    'allergen_legend', coalesce((select s.allergen_legend from public.settings s order by s.id limit 1), '[]'::jsonb),
    'categories', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', c.id, 'name_de', c.name_de, 'name_tr', c.name_tr, 'name_en', c.name_en,
                            'name_ar', c.name_ar, 'is_beverage', c.is_beverage, 'sort', c.sort)
                          order by c.sort, c.name_de), '[]'::jsonb)
                   from vis_categories c),
    'products', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', p.id, 'category_id', p.category_id, 'code', p.code, 'name', p.name,
                          'description', p.description, 'base_price_cents', p.base_price_cents,
                          'image_path', p.image_path, 'allergens', p.allergens, 'is_sold_out', p.is_sold_out,
                          'sort', p.sort,
                          'variants', (select coalesce(jsonb_agg(jsonb_build_object(
                                                 'name_de', v.name_de, 'name_tr', v.name_tr,
                                                 'price_cents', v.price_cents, 'sort', v.sort)
                                               order by v.sort, v.price_cents), '[]'::jsonb)
                                       from public.product_variants v
                                       where v.product_id = p.id and v.is_active))
                        order by p.category_sort, p.sort, p.name), '[]'::jsonb)
                 from vis_products p)
  );
$$;

-- Toplu fonksiyon yetkileri (önceki migration'lardaki kalıp) + 0010'un daraltması.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;

revoke execute on function public.ready_push_targets(uuid) from public, anon, authenticated;
grant execute on function public.ready_push_targets(uuid) to service_role;

-- anon'un çağırabildiği TEK fonksiyon — toplu revoke'tan SONRA (bkz. dosya başındaki KURAL).
grant execute on function public.public_menu() to anon, authenticated;
