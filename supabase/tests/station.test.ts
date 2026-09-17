import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type TestContext } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, hideFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers } from './helpers/users';

// 0013 — Tablet yazıcı istasyonu (`print_route = 'station'`). CANLI veritabanında koşar:
// - Kuyrukta test dışı bekleyen/basılan iş varsa testler ATLANIR (gerçek fişe dokunulmaz).
// - Baskı yolu yalnız gerektiği testte saniyeler içinde 'station' yapılır; her testten sonra ve koşu sonunda
//   ÖNCEKİ değere döner (canlıda 'agent'). O arada gelen gerçek bir iş istasyon tarafından sahiplenilirse
//   geri bırakılır ve test düşer.
// - printer_status ('main') istasyon testleri tarafından yazılırsa koşu sonunda eski hâline döner.

let f: Fixtures;
let waiter: SupabaseClient, kitchen: SupabaseClient, admin: SupabaseClient, printer: SupabaseClient;
let previousRoute = 'agent';
let previousStatus: Record<string, unknown> | undefined;
let foreignJobs = false;
const TEST_JOBS = `created_by in (select id from public.profiles where username like 'test-%')`;
const ROUTES = ['agent', 'epson_sdp', 'station'];
type Job = { id: string; type: string; claimed_by: string; attempts: number };

beforeAll(async () => {
  await ensureTestUsers();
  f = await ensureFixtures();
  [waiter, kitchen, admin, printer] = await Promise.all(
    (['waiter', 'kitchen', 'admin', 'printer'] as const).map(clientFor));
  const [s] = await sql<{ print_route: string }>(`select print_route from public.settings where id = 1`);
  previousRoute = s!.print_route;
  [previousStatus] = await sql(`select to_jsonb(ps) as row from public.printer_status ps where id = 'main'`)
    .then((rows) => rows.map((r) => r.row as Record<string, unknown>));
  foreignJobs = (await sql(`select 1 from public.print_jobs
                            where status in ('pending','printing') and not (${TEST_JOBS})`)).length > 0;
});
beforeEach(async () => {
  await cleanupFixtureOrders();
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
});
afterEach(async () => {
  await setRoute(previousRoute);
});
afterAll(async () => {
  await setRoute(previousRoute);
  if (previousStatus) {
    // Ajan o arada heartbeat attıysa onun yazdığı korunur; yalnız istasyon test kaydı geri alınır.
    await sql(`update public.printer_status ps
               set (agent_id, agent_version, host, last_seen_at, printer_reachable, printer_state, last_error, last_printed_at)
                 = (select r.agent_id, r.agent_version, r.host, r.last_seen_at, r.printer_reachable, r.printer_state,
                           r.last_error, r.last_printed_at
                    from jsonb_populate_record(null::public.printer_status,
                                               '${JSON.stringify(previousStatus).replace(/'/g, "''")}'::jsonb) r)
               where ps.id = 'main' and ps.agent_id like 'station:%'`);
  }
  await cleanupFixtureOrders();
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
  await hideFixtures();
});

const guard = (ctx: TestContext) => {
  if (foreignJobs) ctx.skip();
};

async function setRoute(route: string) {
  if (!ROUTES.includes(route)) throw new Error(`bilinmeyen baskı yolu: ${route}`);
  await sql(`update public.settings set print_route = '${route}' where id = 1`);
}

async function orderWithJob() {
  const id = crypto.randomUUID();
  const { error } = await waiter.rpc('submit_order', {
    p_order_id: id, p_table_id: f.tableId, p_items: [{ product_id: f.colaId, quantity: 1 }],
  });
  if (error) throw error;
  return id;
}

/** İstasyon adına iş alır; test işi olmayan bir iş gelirse onu geri bırakıp testi düşürür. */
async function stationClaim(client: SupabaseClient, stationId: string): Promise<Job[]> {
  const { data, error } = await client.rpc('station_claim_print_job', { p_station_id: stationId });
  if (error) throw error;
  const jobs = data as Job[];
  if (jobs.length) {
    const foreign = await sql<{ id: string }>(`
      select j.id from public.print_jobs j
      where j.id in (${jobs.map((j) => `'${j.id}'`).join(',')})
        and not (j.order_id in (select o.id from public.orders o join public.table_sessions ts on ts.id = o.session_id
                                join public.dining_tables t on t.id = ts.table_id where t.name like 'Test-Tisch%')
                 or ${TEST_JOBS})`);
    if (foreign.length) {
      await sql(`update public.print_jobs set status = 'pending', claimed_by = null, claimed_at = null
                 where id in (${foreign.map((r) => `'${r.id}'`).join(',')})`);
      throw new Error('İstasyon gerçek bir işi sahiplendi — iş geri bırakıldı.');
    }
  }
  return jobs;
}

const complete = (client: SupabaseClient, jobId: string, ok: boolean, stationId: string | null, err: string | null = null) =>
  client.rpc('station_complete_print_job', { p_job_id: jobId, p_ok: ok, p_error: err, p_station_id: stationId });

const heartbeat = (client: SupabaseClient, stationId: string) =>
  client.rpc('station_heartbeat', { p_station_id: stationId, p_version: '2.0.0-test', p_host: 'test-tablet',
    p_reachable: true, p_state: { paper_near_end: true }, p_error: null });

describe('tablet yazıcı istasyonu (0013)', () => {
  it('print_route kısıtı station değerini kabul eder, bilinmeyeni reddeder', async (ctx) => {
    guard(ctx);
    await setRoute('station');
    await expect(sql(`update public.settings set print_route = 'bilinmeyen' where id = 1`)).rejects.toThrow(/check/);
  });

  it('yalnız mutfak/admin çağırabilir: garson ve yazıcı hesabı reddedilir', async (ctx) => {
    guard(ctx);
    for (const [who, c] of [['waiter', waiter], ['printer', printer]] as const) {
      expect((await c.rpc('station_claim_print_job', { p_station_id: 'x' })).error?.message, who).toBe('not_authorized');
      expect((await complete(c, crypto.randomUUID(), true, 'x')).error?.message, who).toBe('not_authorized');
      expect((await heartbeat(c, 'x')).error?.message, who).toBe('not_authorized');
    }
  });

  it('baskı yolu agent iken istasyon iş almaz ve printer_status\'a dokunmaz', async (ctx) => {
    guard(ctx);
    await setRoute('agent');
    await orderWithJob();
    expect(await stationClaim(kitchen, 'test-st')).toEqual([]);
    const [before] = await sql<{ agent_id: string | null }>(`select agent_id from public.printer_status where id = 'main'`);
    expect((await heartbeat(kitchen, 'test-st')).error).toBeNull();
    const [after] = await sql<{ agent_id: string | null }>(`select agent_id from public.printer_status where id = 'main'`);
    expect(after!.agent_id).toBe(before!.agent_id);
    expect(after!.agent_id).not.toBe('station:test-st');
  });

  it('baskı yolu station: mutfak işi alır (ajan boş), ikinci alış boş, başarı printed + last_printed_at', async (ctx) => {
    guard(ctx);
    await setRoute('station');
    const orderId = await orderWithJob();
    const { data: agentJobs, error: agentError } = await printer.rpc('claim_print_job', { p_agent_id: 'test-agent' });
    expect(agentError).toBeNull();
    expect(agentJobs).toEqual([]);

    const [job] = await stationClaim(kitchen, 'test-st');
    expect(job).toMatchObject({ type: 'order', claimed_by: 'station:test-st' });
    expect(await stationClaim(kitchen, 'test-st-2')).toEqual([]);

    // Başka istasyon kimliğiyle kapatılamaz (R49 ile aynı sahiplik kuralı).
    expect((await complete(kitchen, job!.id, true, 'test-st-2')).error?.message).toBe('job_not_printing');
    expect((await complete(kitchen, job!.id, true, 'test-st')).error).toBeNull();
    const [row] = await sql<{ status: string; printed: boolean }>(`
      select j.status, (select ps.last_printed_at > now() - interval '1 minute' from public.printer_status ps
                        where ps.id = 'main') as printed
      from public.print_jobs j where j.order_id = '${orderId}'`);
    expect(row).toEqual({ status: 'printed', printed: true });
    expect((await complete(kitchen, job!.id, true, 'test-st')).error?.message).toBe('job_not_printing');
  });

  it('başarısızlık geri çekilir (5 sn), 6. hatada failed; admin de istasyon olabilir', async (ctx) => {
    guard(ctx);
    await setRoute('station');
    await orderWithJob();
    let [job] = await stationClaim(admin, 'test-st');
    const LADDER = [5, 15, 30, 60, 120];
    for (let i = 1; i <= 6; i++) {
      const [t] = await sql<{ t0: string }>(`select now()::text as t0`);
      expect((await complete(admin, job!.id, false, 'test-st', `err ${i}`)).error).toBeNull();
      const [r] = await sql<{ status: string; attempts: number; last_error: string; wait: number }>(`
        select status, attempts, last_error, extract(epoch from next_attempt_at - '${t!.t0}'::timestamptz)::int as wait
        from public.print_jobs where id = '${job!.id}'`);
      if (i < 6) {
        expect(r).toMatchObject({ status: 'pending', attempts: i, last_error: `err ${i}` });
        expect(r!.wait).toBeGreaterThanOrEqual(LADDER[i - 1]!);
        expect(r!.wait).toBeLessThan(LADDER[i - 1]! + 9);
        await sql(`update public.print_jobs set next_attempt_at = now() where id = '${job!.id}'`);
        [job] = await stationClaim(admin, 'test-st');
        expect(job).toBeDefined();
      } else {
        expect(r).toMatchObject({ status: 'failed', attempts: 6 });
      }
    }
  });

  it('istasyon kimliği verilmeden yalnız istasyonun sahiplendiği iş kapatılabilir; ajanınki kapatılamaz', async (ctx) => {
    guard(ctx);
    await setRoute('agent');
    await orderWithJob();
    const { data } = await printer.rpc('claim_print_job', { p_agent_id: 'test-agent' });
    const [agentJob] = data as Job[];
    expect(agentJob).toBeDefined();
    expect((await complete(kitchen, agentJob!.id, true, null)).error?.message).toBe('job_not_printing');
    expect((await complete(kitchen, crypto.randomUUID(), true, null)).error?.message).toBe('job_not_found');
    const [row] = await sql<{ status: string }>(`select status from public.print_jobs where id = '${agentJob!.id}'`);
    expect(row!.status).toBe('printing');
  });

  it('60 sn takılı kalan istasyon işi yeniden sahiplenilir', async (ctx) => {
    guard(ctx);
    await setRoute('station');
    await orderWithJob();
    const [job] = await stationClaim(kitchen, 'test-st-a');
    await sql(`update public.print_jobs set claimed_at = now() - interval '61 seconds' where id = '${job!.id}'`);
    expect((await stationClaim(kitchen, 'test-st-b'))[0]).toMatchObject({ id: job!.id, claimed_by: 'station:test-st-b' });
  });

  it('heartbeat printer_status\'u yazar (rota station), personel okur; ajanın heartbeat\'i ezmez', async (ctx) => {
    guard(ctx);
    await setRoute('station');
    expect((await heartbeat(kitchen, 'test-st')).error).toBeNull();
    await printer.rpc('agent_heartbeat', { p_agent_id: 'test-agent', p_version: '0.0.0', p_host: 'test',
      p_reachable: false, p_state: {}, p_error: 'ezmemeli' });
    const { data } = await waiter.from('printer_status')
      .select('agent_id, agent_version, host, printer_reachable, printer_state, last_error').single();
    expect(data).toEqual({ agent_id: 'station:test-st', agent_version: '2.0.0-test', host: 'test-tablet',
      printer_reachable: true, printer_state: { paper_near_end: true }, last_error: null });
  });
});
