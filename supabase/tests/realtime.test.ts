import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, type Fixtures } from './helpers/fixtures';
import { clientFor, ensureTestUsers } from './helpers/users';

let f: Fixtures;
let waiter: SupabaseClient, kitchen: SupabaseClient, printer: SupabaseClient;

beforeAll(async () => {
  await ensureTestUsers();
  f = await ensureFixtures();
  [waiter, kitchen, printer] = await Promise.all((['waiter', 'kitchen', 'printer'] as const).map(clientFor));
});
afterAll(async () => {
  await cleanupFixtureOrders();
  for (const c of [waiter, kitchen, printer]) await c.removeAllChannels();
});

async function subscribe(client: SupabaseClient, topic: string, sink: unknown[]): Promise<string> {
  await client.realtime.setAuth();
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve('TIMEOUT'), 10_000);
    client
      .channel(topic, { config: { private: true } })
      .on('broadcast', { event: '*' }, (msg) => sink.push(msg))
      .subscribe((status) => {
        if (status === 'SUBSCRIBED' || status === 'CHANNEL_ERROR') { clearTimeout(timer); resolve(status); }
      });
  });
}
const waitFor = async (cond: () => boolean, ms = 10_000) => {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > ms) throw new Error('olay gelmedi');
    await new Promise((r) => setTimeout(r, 100));
  }
};

describe('Realtime broadcast', () => {
  it('garson orders konusunda sipariş olayını alır', async () => {
    const events: unknown[] = [];
    expect(await subscribe(waiter, 'orders', events)).toBe('SUBSCRIBED');
    await waiter.rpc('submit_order', { p_order_id: crypto.randomUUID(), p_table_id: f.tableId,
      p_items: [{ product_id: f.colaId, quantity: 1 }] });
    await waitFor(() => events.some((e) => JSON.stringify(e).includes('"table":"orders"')), 15_000);
  });

  it('mutfak menu konusunda tükendi değişikliğini alır', async () => {
    const events: unknown[] = [];
    expect(await subscribe(kitchen, 'menu', events)).toBe('SUBSCRIBED');
    await kitchen.rpc('set_product_sold_out', { p_product_id: f.colaId, p_sold_out: true });
    await kitchen.rpc('set_product_sold_out', { p_product_id: f.colaId, p_sold_out: false });
    await waitFor(() => events.some((e) => JSON.stringify(e).includes('"table":"products"')), 15_000);
  });

  it('printer orders konusuna abone olamaz', async () => {
    expect(await subscribe(printer, 'orders', [])).toBe('CHANNEL_ERROR');
  });
});
