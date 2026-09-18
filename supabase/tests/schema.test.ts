import { describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';

const TABLES = [
  'audit_log', 'categories', 'daily_counters', 'dining_tables', 'ingredients', 'option_groups',
  'options', 'order_items', 'orders', 'print_jobs', 'printer_status', 'product_ingredients',
  'product_option_groups', 'product_variants', 'products', 'profiles', 'push_subscriptions',
  'sdp_printers', 'settings', 'station_devices', 'table_sessions',
];

describe('0001 şema', () => {
  it('21 tablo var ve hepsinde RLS açık', async () => {
    const rows = await sql<{ relname: string; relrowsecurity: boolean }>(`
      select c.relname, c.relrowsecurity
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r'
      order by c.relname collate "C"`);
    expect(rows.map((r) => r.relname)).toEqual(TABLES);
    expect(rows.filter((r) => !r.relrowsecurity)).toEqual([]);
  });

  it('tekil satırlar hazır', async () => {
    expect(await sql('select id from public.settings')).toEqual([{ id: 1 }]);
    expect(await sql('select id from public.printer_status')).toEqual([{ id: 'main' }]);
  });

  it('bir masada aynı anda tek açık oturum olabilir', async () => {
    const idx = await sql(`select 1 from pg_indexes where indexname = 'table_sessions_one_open'`);
    expect(idx).toHaveLength(1);
  });

  it('anon hiçbir tabloda yetkiye sahip değil', async () => {
    const grants = await sql(`
      select table_name from information_schema.role_table_grants
      where grantee = 'anon' and table_schema = 'public'`);
    expect(grants).toEqual([]);
  });
});

// R33: her migration'dan sonra geçerli kalması gereken değişmezler.
describe('anon yetkisi yok — her migration sonrası (R33)', () => {
  it('anon hiçbir public fonksiyonu çalıştıramaz', async () => {
    const rows = await sql<{ fn: string; anon: boolean }>(`
      select p.oid::regprocedure::text as fn, has_function_privilege('anon', p.oid, 'execute') as anon
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public'`);
    expect(rows.length).toBeGreaterThan(0);
    // Tek bilinçli istisna: müşteri QR menüsü (0011_public_menu.sql; anon.test.ts'teki allowlist ile aynı).
    expect(rows.filter((r) => r.anon && r.fn !== 'public_menu()').map((r) => r.fn)).toEqual([]);
  });

  it('anon hiçbir public sequence üzerinde usage/select/update yetkisine sahip değil', async () => {
    const rows = await sql<{ seq: string; anon: boolean }>(`
      select c.oid::regclass::text as seq,
             has_sequence_privilege('anon', c.oid, 'usage, select, update') as anon
      from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'S'`);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.filter((r) => r.anon).map((r) => r.seq)).toEqual([]);
  });
});
