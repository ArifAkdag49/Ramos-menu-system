import { sql } from './sql';

export interface Fixtures {
  tableId: string; table2Id: string; doenerId: string; variantH: string; variantK: string;
  ingZwiebeln: string; ingTomaten: string; sauceGroupId: string; sauceA: string; sauceB: string;
  sauceOhne: string; extraCheese: string; colaId: string; soldOutId: string;
}

const one = async (q: string) => (await sql<{ id: string }>(q))[0]!.id;

/**
 * Fikstürler canlı veritabanında **pasif** (`is_active = false`) durur: müşteri sunumunda ve
 * gerçek işletmede "Test Yemek"/"T05"/"Test-Tisch" garson, mutfak ve admin ekranlarına düşmesin
 * (Görev D kararı — silme yok, gizleme var). Bu yüzden `ensureFixtures()` her koşuda kategori,
 * ürün ve masa satırlarını **yeniden etkinleştirir** (`do update set is_active = true`); koşunun
 * sonunda `hideFixtures()` onları tekrar gizler. `submit_order` pasif ürünü reddettiği için
 * (`0003_submit_order.sql:123`) gizleme asla koşunun ortasında çalıştırılmaz.
 */
export async function ensureFixtures(): Promise<Fixtures> {
  await sql(`
    insert into public.dining_tables (name, sort) values ('Test-Tisch', 900), ('Test-Tisch-2', 901)
      on conflict (name) do update set is_active = true;
    insert into public.categories (slug, name_de, name_tr, sort) values ('test-food', 'Test Essen', 'Test Yemek', 900)
      on conflict (slug) do update set is_active = true;
    insert into public.categories (slug, name_de, sort, is_beverage) values ('test-drinks', 'Test Getränke', 999, true)
      on conflict (slug) do update set is_active = true;
    insert into public.ingredients (slug, name_de, name_tr) values
      ('test-zwiebeln', 'Zwiebeln', 'Soğan'), ('test-tomaten', 'Tomaten', 'Domates')
      on conflict (slug) do update set is_active = true;
    insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
      values ('test-sosse', 'Test Soße', 'Soße', 'Sos', 1, 2, 'label_values', 1),
             ('test-extras', 'Test Extras', 'Extras', 'Ekstralar', 0, 2, 'plus_each', 2)
      on conflict (slug) do update set is_active = true;
    -- Başka spec'lerin (admin-menu: 'test-schaerfe') bıraktığı fikstür grupları da geri açılır.
    update public.option_groups set is_active = true where slug like 'test-%' and not is_active;
  `);
  const sauceGroupId = await one(`select id from public.option_groups where slug = 'test-sosse'`);
  const extrasGroupId = await one(`select id from public.option_groups where slug = 'test-extras'`);
  if ((await sql(`select 1 from public.options where group_id = '${sauceGroupId}'`)).length === 0) {
    await sql(`
      insert into public.options (group_id, name_de, name_tr, sort, is_exclusive) values
        ('${sauceGroupId}', 'Knoblauch', 'Sarımsaklı', 1, false),
        ('${sauceGroupId}', 'Kräuter', 'Otlu', 2, false),
        ('${sauceGroupId}', 'ohne Soße', 'Sossuz', 3, true);
      insert into public.options (group_id, name_de, name_tr, price_delta_cents, sort) values
        ('${extrasGroupId}', 'Extra Weichkäse', 'Ekstra beyaz peynir', 100, 1);`);
  }
  await sql(`
    insert into public.products (slug, category_id, code, name, sort)
      select 'test-doener', id, 'T05', 'Test Drehspieß Sandwich', 1 from public.categories where slug = 'test-food'
      on conflict (slug) do update set is_active = true, archived_at = null;
    insert into public.products (slug, category_id, code, name, base_price_cents, sort)
      select 'test-cola', id, null, 'Test Cola 0,33 l', 250, 1 from public.categories where slug = 'test-drinks'
      on conflict (slug) do update set is_active = true, archived_at = null;
    insert into public.products (slug, category_id, code, name, base_price_cents, is_sold_out, sort)
      select 'test-soldout', id, 'T99', 'Test Ausverkauft', 500, true, 2 from public.categories where slug = 'test-food'
      on conflict (slug) do update set is_active = true, archived_at = null;
  `);
  const doenerId = await one(`select id from public.products where slug = 'test-doener'`);
  if ((await sql(`select 1 from public.product_variants where product_id = '${doenerId}'`)).length === 0) {
    await sql(`
      insert into public.product_variants (product_id, name_de, name_tr, price_cents, is_default, sort) values
        ('${doenerId}', 'Hähnchen', 'Tavuk', 750, true, 1), ('${doenerId}', 'Kalb', 'Dana', 850, false, 2);
      insert into public.product_ingredients (product_id, ingredient_id, sort)
        select '${doenerId}', id, row_number() over (order by slug) from public.ingredients
        where slug in ('test-tomaten', 'test-zwiebeln');
      insert into public.product_option_groups (product_id, group_id, sort) values
        ('${doenerId}', '${sauceGroupId}', 1), ('${doenerId}', '${extrasGroupId}', 2);`);
  }
  return {
    tableId: await one(`select id from public.dining_tables where name = 'Test-Tisch'`),
    table2Id: await one(`select id from public.dining_tables where name = 'Test-Tisch-2'`),
    doenerId,
    variantH: await one(`select id from public.product_variants where product_id = '${doenerId}' and name_de = 'Hähnchen'`),
    variantK: await one(`select id from public.product_variants where product_id = '${doenerId}' and name_de = 'Kalb'`),
    ingZwiebeln: await one(`select id from public.ingredients where slug = 'test-zwiebeln'`),
    ingTomaten: await one(`select id from public.ingredients where slug = 'test-tomaten'`),
    sauceGroupId,
    sauceA: await one(`select id from public.options where group_id = '${sauceGroupId}' and name_de = 'Knoblauch'`),
    sauceB: await one(`select id from public.options where group_id = '${sauceGroupId}' and name_de = 'Kräuter'`),
    sauceOhne: await one(`select id from public.options where group_id = '${sauceGroupId}' and is_exclusive`),
    extraCheese: await one(`select id from public.options where group_id = '${extrasGroupId}'`),
    colaId: await one(`select id from public.products where slug = 'test-cola'`),
    soldOutId: await one(`select id from public.products where slug = 'test-soldout'`),
  };
}

/** Test masalarına ait sipariş/oturum/fiş verisini siler (yalnız testler için; uygulama asla silmez). */
export async function cleanupFixtureOrders(): Promise<void> {
  await sql(`
    with s as (select ts.id from public.table_sessions ts join public.dining_tables t on t.id = ts.table_id
               where t.name like 'Test-Tisch%')
    , o as (select id from public.orders where session_id in (select id from s))
    , pj as (delete from public.print_jobs where order_id in (select id from o) or session_id in (select id from s))
    , oi as (delete from public.order_items where order_id in (select id from o))
    select 1;
    delete from public.orders where session_id in (select ts.id from public.table_sessions ts
      join public.dining_tables t on t.id = ts.table_id where t.name like 'Test-Tisch%');
    delete from public.table_sessions where table_id in (select id from public.dining_tables where name like 'Test-Tisch%');
    delete from public.print_jobs where type = 'test' and created_by in (select id from public.profiles where username like 'test-%');
    update public.products set is_sold_out = false where slug = 'test-doener';
  `);
}

/**
 * Fikstürleri tekrar gizler (silmez). Koşunun **sonunda** çağrılır: `cleanupFixtureOrders()` test
 * ortasında da çalıştığı için (ör. `lifecycle.test.ts` `beforeEach`) gizleme ondan kasıtlı olarak
 * ayrı tutuldu — `submit_order` pasif ürünü reddeder ve koşu ortasındaki gizleme testi düşürürdü.
 *
 * `test-rls` kategorisi de kapsanır (`rls.test.ts` onu kendi kurar; testin doğrulamaları rol
 * tabanlı RLS politikasına bakar, `is_active`'e değil — gizli kalması testi etkilemez).
 */
export async function hideFixtures(): Promise<void> {
  await sql(`
    update public.products set is_active = false where slug like 'test-%' and is_active;
    update public.categories set is_active = false where slug like 'test-%' and is_active;
    update public.dining_tables set is_active = false where name like 'Test-Tisch%' and is_active;
    update public.ingredients set is_active = false where slug like 'test-%' and is_active;
    update public.option_groups set is_active = false where slug like 'test-%' and is_active;
  `);
}
