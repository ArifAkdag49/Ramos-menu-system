import type { SupabaseClient } from '@supabase/supabase-js';
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';
import { anonClient, clientFor, ensureTestUsers } from './helpers/users';

type K = 'admin' | 'waiter' | 'kitchen' | 'printer' | 'inactive';
let c: Record<K, SupabaseClient>;

beforeAll(async () => {
  await ensureTestUsers();
  await sql(`insert into public.categories (slug, name_de) values ('test-rls', 'RLS-Test')
             on conflict (slug) do nothing`);
  c = {
    admin: await clientFor('admin'),
    waiter: await clientFor('waiter'),
    kitchen: await clientFor('kitchen'),
    printer: await clientFor('printer'),
    inactive: await clientFor('inactive'),
  };
});

describe('RLS (0002)', () => {
  it('anon hiçbir tabloyu okuyamaz', async () => {
    const { error } = await anonClient().from('categories').select('id');
    expect(error?.code).toBe('42501');
  });

  it('garson ve mutfak menüyü okur; printer ve pasif kullanıcı okuyamaz', async () => {
    for (const k of ['waiter', 'kitchen'] as const) {
      const { data, error } = await c[k].from('categories').select('slug').eq('slug', 'test-rls');
      expect(error).toBeNull();
      expect(data).toHaveLength(1);
    }
    for (const k of ['printer', 'inactive'] as const) {
      const { data } = await c[k].from('categories').select('slug').eq('slug', 'test-rls');
      expect(data).toEqual([]);
    }
  });

  it('garson menüye yazamaz, admin yazabilir', async () => {
    const w = await c.waiter.from('categories').insert({ slug: 'test-rls-w', name_de: 'x' });
    expect(w.error?.code).toBe('42501');
    const a = await c.admin
      .from('categories').update({ name_tr: 'RLS testi' }).eq('slug', 'test-rls').select('name_tr');
    expect(a.error).toBeNull();
    expect(a.data?.[0]?.name_tr).toBe('RLS testi');
  });

  it('sayaç ve fiş tablolarına istemci doğrudan yazamaz', async () => {
    const d = await c.admin.from('daily_counters').insert({ business_date: '2000-01-01', last_order_no: 1 });
    expect(d.error?.code).toBe('42501');
    const p = await c.printer.from('print_jobs').insert({ type: 'test', payload: {} });
    expect(p.error?.code).toBe('42501');
  });

  it('audit_log yalnızca admin okur', async () => {
    const { data } = await c.waiter.from('audit_log').select('id').limit(1);
    expect(data).toEqual([]);
  });

  it('ayarları printer dahil tüm aktif personel okur, pasif okuyamaz', async () => {
    for (const k of ['admin', 'waiter', 'kitchen', 'printer'] as const) {
      const { data } = await c[k].from('settings').select('id');
      expect(data).toEqual([{ id: 1 }]);
    }
    const { data } = await c.inactive.from('settings').select('id');
    expect(data).toEqual([]);
  });

  it('staff_names printer hesabını listelemez', async () => {
    const { data, error } = await c.waiter.rpc('staff_names');
    expect(error).toBeNull();
    const rows = data as { role: string; display_name: string }[];
    expect(rows.some((r) => r.display_name === 'test-waiter')).toBe(true);
    expect(rows.some((r) => r.role === 'printer')).toBe(false);
  });

  it('ürün görselini yalnız admin yükler; herkese açık adresten okunur', async () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const path = `test/rls-${Date.now()}.png`;
    const w = await c.waiter.storage.from('product-images').upload(path, png, { contentType: 'image/png' });
    expect(w.error).not.toBeNull();
    const a = await c.admin.storage.from('product-images').upload(path, png, { contentType: 'image/png' });
    expect(a.error).toBeNull();
    const url = c.admin.storage.from('product-images').getPublicUrl(path).data.publicUrl;
    expect((await fetch(url)).status).toBe(200);
    expect((await c.admin.storage.from('product-images').remove([path])).error).toBeNull();
  });

  it('iş günü 05:00 Berlin saatinde döner', async () => {
    const [row] = await sql<{ a: string; b: string }>(`
      select public.business_date('2026-09-15 04:59:00+02')::text as a,
             public.business_date('2026-09-15 05:00:00+02')::text as b`);
    expect(row).toEqual({ a: '2026-09-14', b: '2026-09-15' });
  });
});
