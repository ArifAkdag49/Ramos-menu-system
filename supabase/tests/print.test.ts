import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers } from './helpers/users';

let f: Fixtures;
let waiter: SupabaseClient, kitchen: SupabaseClient, admin: SupabaseClient, printer: SupabaseClient;
const TEST_JOBS = `created_by in (select id from public.profiles where username like 'test-%')`;

type Payload = Record<string, unknown>;

beforeAll(async () => {
  await ensureTestUsers();
  f = await ensureFixtures();
  [waiter, kitchen, admin, printer] = await Promise.all(
    (['waiter', 'kitchen', 'admin', 'printer'] as const).map(clientFor));
  const foreign = await sql(`select 1 from public.print_jobs
                             where status in ('pending','printing') and not (${TEST_JOBS})`);
  if (foreign.length) throw new Error('Kuyrukta test dışı iş var — ajanı durdur, kuyruğu kontrol et.');
});
beforeEach(async () => {
  await cleanupFixtureOrders();
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
});
afterAll(async () => {
  await cleanupFixtureOrders();
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
});

async function orderWithJob() {
  const id = crypto.randomUUID();
  const { error } = await waiter.rpc('submit_order', {
    p_order_id: id, p_table_id: f.tableId,
    p_items: [{ product_id: f.colaId, quantity: 1 }],
  });
  if (error) throw error;
  return id;
}
const claim = async () => {
  const { data, error } = await printer.rpc('claim_print_job', { p_agent_id: 'test-agent' });
  if (error) throw error;
  return data as { id: string; type: string; payload: Payload; attempts: number }[];
};

describe('fiş kuyruğu', () => {
  it('ajan işi sahiplenir, ikinci sahiplenme boş döner, başarıyla kapatır', async () => {
    const orderId = await orderWithJob();
    const [job] = await claim();
    expect(job).toMatchObject({ type: 'order' });
    expect(await claim()).toEqual([]);
    expect((await printer.rpc('complete_print_job', { p_job_id: job!.id, p_ok: true })).error).toBeNull();
    const [row] = await sql<{ status: string }>(`select status from public.print_jobs where order_id = '${orderId}'`);
    expect(row!.status).toBe('printed');
  });

  it('başarısız deneme geri çekilir; 6. hatada failed olur; tekrar dene kuyruğa alır', async () => {
    await orderWithJob();
    let [job] = await claim();
    for (let i = 1; i <= 6; i++) {
      await printer.rpc('complete_print_job', { p_job_id: job!.id, p_ok: false, p_error: `err ${i}` });
      const [r] = await sql<{ status: string; attempts: number; wait: number }>(`
        select status, attempts, extract(epoch from next_attempt_at - now())::int as wait
        from public.print_jobs where id = '${job!.id}'`);
      if (i < 6) {
        expect(r).toMatchObject({ status: 'pending', attempts: i });
        expect(r!.wait).toBeGreaterThan([5, 15, 30, 60, 120][i - 1]! - 3);
        await sql(`update public.print_jobs set next_attempt_at = now() where id = '${job!.id}'`);
        [job] = await claim();
      } else {
        expect(r).toMatchObject({ status: 'failed', attempts: 6 });
      }
    }
    expect((await kitchen.rpc('retry_print_job', { p_job_id: job!.id })).error).toBeNull();
    expect((await claim())[0]).toMatchObject({ id: job!.id, attempts: 0 });
  });

  it('60 sn takılı kalan printing işi yeniden sahiplenilir', async () => {
    await orderWithJob();
    const [job] = await claim();
    await sql(`update public.print_jobs set claimed_at = now() - interval '61 seconds' where id = '${job!.id}'`);
    expect((await claim())[0]?.id).toBe(job!.id);
  });

  it('yalnız printer sahiplenir; tekrar baskı orijinal fişi birebir yineler; test fişi yalnız admin', async () => {
    const orderId = await orderWithJob();
    expect((await waiter.rpc('claim_print_job', { p_agent_id: 'x' })).error?.message).toBe('not_authorized');
    expect((await waiter.rpc('reprint_order', { p_order_id: orderId })).error).toBeNull();
    const [re] = await sql<{ payload: Payload }>(
      `select payload from public.print_jobs where order_id = '${orderId}' and type = 'reprint'`);
    expect(re!.payload).toMatchObject({ kind: 'reprint', reprintOf: 'order', table: 'Test-Tisch' });
    expect((await waiter.rpc('enqueue_test_print')).error?.message).toBe('not_authorized');
    expect((await admin.rpc('enqueue_test_print')).error).toBeNull();
    const [t] = await sql<{ payload: Payload }>(`select payload from public.print_jobs where type = 'test' and ${TEST_JOBS}`);
    expect(t!.payload).toMatchObject({ kind: 'test' });
    expect(t!.payload.sampleLine).toContain('Şş Ğğ İı');
  });

  it('heartbeat printer_status kaydını günceller, personel okuyabilir', async () => {
    await printer.rpc('agent_heartbeat', { p_agent_id: 'test-agent', p_version: '0.0.0', p_host: 'test',
      p_reachable: true, p_state: { paper_end: false }, p_error: null });
    const { data } = await waiter.from('printer_status').select('agent_id, printer_reachable').single();
    expect(data).toEqual({ agent_id: 'test-agent', printer_reachable: true });
  });
});
