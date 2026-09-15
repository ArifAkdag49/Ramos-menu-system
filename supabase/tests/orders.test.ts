import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers } from './helpers/users';

let f: Fixtures;
let waiter: SupabaseClient;
let kitchen: SupabaseClient;

beforeAll(async () => {
  await ensureTestUsers();
  f = await ensureFixtures();
  await cleanupFixtureOrders();
  waiter = await clientFor('waiter');
  kitchen = await clientFor('kitchen');
});
afterAll(cleanupFixtureOrders);

const doener = (over: Record<string, unknown> = {}) => ({
  product_id: f.doenerId, variant_id: f.variantK, quantity: 2,
  option_ids: [f.sauceA, f.sauceB, f.extraCheese], removed_ingredient_ids: [f.ingZwiebeln],
  note: 'Soße extra', ...over,
});
const submit = (client: SupabaseClient, items: unknown[], id = crypto.randomUUID(), table = f.tableId) =>
  client.rpc('submit_order', { p_order_id: id, p_table_id: table, p_items: items, p_note: 'Kinderstuhl' });

describe('submit_order', () => {
  it('siparişi fiyatlar, snapshot alır ve fiş işi oluşturur', async () => {
    const id = crypto.randomUUID();
    const { data, error } = await submit(waiter, [doener(), { product_id: f.colaId, quantity: 3 }], id);
    expect(error).toBeNull();
    expect(data).toMatchObject({ order_id: id, round_no: 1, total_cents: 2 * (850 + 100) + 3 * 250, duplicate: false });

    const items = await sql<{ product_name: string; unit_price_cents: number; variant_name_de: string | null;
      removed_ingredients: { name_de: string }[] }>(
      `select product_name, unit_price_cents, variant_name_de, removed_ingredients
       from public.order_items where order_id = '${id}' order by sort`);
    expect(items[0]).toMatchObject({ unit_price_cents: 950, variant_name_de: 'Kalb',
      removed_ingredients: [{ name_de: 'Zwiebeln' }] });

    const [job] = await sql<{ type: string; status: string; payload: { items: unknown[] } }>(
      `select type, status, payload from public.print_jobs where order_id = '${id}'`);
    expect(job).toMatchObject({ type: 'order', status: 'pending' });
    expect(job!.payload).toMatchObject({ kind: 'order', table: 'Test-Tisch', round: 1, note: 'Kinderstuhl' });
    expect(job!.payload.items[0]).toMatchObject({
      qty: 2, code: 'T05', name: 'Test Drehspieß Sandwich', variant: 'Kalb', without: ['Zwiebeln'],
      groups: [
        { label: 'Soße', format: 'label_values', values: ['Knoblauch', 'Kräuter'] },
        { label: 'Extras', format: 'plus_each', values: ['Extra Weichkäse'] },
      ],
      note: 'Soße extra',
    });
    expect(job!.payload.items.at(-1)).toMatchObject({ name: 'Test Cola 0,33 l', isBeverage: true });
  });

  it('aynı order_id ikinci kez gönderilince yeni kayıt açmaz (idempotent)', async () => {
    const id = crypto.randomUUID();
    const first = await submit(waiter, [doener()], id);
    const second = await submit(waiter, [doener()], id);
    expect(second.error).toBeNull();
    expect(second.data).toMatchObject({ order_id: id, order_no: first.data.order_no, duplicate: true });
    const jobs = await sql(`select 1 from public.print_jobs where order_id = '${id}'`);
    expect(jobs).toHaveLength(1);
  });

  it('aynı masadaki ikinci sipariş round 2 ve addition fişi olur', async () => {
    await cleanupFixtureOrders();
    await submit(waiter, [doener()]);
    const id2 = crypto.randomUUID();
    const r2 = await submit(waiter, [doener()], id2);
    expect(r2.data).toMatchObject({ round_no: 2 });
    const [job] = await sql<{ type: string }>(`select type from public.print_jobs where order_id = '${id2}'`);
    expect(job!.type).toBe('addition');
  });

  it('sipariş numarası gün içinde artar', async () => {
    const a = await submit(waiter, [doener()], crypto.randomUUID(), f.table2Id);
    const b = await submit(waiter, [doener()], crypto.randomUUID(), f.table2Id);
    expect(b.data.order_no).toBe(a.data.order_no + 1);
  });

  it.each([
    ['variant_required', () => doener({ variant_id: null })],
    ['option_group_min', () => doener({ option_ids: [] })],
    ['option_exclusive_conflict', () => doener({ option_ids: [f.sauceA, f.sauceOhne] })],
    ['ingredient_invalid', () => doener({ removed_ingredient_ids: [f.sauceA] })],
    ['quantity_invalid', () => doener({ quantity: 0 })],
    ['product_sold_out', () => ({ product_id: f.soldOutId, quantity: 1 })],
  ])('geçersiz kalem → %s', async (key, item) => {
    const { error } = await submit(waiter, [item()]);
    expect(error?.message).toBe(key);
  });

  it('mutfak rolü sipariş gönderemez', async () => {
    const { error } = await submit(kitchen, [doener()]);
    expect(error?.message).toBe('not_authorized');
  });

  it('hatalı kalem tüm siparişi geri alır (yarım sipariş kalmaz)', async () => {
    const id = crypto.randomUUID();
    await submit(waiter, [doener(), doener({ quantity: 0 })], id);
    expect(await sql(`select 1 from public.orders where id = '${id}'`)).toEqual([]);
  });

  it('aynı order_id ile eşzamanlı iki gönderim hatasız döner ve tek sipariş oluşturur', async () => {
    const id = crypto.randomUUID();
    // İki bağlantıyı önceden aç: iki çağrı sunucuya gerçekten aynı anda ulaşsın. HTTP/1.1'de ikinci istek yeni
    // TLS bağlantısı kurarken gecikir ve yarış çoğu zaman oluşmaz (tarayıcıda HTTP/2 ikisini birlikte gönderir).
    await Promise.all([waiter.from('settings').select('id'), waiter.from('settings').select('id')]);
    const [a, b] = await Promise.all([submit(waiter, [doener()], id), submit(waiter, [doener()], id)]);
    expect(a.error).toBeNull();
    expect(b.error).toBeNull();
    expect([a.data.duplicate, b.data.duplicate].filter((d) => d === true)).toHaveLength(1);
    expect(await sql(`select 1 from public.orders where id = '${id}'`)).toHaveLength(1);
    expect(await sql(`select 1 from public.print_jobs where order_id = '${id}'`)).toHaveLength(1);
  });
});
