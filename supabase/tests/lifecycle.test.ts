import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers } from './helpers/users';

let f: Fixtures;
let ids: Awaited<ReturnType<typeof ensureTestUsers>>;
let waiter: SupabaseClient, waiter2: SupabaseClient, kitchen: SupabaseClient, admin: SupabaseClient;

beforeAll(async () => {
  ids = await ensureTestUsers();
  f = await ensureFixtures();
  [waiter, waiter2, kitchen, admin] = await Promise.all(
    [clientFor('waiter'), clientFor('waiter2'), clientFor('kitchen'), clientFor('admin')]);
});
beforeEach(cleanupFixtureOrders);
afterAll(cleanupFixtureOrders);

type Payload = Record<string, unknown>;
type OverviewRow = { name: string; session_id: string | null; total_cents: number;
  orders_in_kitchen: number; orders_ready: number };

const item = (over: Record<string, unknown> = {}) => ({
  product_id: f.doenerId, variant_id: f.variantK, quantity: 1,
  option_ids: [f.sauceA, f.extraCheese], removed_ingredient_ids: [], ...over,
});
async function order(items: Record<string, unknown>[] = [item()], table = f.tableId) {
  const id = crypto.randomUUID();
  const { data, error } = await waiter.rpc('submit_order', { p_order_id: id, p_table_id: table, p_items: items });
  if (error) throw error;
  return data as { order_id: string; session_id: string; order_no: number };
}
const itemIds = (orderId: string) =>
  sql<{ id: string }>(`select id from public.order_items where order_id = '${orderId}' order by sort`);
const statusOf = async (orderId: string) =>
  (await sql<{ status: string }>(`select status from public.orders where id = '${orderId}'`))[0]!.status;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const stornoCount = async (orderId: string) =>
  (await sql<{ n: number }>(
    `select count(*)::int as n from public.print_jobs where order_id = '${orderId}' and type = 'storno'`))[0]!.n;

describe('kalem iptali', () => {
  it('sebep zorunlu, STORNO fişi basılır, son kalem iptalinde sipariş iptal olur', async () => {
    const o = await order([item(), { product_id: f.colaId, quantity: 2 }]);
    const [a, b] = await itemIds(o.order_id);
    expect((await waiter.rpc('cancel_order_item', { p_item_id: a!.id, p_reason: ' ' })).error?.message)
      .toBe('reason_required');
    const r1 = await waiter.rpc('cancel_order_item', { p_item_id: a!.id, p_reason: 'Gast hat storniert' });
    expect(r1.data).toMatchObject({ order_status: 'in_kitchen' });
    const [storno] = await sql<{ payload: Payload }>(
      `select payload from public.print_jobs where order_id = '${o.order_id}' and type = 'storno'`);
    expect(storno!.payload).toMatchObject({ kind: 'storno', reason: 'Gast hat storniert',
      items: [{ name: 'Test Drehspieß Sandwich', variant: 'Kalb' }] });
    expect((await waiter.rpc('cancel_order_item', { p_item_id: a!.id, p_reason: 'x' })).error?.message)
      .toBe('item_already_cancelled');
    await waiter.rpc('cancel_order_item', { p_item_id: b!.id, p_reason: 'Falsch eingegeben' });
    expect(await statusOf(o.order_id)).toBe('cancelled');
  });

  it('mutfak iptal edemez', async () => {
    const o = await order();
    const [a] = await itemIds(o.order_id);
    expect((await kitchen.rpc('cancel_order_item', { p_item_id: a!.id, p_reason: 'x' })).error?.message)
      .toBe('not_authorized');
  });

  it('teslim edilmiş siparişin son kalemi iptal edilince sipariş served kalır, STORNO basılmaz (R42)', async () => {
    const o = await order([{ product_id: f.colaId, quantity: 1 }]);
    expect((await waiter.rpc('mark_order_served', { p_order_id: o.order_id })).error).toBeNull();
    const [only] = await itemIds(o.order_id);
    const r = await waiter.rpc('cancel_order_item', { p_item_id: only!.id, p_reason: 'Gast hat storniert' });
    expect(r.error).toBeNull();
    expect(r.data).toMatchObject({ order_status: 'served' });
    expect(await statusOf(o.order_id)).toBe('served');
    const [item] = await sql<{ status: string }>(
      `select status from public.order_items where id = '${only!.id}'`);
    expect(item!.status).toBe('cancelled');
    expect(await stornoCount(o.order_id)).toBe(0);   // R40: served siparişte STORNO fişi yok
  });
});

describe('hazır / geri al / teslim', () => {
  it('mutfak hazırlar; garson hazırlayamaz; 30 sn içinde geri alınır, sonra alınamaz', async () => {
    const o = await order();
    expect((await waiter.rpc('mark_order_ready', { p_order_id: o.order_id })).error?.message).toBe('not_authorized');
    expect((await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id })).error).toBeNull();
    expect(await statusOf(o.order_id)).toBe('ready');
    expect((await kitchen.rpc('undo_order_ready', { p_order_id: o.order_id })).error).toBeNull();
    expect(await statusOf(o.order_id)).toBe('in_kitchen');
    await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id });
    await sql(`update public.orders set ready_at = now() - interval '31 seconds' where id = '${o.order_id}'`);
    expect((await kitchen.rpc('undo_order_ready', { p_order_id: o.order_id })).error?.message)
      .toBe('undo_window_expired');
  });

  it('garson hem hazır hem mutfaktaki siparişi teslim edebilir (içecek siparişi)', async () => {
    const a = await order();
    const b = await order([{ product_id: f.colaId, quantity: 1 }]);
    await kitchen.rpc('mark_order_ready', { p_order_id: a.order_id });
    expect((await waiter.rpc('mark_order_served', { p_order_id: a.order_id })).error).toBeNull();
    expect((await waiter2.rpc('mark_order_served', { p_order_id: b.order_id })).error).toBeNull();
    expect([await statusOf(a.order_id), await statusOf(b.order_id)]).toEqual(['served', 'served']);
  });
});

describe('masa kapatma ve taşıma', () => {
  it('masa satırı kilitliyken kapatma bekler — submit_order ile aynı kilit sırası (R41)', async () => {
    const o = await order();
    await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id });
    // Başka bir oturum masa satırını 4 sn kilitli tutar; kapatma bu kilidi beklemelidir.
    const marker = crypto.randomUUID();
    let heldError: unknown;
    const held = sql(`-- ${marker}
      begin;
      select id from public.dining_tables where id = '${f.tableId}' for update;
      select pg_sleep(4);
      commit;`).catch((e: unknown) => { heldError = e; });
    const lockHolders = async () => (await sql<{ n: number }>(`
      select count(*)::int as n from pg_stat_activity
      where pid <> pg_backend_pid() and query like '%${marker}%'`))[0]!.n;
    const waitStart = Date.now();
    while ((await lockHolders()) === 0) {
      if (Date.now() - waitStart > 5000) throw new Error('kilit isteği başlamadı');
      await sleep(100);
    }
    await sleep(300);

    const t0 = Date.now();
    const { error } = await waiter.rpc('close_table_session', { p_session_id: o.session_id });
    const elapsed = Date.now() - t0;
    await held;
    expect(heldError).toBeUndefined();
    expect(error).toBeNull();
    expect(elapsed).toBeGreaterThan(2000);
  });

  it('mutfakta sipariş varken kapanmaz; hazır olanlar kapanışta teslim sayılır', async () => {
    const o = await order();
    expect((await waiter.rpc('close_table_session', { p_session_id: o.session_id })).error?.message)
      .toBe('open_orders_in_kitchen');
    await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id });
    expect((await waiter.rpc('close_table_session', { p_session_id: o.session_id })).error).toBeNull();
    expect(await statusOf(o.order_id)).toBe('served');
    const { data } = await waiter.rpc('table_overview');
    const row = (data as { name: string; session_id: string | null }[]).find((r) => r.name === 'Test-Tisch');
    expect(row?.session_id).toBeNull();
  });

  it('oturum boş masaya taşınır ve TISCHWECHSEL fişi basılır; dolu masaya taşınamaz', async () => {
    const o = await order();
    expect((await waiter.rpc('move_table_session', { p_session_id: o.session_id, p_target_table_id: f.table2Id }))
      .error).toBeNull();
    const [job] = await sql<{ payload: Payload }>(
      `select payload from public.print_jobs where session_id = '${o.session_id}' and type = 'table_move'`);
    expect(job!.payload).toMatchObject({ kind: 'table_move', fromTable: 'Test-Tisch', toTable: 'Test-Tisch-2',
      openOrderNos: [o.order_no] });
    const other = await order([item()], f.tableId);
    expect((await waiter.rpc('move_table_session', { p_session_id: other.session_id, p_target_table_id: f.table2Id }))
      .error?.message).toBe('target_table_busy');
  });
});

describe('tükendi, hesap özeti, masa özeti', () => {
  it('mutfak tükendi işaretler, garson işaretleyemez; tükenen ürün sipariş edilemez', async () => {
    expect((await waiter.rpc('set_product_sold_out', { p_product_id: f.doenerId, p_sold_out: true })).error?.message)
      .toBe('not_authorized');
    await kitchen.rpc('set_product_sold_out', { p_product_id: f.doenerId, p_sold_out: true });
    const r = await waiter.rpc('submit_order', { p_order_id: crypto.randomUUID(), p_table_id: f.tableId, p_items: [item()] });
    expect(r.error?.message).toBe('product_sold_out');
    await kitchen.rpc('set_product_sold_out', { p_product_id: f.doenerId, p_sold_out: false });
  });

  it('hesap özeti aynı kalemleri gruplar, iptalleri dışarıda bırakır', async () => {
    const o1 = await order([item(), { product_id: f.colaId, quantity: 2 }]);
    await order([item({ removed_ingredient_ids: [f.ingZwiebeln] })]); // ikinci tur, aynı fiyat → aynı satır
    const [, cola] = await itemIds(o1.order_id);
    await waiter.rpc('cancel_order_item', { p_item_id: cola!.id, p_reason: 'x' });
    const { data } = await waiter.rpc('get_session_bill', { p_session_id: o1.session_id });
    expect(data).toMatchObject({
      table: 'Test-Tisch', total_cents: 2 * 950,
      lines: [{ product_name: 'Test Drehspieß Sandwich', variant_name_de: 'Kalb', extras: ['Extra Weichkäse'],
                unit_price_cents: 950, quantity: 2, line_total_cents: 1900 }],
    });
  });

  it('masa özeti açık masanın toplamını ve sayaçlarını verir', async () => {
    const o = await order();
    await kitchen.rpc('mark_order_ready', { p_order_id: o.order_id });
    const { data } = await kitchen.rpc('table_overview');
    const row = (data as OverviewRow[]).find((r) => r.name === 'Test-Tisch');
    expect(row).toMatchObject({ session_id: o.session_id, total_cents: 950, orders_in_kitchen: 0, orders_ready: 1 });
  });
});

describe('mesai, dil, push, rapor', () => {
  it('mesai açılır ve kapanır', async () => {
    expect((await waiter.rpc('set_on_duty', { p_on: true })).data).toEqual({ on_duty: true });
    const [p] = await sql<{ d: boolean }>(
      `select public.is_on_duty(on_duty_since) as d from public.profiles where id = '${ids.waiter}'`);
    expect(p!.d).toBe(true);
    expect((await waiter.rpc('set_on_duty', { p_on: false })).data).toEqual({ on_duty: false });
  });

  it('dil tercihi yalnız tr/de olur', async () => {
    expect((await waiter.rpc('set_my_locale', { p_locale: 'de' })).error).toBeNull();
    expect((await waiter.rpc('set_my_locale', { p_locale: 'en' })).error?.message).toBe('locale_invalid');
    await waiter.rpc('set_my_locale', { p_locale: 'tr' });
  });

  it('push aboneliği kaydedilir, cihaz el değiştirince yeni kullanıcıya geçer, silinir', async () => {
    const ep = `https://push.example/${crypto.randomUUID()}`;
    await waiter.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: 'k', p_auth: 'a', p_ua: 'test' });
    await waiter2.rpc('save_push_subscription', { p_endpoint: ep, p_p256dh: 'k2', p_auth: 'a2', p_ua: 'test' });
    const [row] = await sql<{ user_id: string }>(`select user_id from public.push_subscriptions where endpoint = '${ep}'`);
    expect(row!.user_id).toBe(ids.waiter2);
    await waiter2.rpc('delete_push_subscription', { p_endpoint: ep });
    expect(await sql(`select 1 from public.push_subscriptions where endpoint = '${ep}'`)).toEqual([]);
  });

  it('tamamen iptal edilen sipariş ne orders ne by_hour sayımına girer (R39)', async () => {
    type Report = { orders: number; by_hour: { hour: number; orders: number }[] };
    const sumHours = (r: Report) => r.by_hour.reduce((n, h) => n + Number(h.orders), 0);
    const today = (await sql<{ d: string }>(`select public.business_date()::text as d`))[0]!.d;
    const report = async () =>
      (await admin.rpc('report_range', { p_from: today, p_to: today })).data as Report;

    const before = await report();
    const o = await order([{ product_id: f.colaId, quantity: 1 }]);
    const [only] = await itemIds(o.order_id);
    await waiter.rpc('cancel_order_item', { p_item_id: only!.id, p_reason: 'Gast hat storniert' });
    expect(await statusOf(o.order_id)).toBe('cancelled');

    const after = await report();
    expect(after.orders).toBe(before.orders);
    expect(sumHours(after)).toBe(sumHours(before));
  });

  it('rapor yalnız admin', async () => {
    await order();
    const today = (await sql<{ d: string }>(`select public.business_date()::text as d`))[0]!.d;
    expect((await waiter.rpc('report_range', { p_from: today, p_to: today })).error?.message).toBe('not_authorized');
    const { data, error } = await admin.rpc('report_range', { p_from: today, p_to: today });
    expect(error).toBeNull();
    expect(data.orders).toBeGreaterThanOrEqual(1);
    expect(data.top_products.length).toBeGreaterThanOrEqual(1);
  });
});
