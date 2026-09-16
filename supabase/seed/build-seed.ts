import { writeFileSync } from 'node:fs';
import { CATEGORIES, GROUPS, INGREDIENTS, PRODUCTS, SETTINGS, TABLE_COUNT } from './menu-source';

const q = (v: string | null | undefined) => (v == null ? 'null' : `'${v.replace(/'/g, "''")}'`);
const j = (v: unknown) => `${q(JSON.stringify(v))}::jsonb`;
const out: string[] = ['-- ÜRETİLDİ: supabase/seed/build-seed.ts — elle düzenleme', 'begin;'];

if (PRODUCTS.length !== 107) throw new Error(`PRODUCTS 107 olmalı, ${PRODUCTS.length}`);

for (const c of CATEGORIES) out.push(`insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values (${q(c.slug)}, ${q(c.name_de)}, ${q(c.name_tr)}, ${c.sort}, ${c.is_beverage ?? false})
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;`);

for (const i of INGREDIENTS) out.push(`insert into public.ingredients (slug, name_de, name_tr)
  values (${q(i.slug)}, ${q(i.name_de)}, ${q(i.name_tr)})
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;`);

GROUPS.forEach((g, gi) => {
  out.push(`insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values (${q(g.slug)}, ${q(g.admin_label)}, ${q(g.name_de)}, ${q(g.name_tr)}, ${g.min}, ${g.max}, ${q(g.format)}, ${gi + 1})
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;`);
  g.options.forEach((o, oi) => out.push(`insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, ${q(o.name_de)}, ${q(o.name_tr)}, ${o.price_delta_cents ?? 0}, ${o.is_default ?? false},
      ${o.is_exclusive ?? false}, ${oi + 1} from public.option_groups where slug = ${q(g.slug)}
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;`));
});

PRODUCTS.forEach((p, pi) => {
  out.push(`insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select ${q(p.slug)}, id, ${q(p.code)}, ${q(p.name)}, ${q(p.description)}, ${p.variants ? 'null' : p.price},
      ${q(p.allergens)}, ${pi + 1} from public.categories where slug = ${q(p.category)}
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;`);
  const pid = `(select id from public.products where slug = ${q(p.slug)})`;
  p.variants?.forEach((v, vi) => out.push(`insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values (${pid}, ${q(v.name_de)}, ${q(v.name_tr)}, ${v.price_cents}, ${v.is_default ?? false}, ${vi + 1})
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;`));
  p.ingredients?.forEach((slug, ii) => out.push(`insert into public.product_ingredients (product_id, ingredient_id, sort)
    select ${pid}, id, ${ii + 1} from public.ingredients where slug = ${q(slug)}
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;`));
  p.groups?.forEach((slug, gi) => out.push(`insert into public.product_option_groups (product_id, group_id, sort)
    select ${pid}, id, ${gi + 1} from public.option_groups where slug = ${q(slug)}
    on conflict (product_id, group_id) do update set sort = excluded.sort;`));
});

for (let n = 1; n <= TABLE_COUNT; n++)
  out.push(`insert into public.dining_tables (name, sort) values ('Tisch ${n}', ${n}) on conflict (name) do nothing;`);

out.push(`update public.settings set restaurant_name = ${q(SETTINGS.restaurant_name)},
  ticket_header = ${q(SETTINGS.ticket_header)}, quick_notes = ${j(SETTINGS.quick_notes)},
  cancel_reasons = ${j(SETTINGS.cancel_reasons)}, allergen_legend = ${j(SETTINGS.allergen_legend)} where id = 1;`);
out.push('commit;');
writeFileSync('supabase/seed/seed.sql', out.join('\n') + '\n', 'utf8');
console.log(`seed.sql yazıldı: ${PRODUCTS.length} ürün`);
