import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';
import { anonClient, clientFor, ensureTestUsers, serviceClient } from './helpers/users';

// 0016 — İki yönlü menü eşitlemesi (menu_sync_clients + menu_sync_*). CANLI veritabanında koşar:
// - Testler KENDİ satırlarını açar: kategori `test-sync-cat` (PASİF: müşteri menüsüne ve personel
//   ekranlarına düşmez), ürünler `test-sync-%` slug'ıyla, istemciler `test-sync-%` adıyla. Hepsi
//   `afterAll` ile silinir.
// - Gerçek ürün/kategori/varyant satırlarına ve `settings`e (yazıcı adresi, print_route) ASLA dokunulmaz.
// - Bildirim (pg_net) Vault'ta URL/sır yoksa sessizce çıkar; testler yalnız seyreltme satırının
//   damgalandığını görür, dışarıya istek atılmaz.

let admin: SupabaseClient, waiter: SupabaseClient, kitchen: SupabaseClient;
let service: SupabaseClient;
let catId = '';
let p1 = '';
let p2 = '';
let v1 = '';
let vForeign = '';

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
type Client = { id: string; token: string };
type Product = {
  id: string; code: string | null; category_id: string; name: string; description: string | null;
  price_cents: number | null; is_sold_out: boolean; is_active: boolean; archived: boolean; sort: number;
  allergens: string | null; image_path: string | null; sync_updated_at: string;
  variants: { id: string; name_de: string; name_tr: string | null; price_cents: number; is_default: boolean;
              sort: number; is_active: boolean }[];
};
type Pull = { client: 'ok' | 'unknown'; now: string; categories: Record<string, unknown>[]; products: Product[] };
type PushItemResult = { index: number; ramos_id: string | null; status: string; variants?: number;
                        reason?: string; current?: Product };
type Push = { client: 'ok' | 'unknown'; now: string; results: PushItemResult[] };

const one = async (q: string) => (await sql<{ id: string }>(q))[0]!.id;

/** Test satırlarını siler (ürün → varyant cascade, kategori, istemciler). */
async function cleanup() {
  await sql(`
    delete from public.products where slug like 'test-sync-%';
    delete from public.categories where slug like 'test-sync-%';
    delete from public.menu_sync_clients where name like 'test-sync-%';
  `);
}

beforeAll(async () => {
  await ensureTestUsers();
  [admin, waiter, kitchen] = await Promise.all((['admin', 'waiter', 'kitchen'] as const).map(clientFor));
  service = serviceClient();
  await cleanup();
  // Kategori PASİF açılır: canlı menüde ve personel ekranlarında görünmez (public_menu aktif kategori ister).
  await sql(`
    insert into public.categories (slug, name_de, name_tr, sort, is_active)
    values ('test-sync-cat', 'Test Sync', 'Test Sync', 990, false);`);
  catId = await one(`select id from public.categories where slug = 'test-sync-cat'`);
  await sql(`
    insert into public.products (slug, category_id, code, name, description, base_price_cents, sort, is_active)
    values ('test-sync-p1', '${catId}', 'TSYNC1', 'Test Sync Ürün 1', 'ilk açıklama', 1000, 10, false),
           ('test-sync-p2', '${catId}', 'TSYNC2', 'Test Sync Ürün 2', null, 2000, 20, false);`);
  p1 = await one(`select id from public.products where slug = 'test-sync-p1'`);
  p2 = await one(`select id from public.products where slug = 'test-sync-p2'`);
  await sql(`
    insert into public.product_variants (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ('${p1}', 'Klein', 'Küçük', 500, true, 1), ('${p2}', 'Gross', 'Büyük', 900, true, 1);`);
  v1 = await one(`select id from public.product_variants where product_id = '${p1}'`);
  vForeign = await one(`select id from public.product_variants where product_id = '${p2}'`);
});

afterAll(async () => {
  await cleanup();
});

async function createClientRow(client: SupabaseClient, name: string): Promise<Client> {
  const { data, error } = await client.rpc('create_menu_sync_client', { p_name: name });
  if (error) throw error;
  return data as Client;
}

const pull = async (tokenHash: string, since: string | null = null, limit: number | null = null): Promise<Pull> => {
  const { data, error } = await service.rpc('menu_sync_pull',
    { p_token_hash: tokenHash, p_since: since, p_limit: limit });
  if (error) throw error;
  return data as Pull;
};

const push = async (tokenHash: string, items: unknown[]): Promise<Push> => {
  const { data, error } = await service.rpc('menu_sync_push', { p_token_hash: tokenHash, p_items: items });
  if (error) throw error;
  return data as Push;
};

const touch = async (tokenHash: string, err: string | null): Promise<string> => {
  const { data, error } = await service.rpc('menu_sync_touch', { p_token_hash: tokenHash, p_error: err });
  if (error) throw error;
  return data as string;
};

const stampOf = async (id: string): Promise<string> =>
  (await sql<{ s: string }>(`select sync_updated_at as s from public.products where id = '${id}'`))[0]!.s;

const productOf = (p: Pull, id: string) => p.products.find((x) => x.id === id);

describe('menü eşitlemesi — istemci kaydı (0016)', () => {
  it('admin istemci açar: düz anahtar yalnız yanıtta, DB\'de sha256; liste token_hash göstermez', async () => {
    const c = await createClientRow(admin, '  test-sync-panel  ');
    expect(c.token).toMatch(/^[0-9a-f]{64}$/);
    expect(Object.keys(c).sort()).toEqual(['id', 'token']);
    const [row] = await sql<{ name: string; token_hash: string; is_active: boolean }>(
      `select name, token_hash, is_active from public.menu_sync_clients where id = '${c.id}'`);
    expect(row).toEqual({ name: 'test-sync-panel', token_hash: sha256(c.token), is_active: true });

    const list = await admin.from('menu_sync_clients')
      .select('id, name, is_active, created_at, last_seen_at, last_error');
    expect(list.error).toBeNull();
    expect(list.data?.map((r) => r.id)).toContain(c.id);
    expect(JSON.stringify(list.data)).not.toContain(sha256(c.token));
    expect((await admin.from('menu_sync_clients').select('token_hash')).error).not.toBeNull();
    expect((await admin.from('menu_sync_clients').select('*')).error).not.toBeNull();

    const [audit] = await sql<{ n: number }>(`select count(*)::int as n from public.audit_log
                                              where action = 'menu_sync_client_create' and entity_id = '${c.id}'`);
    expect(audit!.n).toBe(1);
  });

  it('garson, mutfak ve anon istemci açamaz/göremez; ad doğrulanır', async () => {
    await createClientRow(admin, 'test-sync-gizli');
    for (const [who, c] of [['waiter', waiter], ['kitchen', kitchen]] as const) {
      expect((await c.rpc('create_menu_sync_client', { p_name: 'test-sync-x' })).error?.message, who)
        .toBe('not_authorized');
      expect((await c.rpc('revoke_menu_sync_client', { p_id: crypto.randomUUID() })).error?.message, who)
        .toBe('not_authorized');
      expect((await c.from('menu_sync_clients').select('id')).data ?? [], who).toEqual([]);
    }
    const anon = anonClient();
    expect((await anon.rpc('create_menu_sync_client', { p_name: 'test-sync-x' })).error?.code).toBe('42501');
    expect((await anon.from('menu_sync_clients').select('id')).data ?? []).toEqual([]);

    for (const name of ['', '   ', 'x'.repeat(61), null]) {
      expect((await admin.rpc('create_menu_sync_client', { p_name: name })).error?.message, JSON.stringify(name))
        .toBe('menu_sync_client_name_invalid');
    }
    const [n] = await sql<{ n: number }>(
      `select count(*)::int as n from public.menu_sync_clients where name = 'test-sync-x'`);
    expect(n!.n).toBe(0);
  });

  it('revoke: anahtar anında geçersiz; ikinci kez menu_sync_client_not_found', async () => {
    const c = await createClientRow(admin, 'test-sync-iptal');
    const hash = sha256(c.token);
    expect((await pull(hash)).client).toBe('ok');

    expect((await admin.rpc('revoke_menu_sync_client', { p_id: c.id })).error).toBeNull();
    expect((await admin.rpc('revoke_menu_sync_client', { p_id: c.id })).error?.message)
      .toBe('menu_sync_client_not_found');
    expect((await pull(hash)).client).toBe('unknown');
    expect((await push(hash, [])).client).toBe('unknown');
    expect(await touch(hash, null)).toBe('unknown');
    const [audit] = await sql<{ n: number }>(`select count(*)::int as n from public.audit_log
                                              where action = 'menu_sync_client_revoke' and entity_id = '${c.id}'`);
    expect(audit!.n).toBe(1);
  });

  it('menu_sync_* yalnız service_role: personel ve anon oturumlarına kapalı', async () => {
    const hash = sha256('x');
    for (const [who, c] of [['admin', admin], ['kitchen', kitchen], ['anon', anonClient()]] as const) {
      expect((await c.rpc('menu_sync_pull', { p_token_hash: hash, p_since: null, p_limit: 1 })).error?.code, who)
        .toBe('42501');
      expect((await c.rpc('menu_sync_push', { p_token_hash: hash, p_items: [] })).error?.code, who).toBe('42501');
      expect((await c.rpc('menu_sync_touch', { p_token_hash: hash, p_error: null })).error?.code, who).toBe('42501');
    }
    const grants = await sql<{ fn: string; anon: boolean; authenticated: boolean; service: boolean }>(`
      select p.oid::regprocedure::text as fn,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('service_role', p.oid, 'execute') as service
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname in ('menu_sync_pull', 'menu_sync_push', 'menu_sync_touch')`);
    expect(grants).toHaveLength(3);
    expect(grants.filter((g) => g.anon || g.authenticated || !g.service).map((g) => g.fn)).toEqual([]);
  });

  it('bilinmeyen anahtar: pull/push unknown (veri sızmaz), touch unknown', async () => {
    const hash = sha256(randomBytes(32).toString('hex'));
    const p = await pull(hash);
    expect(p).toEqual({ client: 'unknown', now: expect.any(String), categories: [], products: [] });
    expect(await push(hash, [{ ramos_id: p1, price_cents: 1, updated_at: new Date().toISOString() }]))
      .toEqual({ client: 'unknown', now: expect.any(String), results: [] });
    expect(await touch(hash, 'x')).toBe('unknown');
    const [row] = await sql<{ price: number }>(`select base_price_cents as price from public.products where id = '${p1}'`);
    expect(row!.price).toBe(1000);
  });

  it('touch: son görülme ve son hata yazılır', async () => {
    const c = await createClientRow(admin, 'test-sync-nabiz');
    expect(await touch(sha256(c.token), '  pull timeout  ')).toBe('ok');
    const [row] = await sql<{ seen: boolean; last_error: string | null }>(`
      select last_seen_at > now() - interval '1 minute' as seen, last_error
      from public.menu_sync_clients where id = '${c.id}'`);
    expect(row).toEqual({ seen: true, last_error: 'pull timeout' });
    expect(await touch(sha256(c.token), null)).toBe('ok');
    const [row2] = await sql<{ last_error: string | null }>(
      `select last_error from public.menu_sync_clients where id = '${c.id}'`);
    expect(row2!.last_error).toBeNull();
  });
});

describe('menü eşitlemesi — değişim damgası (0016)', () => {
  it('fiyat, ad, tükendi ve varyant fiyatı damgayı ileri atar; yalnız sıra değişince ATMAZ', async () => {
    const before = await stampOf(p1);
    await sql(`update public.products set sort = sort + 1 where id = '${p1}'`);
    expect(await stampOf(p1), 'sort').toBe(before);
    await sql(`update public.products set image_path = null where id = '${p1}'`);
    expect(await stampOf(p1), 'image_path').toBe(before);

    for (const [what, q] of [
      ['fiyat', `update public.products set base_price_cents = base_price_cents + 1 where id = '${p1}'`],
      ['ad', `update public.products set name = name || '.' where id = '${p1}'`],
      ['tükendi', `update public.products set is_sold_out = not is_sold_out where id = '${p1}'`],
      ['açıklama', `update public.products set description = 'ikinci açıklama' where id = '${p1}'`],
      ['varyant fiyatı', `update public.product_variants set price_cents = price_cents + 1 where id = '${v1}'`],
      ['varyant ekleme', `insert into public.product_variants (product_id, name_de, price_cents, sort)
                          values ('${p1}', 'test-sync-geçici', 100, 9)`],
      ['varyant silme', `delete from public.product_variants where product_id = '${p1}' and name_de = 'test-sync-geçici'`],
    ] as const) {
      const prev = await stampOf(p1);
      await sql(q);
      const next = await stampOf(p1);
      expect(Date.parse(next) > Date.parse(prev), what).toBe(true);
    }
    // Eski ada/fiyata dönülür (sonraki testlerin beklentileri sabit kalsın).
    await sql(`update public.products set name = 'Test Sync Ürün 1', base_price_cents = 1000,
               is_sold_out = false, description = 'ilk açıklama' where id = '${p1}';
               update public.product_variants set price_cents = 500 where id = '${v1}';`);
  });

  it('menü yazımı bildirim seyreltme satırını damgalar (pg_net hedefi yoksa istek atılmaz)', async () => {
    await sql(`update internal.menu_sync_notify_state set last_notified_at = null where id = 1`);
    await sql(`update public.products set base_price_cents = 1001 where id = '${p1}'`);
    const [row] = await sql<{ fresh: boolean }>(`
      select last_notified_at > now() - interval '1 minute' as fresh from internal.menu_sync_notify_state where id = 1`);
    expect(row!.fresh).toBe(true);
    await sql(`update public.products set base_price_cents = 1000 where id = '${p1}'`);
  });
});

describe('menü eşitlemesi — pull (0016)', () => {
  it('kategoriler hep tam, ürün biçimi sözleşmedeki gibi; varyantlar gelir', async () => {
    const c = await createClientRow(admin, 'test-sync-pull');
    const res = await pull(sha256(c.token));
    expect(res.client).toBe('ok');
    const [count] = await sql<{ n: number }>(`select count(*)::int as n from public.categories`);
    expect(res.categories).toHaveLength(count!.n);
    expect(res.categories.find((x) => x.id === catId)).toEqual({
      id: catId, slug: 'test-sync-cat', name_de: 'Test Sync', name_tr: 'Test Sync', name_en: null,
      name_ar: null, sort: 990, is_active: false, is_beverage: false,
    });

    const p = productOf(res, p1)!;
    expect(Object.keys(p).sort()).toEqual([
      'allergens', 'archived', 'category_id', 'code', 'description', 'id', 'image_path', 'is_active',
      'is_sold_out', 'name', 'price_cents', 'sort', 'sync_updated_at', 'variants',
    ]);
    expect(p).toMatchObject({
      id: p1, code: 'TSYNC1', category_id: catId, name: 'Test Sync Ürün 1', description: 'ilk açıklama',
      price_cents: 1000, is_sold_out: false, is_active: false, archived: false,
    });
    expect(p.variants).toEqual([{ id: v1, name_de: 'Klein', name_tr: 'Küçük', price_cents: 500,
                                 is_default: true, sort: 1, is_active: true }]);
    // Son görülme yazıldı.
    const [row] = await sql<{ seen: boolean }>(`select last_seen_at is not null as seen
                                                from public.menu_sync_clients where id = '${c.id}'`);
    expect(row!.seen).toBe(true);
  });

  it('since: yalnız damgası büyük ürünler döner; limit sayfalar', async () => {
    const c = await createClientRow(admin, 'test-sync-since');
    const hash = sha256(c.token);
    const since = (await pull(hash)).now;

    expect(productOf(await pull(hash, since), p1)).toBeUndefined();
    await sql(`update public.products set is_sold_out = true where id = '${p1}'`);
    const after = await pull(hash, since);
    expect(after.products.map((x) => x.id)).toEqual([p1]);
    expect(after.products[0]!.is_sold_out).toBe(true);
    expect(after.categories.length).toBeGreaterThan(0); // kategoriler since'ten bağımsız
    await sql(`update public.products set is_sold_out = false where id = '${p1}'`);

    // limit: bir sayfada en fazla o kadar damga (aynı damgalı satırlar bölünmez).
    const page = await pull(hash, null, 1);
    expect(page.products.length).toBeGreaterThanOrEqual(1);
    const stamps = new Set(page.products.map((x) => x.sync_updated_at));
    expect(stamps.size).toBe(1);
  });

  it('arşivlenen ürün de döner (karşı taraf kaldırabilsin)', async () => {
    const c = await createClientRow(admin, 'test-sync-arsiv');
    await sql(`update public.products set archived_at = now(), is_active = false where id = '${p2}'`);
    const p = productOf(await pull(sha256(c.token)), p2)!;
    expect(p.archived).toBe(true);
    expect(p.is_active).toBe(false);
    await sql(`update public.products set archived_at = null where id = '${p2}'`);
  });
});

describe('menü eşitlemesi — push (0016)', () => {
  it('yeni damga uygulanır: ad, açıklama, fiyat, tükendi ve varyant fiyatı', async () => {
    const c = await createClientRow(admin, 'test-sync-push');
    const hash = sha256(c.token);
    const res = await push(hash, [{
      ramos_id: p1, name: 'Test Sync Ürün 1 (karşı taraf)', description: 'karşı taraf açıklaması',
      price_cents: 1234, is_sold_out: true, variants: [{ id: v1, price_cents: 777 }],
      updated_at: new Date(Date.now() + 60_000).toISOString(),
    }]);
    expect(res.client).toBe('ok');
    expect(res.results).toEqual([{ index: 1, ramos_id: p1, status: 'applied', variants: 1 }]);
    const [row] = await sql<{ name: string; description: string; price: number; sold: boolean; vprice: number;
                             slug: string; code: string }>(`
      select p.name, p.description, p.base_price_cents as price, p.is_sold_out as sold, p.slug, p.code,
             (select v.price_cents from public.product_variants v where v.id = '${v1}') as vprice
      from public.products p where p.id = '${p1}'`);
    expect(row).toEqual({ name: 'Test Sync Ürün 1 (karşı taraf)', description: 'karşı taraf açıklaması',
      price: 1234, sold: true, vprice: 777, slug: 'test-sync-p1', code: 'TSYNC1' });

    // Başka ürünün varyantı bu kalemle DEĞİŞMEZ.
    const res2 = await push(hash, [{ ramos_id: p1, variants: [{ id: vForeign, price_cents: 1 }],
                                     updated_at: new Date(Date.now() + 120_000).toISOString() }]);
    expect(res2.results[0]).toMatchObject({ status: 'applied', variants: 0 });
    const [foreign] = await sql<{ price: number }>(
      `select price_cents as price from public.product_variants where id = '${vForeign}'`);
    expect(foreign!.price).toBe(900);

    await sql(`update public.products set name = 'Test Sync Ürün 1', description = 'ilk açıklama',
               base_price_cents = 1000, is_sold_out = false where id = '${p1}';
               update public.product_variants set price_cents = 500 where id = '${v1}';`);
  });

  it('eski damga reddedilir ve bizim satırımız `current` ile döner (yazım olmaz)', async () => {
    const c = await createClientRow(admin, 'test-sync-eski');
    const stamp = await stampOf(p1);
    const res = await push(sha256(c.token), [{
      ramos_id: p1, name: 'ASLA yazılmamalı', price_cents: 1, updated_at: new Date(Date.parse(stamp) - 1000).toISOString(),
    }]);
    const r = res.results[0]!;
    expect(r.status).toBe('rejected_older');
    expect(r.ramos_id).toBe(p1);
    expect(r.current).toMatchObject({ id: p1, name: 'Test Sync Ürün 1', price_cents: 1000 });
    // Management API damgayı ISO'suz ('… 21:52:30+00') döndürür; jsonb ISO yazar — an olarak karşılaştırılır.
    expect(Date.parse(r.current!.sync_updated_at)).toBe(Date.parse(stamp));
    const [row] = await sql<{ name: string; price: number }>(
      `select name, base_price_cents as price from public.products where id = '${p1}'`);
    expect(row).toEqual({ name: 'Test Sync Ürün 1', price: 1000 });
    // Aynı damga da reddedilir (yalnız BÜYÜK olan uygulanır).
    expect((await push(sha256(c.token), [{ ramos_id: p1, price_cents: 1, updated_at: stamp }])).results[0]!.status)
      .toBe('rejected_older');
  });

  it('yeni ürün açılır: slug addan üretilir, aktif ve kategorinin sonunda', async () => {
    const c = await createClientRow(admin, 'test-sync-yeni');
    const res = await push(sha256(c.token), [{
      ramos_id: null, code: 'TSYNC9', category_ramos_id: catId, name: 'Test Sync Yeni Ürün',
      description: 'yeni', price_cents: 1500, updated_at: new Date().toISOString(),
    }]);
    const r = res.results[0]!;
    expect(r.status).toBe('created');
    expect(r.ramos_id).toMatch(/^[0-9a-f-]{36}$/);
    const [row] = await sql<{ slug: string; code: string; name: string; price: number; active: boolean;
                             archived: boolean; sort: number; cat: string }>(`
      select slug, code, name, base_price_cents as price, is_active as active, archived_at is not null as archived,
             sort, category_id as cat from public.products where id = '${r.ramos_id}'`);
    expect(row).toEqual({ slug: 'test-sync-yeni-urun', code: 'TSYNC9', name: 'Test Sync Yeni Ürün', price: 1500,
      active: true, archived: false, sort: expect.any(Number), cat: catId });
    expect(row!.sort).toBeGreaterThan(20);

    // Aynı kod tekrar gönderilirse kopya ürün AÇILMAZ: var olan satır hedef alınır.
    const again = await push(sha256(c.token), [{
      ramos_id: null, code: 'TSYNC9', category_ramos_id: catId, name: 'Test Sync Yeni Ürün',
      price_cents: 1600, updated_at: new Date(Date.now() + 60_000).toISOString(),
    }]);
    expect(again.results[0]).toMatchObject({ status: 'applied', ramos_id: r.ramos_id });
    const [n] = await sql<{ n: number }>(`select count(*)::int as n from public.products where code = 'TSYNC9'`);
    expect(n!.n).toBe(1);

    await sql(`delete from public.products where id = '${r.ramos_id}'`);
  });

  it('deleted: ürün SİLİNMEZ, pasifleşip arşivlenir', async () => {
    const c = await createClientRow(admin, 'test-sync-sil');
    const res = await push(sha256(c.token), [{ ramos_id: p2, deleted: true,
                                               updated_at: new Date(Date.now() + 60_000).toISOString() }]);
    expect(res.results[0]).toMatchObject({ status: 'applied', ramos_id: p2 });
    const [row] = await sql<{ exists: boolean; active: boolean; archived: boolean }>(`
      select true as exists, is_active as active, archived_at is not null as archived
      from public.products where id = '${p2}'`);
    expect(row).toEqual({ exists: true, active: false, archived: true });
    await sql(`update public.products set archived_at = null where id = '${p2}'`);
  });

  it('bilinmeyen ramos_id → not_found; bozuk kalemler → invalid; paketin gerisi işlenir', async () => {
    const c = await createClientRow(admin, 'test-sync-hatali');
    const future = new Date(Date.now() + 60_000).toISOString();
    const res = await push(sha256(c.token), [
      { ramos_id: crypto.randomUUID(), price_cents: 1, updated_at: future },
      { ramos_id: p1, price_cents: 1 },                                   // updated_at yok
      { ramos_id: p1, price_cents: -5, updated_at: future },              // eksi fiyat
      { ramos_id: p1, name: '   ', updated_at: future },                  // boş ad
      { ramos_id: p1, category_ramos_id: crypto.randomUUID(), updated_at: future },  // olmayan kategori
      { ramos_id: null, name: 'Test Sync Eksik', updated_at: future },    // kategori/fiyat yok
      'metin',
      { ramos_id: p1, is_sold_out: true, updated_at: future },            // geçerli: işlenir
    ]);
    expect(res.results.map((r) => `${r.index}:${r.status}`)).toEqual([
      '1:not_found', '2:invalid', '3:invalid', '4:invalid', '5:invalid', '6:invalid', '7:invalid', '8:applied',
    ]);
    expect(res.results[5]!.reason).toBe('create_fields_missing');
    const [row] = await sql<{ price: number; sold: boolean; name: string }>(
      `select base_price_cents as price, is_sold_out as sold, name from public.products where id = '${p1}'`);
    expect(row).toEqual({ price: 1000, sold: true, name: 'Test Sync Ürün 1' });
    const [extra] = await sql<{ n: number }>(
      `select count(*)::int as n from public.products where name = 'Test Sync Eksik'`);
    expect(extra!.n).toBe(0);
    await sql(`update public.products set is_sold_out = false where id = '${p1}'`);
  });
});
