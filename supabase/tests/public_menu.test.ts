import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';
import { ensureFixtures, hideFixtures, type Fixtures } from './helpers/fixtures';

// Müşteri QR menüsü (0011_public_menu.sql): anon anahtarıyla, girişsiz çağrılır.
// Fikstürler: ensureFixtures() (test-food / test-drinks) + bu dosyanın kendi test-pm-* satırları.
// Koşu sonunda hideFixtures() hepsini (slug like 'test-%') yeniden gizler.

type Variant = { name_de: string; name_tr: string | null; price_cents: number; sort: number };
type Product = {
  id: string; category_id: string; code: string | null; name: string; description: string | null;
  base_price_cents: number | null; image_path: string | null; allergens: string | null;
  is_sold_out: boolean; sort: number; variants: Variant[];
};
type Category = {
  id: string; name_de: string; name_tr: string | null; name_en: string | null; name_ar: string | null;
  is_beverage: boolean; sort: number;
};
type Menu = { restaurant_name: string; allergen_legend: unknown[]; categories: Category[]; products: Product[] };

let fx: Fixtures;
let menu: Menu;
const ids: Record<string, string> = {};

const callMenu = async (): Promise<Menu> => {
  const res = await fetch(`${process.env.SUPABASE_URL}/rest/v1/rpc/public_menu`, {
    method: 'POST',
    headers: { apikey: process.env.SUPABASE_ANON_KEY!, 'Content-Type': 'application/json' },
    body: '{}',
  });
  expect(res.status).toBe(200);
  return (await res.json()) as Menu;
};

beforeAll(async () => {
  fx = await ensureFixtures();
  await sql(`
    -- Aktif ama görünür ürünü olmayan kategori (içinde yalnız pasif + arşivli ürün var).
    insert into public.categories (slug, name_de, sort) values ('test-pm-empty', 'Test PM Leer', 950)
      on conflict (slug) do update set is_active = true;
    -- Pasif kategori, içinde aktif ürün.
    insert into public.categories (slug, name_de, sort, is_active) values ('test-pm-hidden', 'Test PM Versteckt', 951, false)
      on conflict (slug) do update set is_active = false;
    insert into public.products (slug, category_id, code, name, base_price_cents, sort, is_active)
      select 'test-pm-inactive', id, 'T81', 'Test PM Pasiv', 100, 1, false from public.categories where slug = 'test-pm-empty'
      on conflict (slug) do update set is_active = false, archived_at = null;
    insert into public.products (slug, category_id, code, name, base_price_cents, sort, archived_at)
      select 'test-pm-archived', id, 'T82', 'Test PM Archiviert', 100, 2, now() from public.categories where slug = 'test-pm-empty'
      on conflict (slug) do update set is_active = true, archived_at = now();
    insert into public.products (slug, category_id, code, name, base_price_cents, sort)
      select 'test-pm-in-hidden', id, 'T83', 'Test PM In Versteckt', 100, 1 from public.categories where slug = 'test-pm-hidden'
      on conflict (slug) do update set is_active = true, archived_at = null;
  `);
  for (const r of await sql<{ slug: string; id: string }>(`
    select slug, id from public.products where slug like 'test-pm-%'
    union all select slug, id from public.categories where slug like 'test-%'`)) ids[r.slug] = r.id;
  menu = await callMenu();
});

afterAll(async () => {
  await hideFixtures();
});

describe('public_menu (müşteri QR menüsü)', () => {
  it('üst düzey biçim: restoran adı, alerjen lejantı, kategori ve ürün dizileri', () => {
    expect(Object.keys(menu).sort()).toEqual(['allergen_legend', 'categories', 'products', 'restaurant_name']);
    expect(typeof menu.restaurant_name).toBe('string');
    expect(Array.isArray(menu.allergen_legend)).toBe(true);
    expect(Object.keys(menu.categories[0]!).sort())
      .toEqual(['id', 'is_beverage', 'name_ar', 'name_de', 'name_en', 'name_tr', 'sort']);
    expect(Object.keys(menu.products[0]!).sort()).toEqual([
      'allergens', 'base_price_cents', 'category_id', 'code', 'description', 'id', 'image_path', 'is_sold_out',
      'name', 'sort', 'variants']);
  });

  it('pasif ürün ve arşivli ürün görünmez; görünür ürünü olmayan kategori listelenmez', () => {
    const productIds = menu.products.map((p) => p.id);
    expect(productIds).not.toContain(ids['test-pm-inactive']);
    expect(productIds).not.toContain(ids['test-pm-archived']);
    expect(menu.categories.map((c) => c.id)).not.toContain(ids['test-pm-empty']);
  });

  it('pasif kategori ve içindeki (aktif) ürün görünmez', () => {
    expect(menu.categories.map((c) => c.id)).not.toContain(ids['test-pm-hidden']);
    expect(menu.products.map((p) => p.id)).not.toContain(ids['test-pm-in-hidden']);
  });

  it('aktif fikstür kategorileri ve ürünleri görünür; tükenen ürün is_sold_out: true ile döner', () => {
    const catIds = menu.categories.map((c) => c.id);
    expect(catIds).toContain(ids['test-food']);
    expect(catIds).toContain(ids['test-drinks']);
    expect(menu.categories.find((c) => c.id === ids['test-drinks'])!.is_beverage).toBe(true);
    const soldOut = menu.products.find((p) => p.id === fx.soldOutId);
    expect(soldOut).toBeDefined();
    expect(soldOut!.is_sold_out).toBe(true);
    expect(soldOut!.base_price_cents).toBe(500);
    const cola = menu.products.find((p) => p.id === fx.colaId)!;
    expect(cola.is_sold_out).toBe(false);
    expect(cola.variants).toEqual([]);
  });

  it('varyant adları ve fiyatları sort sırasıyla doğru', () => {
    const doener = menu.products.find((p) => p.id === fx.doenerId)!;
    expect(doener.code).toBe('T05');
    // sort değerleri admin sıralamasıyla yeniden numaralanabilir (1/2 → 10/20); sıra ve fiyatlar sabit.
    expect(doener.variants.map(({ name_de, name_tr, price_cents }) => ({ name_de, name_tr, price_cents }))).toEqual([
      { name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: 750 },
      { name_de: 'Kalb', name_tr: 'Dana', price_cents: 850 },
    ]);
    expect(doener.variants[0]!.sort).toBeLessThan(doener.variants[1]!.sort);
  });

  it('kategoriler sort sırasında; ürünler kategori sort + ürün sort sırasında', () => {
    const sorts = menu.categories.map((c) => c.sort);
    expect(sorts).toEqual([...sorts].sort((a, b) => a - b));
    const catSort = new Map(menu.categories.map((c) => [c.id, c.sort]));
    const keys = menu.products.map((p) => [catSort.get(p.category_id)!, p.sort] as const);
    for (let i = 1; i < keys.length; i++) {
      const [pc, ps] = keys[i - 1]!;
      const [cc, cs] = keys[i]!;
      expect(pc < cc || (pc === cc && ps <= cs), `sıra bozuk: indeks ${i}`).toBe(true);
    }
    // Her ürünün kategorisi listede.
    expect(menu.products.every((p) => catSort.has(p.category_id))).toBe(true);
  });
});
