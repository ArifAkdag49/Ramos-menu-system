import { describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';

const TABLES = [
  'audit_log', 'categories', 'daily_counters', 'dining_tables', 'ingredients', 'option_groups',
  'options', 'order_items', 'orders', 'print_jobs', 'printer_status', 'product_ingredients',
  'product_option_groups', 'product_variants', 'products', 'profiles', 'push_subscriptions',
  'settings', 'table_sessions',
];

describe('0001 şema', () => {
  it('19 tablo var ve hepsinde RLS açık', async () => {
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
