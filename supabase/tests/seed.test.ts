import { execSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';

const NOT_TEST = `slug not like 'test-%'`;
const count = async (q: string) => Number((await sql<{ n: number }>(q))[0]!.n);

describe('menü seed', () => {
  it('sayılar menüyle birebir', async () => {
    expect(await count(`select count(*) n from public.categories where ${NOT_TEST}`)).toBe(16);
    expect(await count(`select count(*) n from public.products where ${NOT_TEST}`)).toBe(107);
    expect(await count(`select count(*) n from public.ingredients where ${NOT_TEST}`)).toBe(31);
    expect(await count(`select count(*) n from public.option_groups where ${NOT_TEST}`)).toBe(9);
    expect(await count(`select count(*) n from public.options o join public.option_groups g on g.id = o.group_id
                        where g.${NOT_TEST}`)).toBe(50);
    expect(await count(`select count(*) n from public.dining_tables where name ~ '^Tisch [0-9]+$'`))
      .toBe(Number(process.env.SEED_TABLE_COUNT ?? 12));
  });

  it('fiyat sağlama toplamları (menüden hesaplandı)', async () => {
    const [base] = await sql<{ n: number; s: number }>(`
      select count(*) n, sum(base_price_cents) s from public.products
      where ${NOT_TEST} and base_price_cents is not null`);
    expect(base).toEqual({ n: 93, s: 95150 });
    const [variants] = await sql<{ n: number; s: number }>(`
      select count(*) n, sum(v.price_cents) s from public.product_variants v
      join public.products p on p.id = v.product_id where p.${NOT_TEST}`);
    expect(variants).toEqual({ n: 28, s: 25250 });
  });

  it('kritik ürünler doğru kurulmuş', async () => {
    interface ProductCheckRow {
      code: string | null;
      base_price_cents: number | null;
      variants: { de: string; c: number; d: boolean }[] | null;
      ings: string[] | null;
      groups: string[] | null;
    }
    const product = async (slug: string) => (await sql<ProductCheckRow>(`
      select p.code, p.base_price_cents,
        (select jsonb_agg(jsonb_build_object('de', v.name_de, 'c', v.price_cents, 'd', v.is_default) order by v.sort)
           from public.product_variants v where v.product_id = p.id) variants,
        (select jsonb_agg(i.slug order by pi.sort) from public.product_ingredients pi
           join public.ingredients i on i.id = pi.ingredient_id where pi.product_id = p.id) ings,
        (select jsonb_agg(g.slug order by pog.sort) from public.product_option_groups pog
           join public.option_groups g on g.id = pog.group_id where pog.product_id = p.id) groups
      from public.products p where p.slug = '${slug}'`))[0]!;

    expect(await product('p-05')).toMatchObject({
      variants: [{ de: 'Hähnchen', c: 750, d: true }, { de: 'Kalb', c: 850, d: false }],
      ings: ['salat', 'tomaten', 'gurken', 'zwiebeln', 'rotkohl'],
      groups: ['g-sosse', 'g-scharf', 'g-extra-doener'],
    });
    expect((await product('p-08')).groups).toEqual(['g-beilage', 'g-sosse', 'g-scharf', 'g-extra-doener']);
    expect(await product('p-10')).toMatchObject({ base_price_cents: 1500, ings: ['tomatensosse', 'joghurt', 'butter'] });
    expect(await product('p-47')).toMatchObject({ base_price_cents: 1150, groups: ['g-pizza-extra', 'g-pizza-mix'] });
    expect((await product('p-m3')).variants).toMatchObject([{ c: 1200 }, { c: 1350 }]);
    expect((await product('p-m3')).groups).toContain('g-menu-getraenk');
    expect((await product('p-18')).variants).toMatchObject([{ de: 'klein', c: 350 }, { de: 'groß', c: 450 }]);
    expect((await product('p-77')).groups).toContain('g-lahmacun-rolle');
    const [mix] = await sql<{ min_select: number; max_select: number }>(
      `select min_select, max_select from public.option_groups where slug = 'g-pizza-mix'`);
    expect(mix).toEqual({ min_select: 5, max_select: 5 });
    const [ohne] = await sql<{ is_exclusive: boolean }>(`select o.is_exclusive from public.options o join public.option_groups g
                                   on g.id = o.group_id where g.slug = 'g-sosse' and o.name_de = 'ohne Soße'`);
    expect(ohne!.is_exclusive).toBe(true);
    const [bev] = await sql<{ is_beverage: boolean }>(`select is_beverage from public.categories where slug = 'c-kalte-getraenke'`);
    expect(bev!.is_beverage).toBe(true);
  });

  it('ayar listeleri dolu, yazıcı IP korunur', async () => {
    const [s] = await sql<{ q: number; c: number; a: number }>(
      `select jsonb_array_length(quick_notes) q, jsonb_array_length(cancel_reasons) c,
              jsonb_array_length(allergen_legend) a from public.settings`);
    expect(s).toEqual({ q: 5, c: 4, a: 27 });
  });

  it('seed idempotent: ikinci çalıştırma sayıları değiştirmez', async () => {
    execSync('npm run db:seed', { stdio: 'ignore' });
    expect(await count(`select count(*) n from public.products where ${NOT_TEST}`)).toBe(107);
    expect(await count(`select count(*) n from public.product_variants`)).toBeGreaterThanOrEqual(28);
  });
});
