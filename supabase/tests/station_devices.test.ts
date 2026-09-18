import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, type TestContext } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, hideFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { anonClient, clientFor, ensureTestUsers, serviceClient } from './helpers/users';

// 0015 — Arka plan yazıcı istasyonu (station_devices + station_feed_*). CANLI veritabanında koşar:
// - Kuyrukta test dışı bekleyen/basılan iş varsa kuyruk testleri ATLANIR (gerçek fişe dokunulmaz).
// - Baskı yolu yalnız gerektiği testte saniyeler içinde 'station' yapılır ve `finally` ile ÖNCEKİ değere döner
//   (canlıda 'agent'). Önce test işleri silinir: yol 'agent'e dönünce canlı ajan bekleyen test işini basmasın.
// - Cihazın sahiplendiği her iş test siparişine mi ait diye bakılır; değilse geri bırakılır ve test düşer.
// - Test cihazları 'test-sd-' önekiyle açılır ve sonunda silinir; printer_status ('main') eski hâline döner.

let f: Fixtures;
let waiter: SupabaseClient, kitchen: SupabaseClient, admin: SupabaseClient, printer: SupabaseClient;
let service: SupabaseClient;
let previousRoute = 'agent';
let previousStatus: Record<string, unknown> | undefined;
let foreignJobs = false;
let hasPrinterHost = false;
const TEST_JOBS = `created_by in (select id from public.profiles where username like 'test-%')`;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
type Device = { id: string; token: string };
type Claim = {
  device: 'ok' | 'unknown';
  route?: string;
  printer?: { host: string | null; port: number };
  settings?: { codepage: string; codepageNumber: number; transliterate: boolean };
  job: { id: string; type: string; payload: Record<string, unknown> } | null;
};

beforeAll(async () => {
  await ensureTestUsers();
  f = await ensureFixtures();
  [waiter, kitchen, admin, printer] = await Promise.all(
    (['waiter', 'kitchen', 'admin', 'printer'] as const).map(clientFor));
  service = serviceClient();
  const [s] = await sql<{ print_route: string; has_host: boolean }>(
    `select print_route, btrim(printer_host) <> '' as has_host from public.settings where id = 1`);
  previousRoute = s!.print_route;
  hasPrinterHost = s!.has_host;
  [previousStatus] = await sql(`select to_jsonb(ps) as row from public.printer_status ps where id = 'main'`)
    .then((rows) => rows.map((r) => r.row as Record<string, unknown>));
  foreignJobs = (await sql(`select 1 from public.print_jobs
                            where status in ('pending','printing') and not (${TEST_JOBS})`)).length > 0;
});
beforeEach(async () => {
  await cleanupFixtureOrders();
});
afterEach(async () => {
  await setRoute(previousRoute);
});
afterAll(async () => {
  await cleanupFixtureOrders();
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
  await setRoute(previousRoute);
  await sql(`delete from public.station_devices where name like 'test-sd-%'`);
  if (previousStatus) {
    // Ajan o arada heartbeat attıysa onun yazdığı korunur; yalnız arka plan istasyonu test kaydı geri alınır.
    await sql(`update public.printer_status ps
               set (agent_id, agent_version, host, last_seen_at, printer_reachable, printer_state, last_error, last_printed_at)
                 = (select r.agent_id, r.agent_version, r.host, r.last_seen_at, r.printer_reachable, r.printer_state,
                           r.last_error, r.last_printed_at
                    from jsonb_populate_record(null::public.printer_status,
                                               '${JSON.stringify(previousStatus).replace(/'/g, "''")}'::jsonb) r)
               where ps.id = 'main' and ps.agent_id like 'station-bg:%'`);
  }
  await hideFixtures();
});

/** Kuyruk testleri: kuyrukta gerçek iş varsa ya da yazıcı adresi boşsa (iş verilmez) atlanır. */
const guard = (ctx: TestContext) => {
  if (foreignJobs || !hasPrinterHost) ctx.skip();
};

async function setRoute(route: string) {
  await sql(`update public.settings set print_route = '${['epson_sdp', 'station'].includes(route) ? route : 'agent'}' where id = 1`);
}

async function register(client: SupabaseClient, name: string): Promise<Device> {
  const { data, error } = await client.rpc('register_station_device', { p_name: name });
  if (error) throw error;
  return data as Device;
}

async function orderWithJob() {
  const id = crypto.randomUUID();
  const { error } = await waiter.rpc('submit_order', {
    p_order_id: id, p_table_id: f.tableId, p_items: [{ product_id: f.colaId, quantity: 1 }],
  });
  if (error) throw error;
  return id;
}

/** Cihaz adına iş alır; test siparişine ait olmayan bir iş gelirse onu geri bırakıp testi düşürür. */
async function feedClaim(tokenHash: string): Promise<Claim> {
  const { data, error } = await service.rpc('station_feed_claim', { p_token_hash: tokenHash });
  if (error) throw error;
  const claim = data as Claim;
  if (claim.job) {
    const foreign = await sql<{ id: string }>(`
      select j.id from public.print_jobs j
      where j.id = '${claim.job.id}'
        and not (j.order_id in (select o.id from public.orders o join public.table_sessions ts on ts.id = o.session_id
                                join public.dining_tables t on t.id = ts.table_id where t.name like 'Test-Tisch%')
                 or ${TEST_JOBS})`);
    if (foreign.length) {
      await sql(`update public.print_jobs set status = 'pending', claimed_by = null, claimed_at = null
                 where id = '${claim.job.id}'`);
      throw new Error('Arka plan istasyonu gerçek bir işi sahiplendi — iş geri bırakıldı.');
    }
  }
  return claim;
}

const feedComplete = async (tokenHash: string, jobId: string, ok: boolean, err: string | null = null) => {
  const { data, error } = await service.rpc('station_feed_complete',
    { p_token_hash: tokenHash, p_job_id: jobId, p_ok: ok, p_error: err });
  if (error) throw error;
  return data as string;
};

const feedHeartbeat = async (tokenHash: string, over: Record<string, unknown> = {}) => {
  const { data, error } = await service.rpc('station_feed_heartbeat', {
    p_token_hash: tokenHash, p_version: '3.0.0-test', p_reachable: true, p_state: { paper_near_end: true },
    p_error: null, ...over });
  if (error) throw error;
  return data as string;
};

describe('arka plan istasyonu — cihaz kaydı (0015)', () => {
  it('mutfak ve admin cihaz kaydeder: düz anahtar yalnız yanıtta, DB\'de sha256; liste token_hash göstermez', async () => {
    for (const [who, client] of [['kitchen', kitchen], ['admin', admin]] as const) {
      const d = await register(client, `  test-sd-kayit-${who}  `);
      expect(d.token, who).toMatch(/^[0-9a-f]{64}$/);
      expect(Object.keys(d).sort()).toEqual(['id', 'token']);
      const [row] = await sql<{ name: string; token_hash: string; by: string }>(`
        select d.name, d.token_hash, p.username as by
        from public.station_devices d join public.profiles p on p.id = d.created_by where d.id = '${d.id}'`);
      expect(row).toEqual({ name: `test-sd-kayit-${who}`, token_hash: sha256(d.token), by: `test-${who}` });

      const list = await client.from('station_devices')
        .select('id, name, created_at, last_seen_at, last_printed_at, last_error');
      expect(list.error, who).toBeNull();
      expect(list.data?.map((r) => r.id)).toContain(d.id);
      expect(JSON.stringify(list.data)).not.toContain(sha256(d.token));
      expect((await client.from('station_devices').select('token_hash')).error, who).not.toBeNull();
      expect((await client.from('station_devices').select('*')).error, who).not.toBeNull();

      const [audit] = await sql<{ n: number }>(`select count(*)::int as n from public.audit_log
                                                where action = 'station_device_register' and entity_id = '${d.id}'`);
      expect(audit!.n).toBe(1);
    }
  });

  it('garson, yazıcı hesabı ve anon kaydedemez, listeyi göremez; ad doğrulanır', async () => {
    await register(admin, 'test-sd-gizli');
    for (const [who, c] of [['waiter', waiter], ['printer', printer]] as const) {
      expect((await c.rpc('register_station_device', { p_name: 'test-sd-x' })).error?.message, who).toBe('not_authorized');
      expect((await c.from('station_devices').select('id')).data ?? [], who).toEqual([]);
    }
    const anon = anonClient();
    expect((await anon.rpc('register_station_device', { p_name: 'test-sd-x' })).error?.code).toBe('42501');
    expect((await anon.from('station_devices').select('id')).data ?? []).toEqual([]);

    for (const name of ['', '   ', 'x'.repeat(61)]) {
      expect((await kitchen.rpc('register_station_device', { p_name: name })).error?.message, JSON.stringify(name))
        .toBe('station_device_name_invalid');
    }
    expect((await kitchen.rpc('register_station_device', { p_name: null })).error?.message)
      .toBe('station_device_name_invalid');
    const [n] = await sql<{ n: number }>(`select count(*)::int as n from public.station_devices where name = 'test-sd-x'`);
    expect(n!.n).toBe(0);
  });

  it('station_feed_* yalnız service_role: personel ve anon oturumlarına kapalı', async () => {
    const hash = sha256('x');
    for (const [who, c] of [['admin', admin], ['kitchen', kitchen], ['anon', anonClient()]] as const) {
      expect((await c.rpc('station_feed_claim', { p_token_hash: hash })).error?.code, who).toBe('42501');
      expect((await c.rpc('station_feed_complete',
        { p_token_hash: hash, p_job_id: crypto.randomUUID(), p_ok: true, p_error: null })).error?.code, who).toBe('42501');
      expect((await c.rpc('station_feed_heartbeat', { p_token_hash: hash, p_version: '1', p_reachable: true,
        p_state: {}, p_error: null })).error?.code, who).toBe('42501');
    }
    const grants = await sql<{ fn: string; anon: boolean; authenticated: boolean; service: boolean }>(`
      select p.oid::regprocedure::text as fn,
             has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('service_role', p.oid, 'execute') as service
      from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname like 'station_feed_%'`);
    expect(grants).toHaveLength(3);
    expect(grants.filter((g) => g.anon || g.authenticated || !g.service).map((g) => g.fn)).toEqual([]);
  });

  it('bilinmeyen anahtar: claim unknown (iş yok), complete/heartbeat unknown', async () => {
    const hash = sha256(randomBytes(32).toString('hex'));
    expect(await feedClaim(hash)).toEqual({ device: 'unknown', job: null });
    expect(await feedComplete(hash, crypto.randomUUID(), true)).toBe('unknown');
    expect(await feedHeartbeat(hash)).toBe('unknown');
  });
});

describe('arka plan istasyonu — kuyruk (0015)', () => {
  it('baskı yolu agent iken iş verilmez, printer_status\'a dokunulmaz; son görülme güncellenir', async () => {
    const d = await register(kitchen, 'test-sd-ajan-yolu');
    await setRoute('agent');
    // Ajan canlıda çalışıyor olabilir: bu testte kuyruğa iş KONMAZ, yalnız cihazın boş döndüğü görülür.
    const [before] = await sql<{ agent_id: string | null }>(`select agent_id from public.printer_status where id = 'main'`);
    const claim = await feedClaim(sha256(d.token));
    expect(claim).toMatchObject({ device: 'ok', route: 'agent', job: null });
    expect(claim.printer).toEqual({ host: hasPrinterHost ? expect.any(String) : null, port: expect.any(Number) });
    expect(claim.settings).toEqual({ codepage: expect.any(String), codepageNumber: expect.any(Number),
      transliterate: expect.any(Boolean) });
    expect(await feedHeartbeat(sha256(d.token), { p_reachable: false, p_error: 'offline: test' })).toBe('ok');
    const [after] = await sql<{ agent_id: string | null }>(`select agent_id from public.printer_status where id = 'main'`);
    expect(after!.agent_id).toBe(before!.agent_id);
    const [dev] = await sql<{ seen: boolean; last_error: string | null }>(`
      select last_seen_at > now() - interval '1 minute' as seen, last_error from public.station_devices where id = '${d.id}'`);
    expect(dev).toEqual({ seen: true, last_error: 'offline: test' });
  });

  it('baskı yolu station: ajan boş döner, cihaz tek işi alır (station-bg:<id>), başarı printed + son baskı', async (ctx) => {
    guard(ctx);
    const d = await register(kitchen, 'test-sd-kuyruk');
    const other = await register(admin, 'test-sd-baska');
    const hash = sha256(d.token);
    await setRoute('station');
    try {
      const orderId = await orderWithJob();
      const agent = await printer.rpc('claim_print_job', { p_agent_id: 'test-agent' });
      expect(agent.error).toBeNull();
      expect(agent.data).toEqual([]);

      const claim = await feedClaim(hash);
      expect(claim).toMatchObject({ device: 'ok', route: 'station', job: { type: 'order', payload: { table: 'Test-Tisch' } } });
      expect(claim.printer!.host).toEqual(expect.any(String));
      const jobId = claim.job!.id;
      const [claimed] = await sql<{ status: string; claimed_by: string; order_id: string }>(
        `select status, claimed_by, order_id from public.print_jobs where id = '${jobId}'`);
      expect(claimed).toEqual({ status: 'printing', claimed_by: `station-bg:${d.id}`, order_id: orderId });
      expect((await feedClaim(hash)).job).toBeNull();
      expect((await feedClaim(sha256(other.token))).job).toBeNull();

      // Durum satırını cihaz devraldı (host = cihaz adı).
      const [ps] = await sql<{ agent_id: string; host: string; fresh: boolean }>(`
        select agent_id, host, last_seen_at > now() - interval '1 minute' as fresh from public.printer_status where id = 'main'`);
      expect(ps).toEqual({ agent_id: `station-bg:${other.id}`, host: 'test-sd-baska', fresh: true });

      // Başka cihaz ve ön plandaki istasyon (station:%) bu işi kapatamaz.
      expect(await feedComplete(sha256(other.token), jobId, true)).toBe('job_not_printing');
      expect((await kitchen.rpc('station_complete_print_job',
        { p_job_id: jobId, p_ok: true, p_error: null, p_station_id: null })).error?.message).toBe('job_not_printing');

      expect(await feedComplete(hash, jobId, true)).toBe('ok');
      const [done] = await sql<{ status: string; printed: boolean }>(
        `select status, printed_at is not null as printed from public.print_jobs where id = '${jobId}'`);
      expect(done).toEqual({ status: 'printed', printed: true });
      const [dev] = await sql<{ printed: boolean; last_error: string | null }>(`
        select last_printed_at > now() - interval '1 minute' as printed, last_error
        from public.station_devices where id = '${d.id}'`);
      expect(dev).toEqual({ printed: true, last_error: null });
      const [ps2] = await sql<{ agent_id: string; host: string; printer_reachable: boolean; last_error: string | null;
                                printed: boolean }>(`
        select agent_id, host, printer_reachable, last_error, last_printed_at > now() - interval '1 minute' as printed
        from public.printer_status where id = 'main'`);
      expect(ps2).toEqual({ agent_id: `station-bg:${d.id}`, host: 'test-sd-kuyruk', printer_reachable: true,
        last_error: null, printed: true });
      expect(await feedComplete(hash, jobId, true)).toBe('job_not_printing');
      expect(await feedComplete(hash, crypto.randomUUID(), true)).toBe('job_not_found');
    } finally {
      await cleanupFixtureOrders();
      await setRoute(previousRoute);
    }
  });

  it('başarısız sonuç geri çekilir (5 sn); kağıt bitti durumu ve cihaz hatası yazılır', async (ctx) => {
    guard(ctx);
    const d = await register(kitchen, 'test-sd-hata');
    const hash = sha256(d.token);
    await setRoute('station');
    try {
      await orderWithJob();
      const { job } = await feedClaim(hash);
      expect(job).not.toBeNull();
      const [t] = await sql<{ t0: string }>(`select now()::text as t0`);
      expect(await feedComplete(hash, job!.id, false, 'paper_end: Kağıt bitti')).toBe('ok');
      const [r] = await sql<{ status: string; attempts: number; last_error: string; wait: number; claimed_by: string }>(`
        select status, attempts, last_error, claimed_by,
               extract(epoch from next_attempt_at - '${t!.t0}'::timestamptz)::int as wait
        from public.print_jobs where id = '${job!.id}'`);
      expect(r).toMatchObject({ status: 'pending', attempts: 1, last_error: 'paper_end: Kağıt bitti' });
      expect(r!.wait).toBeGreaterThanOrEqual(5);
      expect(r!.wait).toBeLessThan(14);

      const [ps] = await sql<{ paper_end: boolean; last_error: string; printer_reachable: boolean | null }>(`
        select (printer_state->>'paper_end')::boolean as paper_end, last_error, printer_reachable
        from public.printer_status where id = 'main'`);
      expect(ps).toMatchObject({ paper_end: true, last_error: 'paper_end: Kağıt bitti' });
      expect(ps!.printer_reachable).not.toBe(false);
      const [dev] = await sql<{ last_error: string }>(`select last_error from public.station_devices where id = '${d.id}'`);
      expect(dev!.last_error).toBe('paper_end: Kağıt bitti');
    } finally {
      await cleanupFixtureOrders();
      await setRoute(previousRoute);
    }
  });

  it('heartbeat (rota station) printer_status\'u yazar; personel okur; ajanın heartbeat\'i ezmez', async (ctx) => {
    guard(ctx);
    const d = await register(kitchen, 'test-sd-nabiz');
    await setRoute('station');
    try {
      expect(await feedHeartbeat(sha256(d.token))).toBe('ok');
      await printer.rpc('agent_heartbeat', { p_agent_id: 'test-agent', p_version: '0.0.0', p_host: 'test',
        p_reachable: false, p_state: {}, p_error: 'ezmemeli' });
      const { data } = await waiter.from('printer_status')
        .select('agent_id, agent_version, host, printer_reachable, printer_state, last_error').single();
      expect(data).toEqual({ agent_id: `station-bg:${d.id}`, agent_version: '3.0.0-test', host: 'test-sd-nabiz',
        printer_reachable: true, printer_state: { paper_near_end: true }, last_error: null });
      // Nesne olmayan durum boş nesneye çevrilir.
      expect(await feedHeartbeat(sha256(d.token), { p_state: [1, 2] })).toBe('ok');
      const [ps] = await sql<{ printer_state: unknown }>(`select printer_state from public.printer_status where id = 'main'`);
      expect(ps!.printer_state).toEqual({});
    } finally {
      await setRoute(previousRoute);
    }
  });

  it('revoke: kaydı siler, anahtar geçersizleşir, elindeki işi kuyruğa geri bırakır (deneme artmaz)', async (ctx) => {
    guard(ctx);
    const d = await register(admin, 'test-sd-iptal');
    const hash = sha256(d.token);
    await setRoute('station');
    try {
      await orderWithJob();
      const { job } = await feedClaim(hash);
      expect(job).not.toBeNull();

      expect((await waiter.rpc('revoke_station_device', { p_id: d.id })).error?.message).toBe('not_authorized');
      expect((await kitchen.rpc('revoke_station_device', { p_id: d.id })).error).toBeNull();
      expect((await kitchen.rpc('revoke_station_device', { p_id: d.id })).error?.message).toBe('station_device_not_found');

      const [r] = await sql<{ status: string; claimed_by: string | null; claimed_at: string | null; attempts: number;
                              due: boolean }>(`
        select status, claimed_by, claimed_at, attempts, next_attempt_at <= now() as due
        from public.print_jobs where id = '${job!.id}'`);
      expect(r).toEqual({ status: 'pending', claimed_by: null, claimed_at: null, attempts: 0, due: true });
      expect(await feedClaim(hash)).toEqual({ device: 'unknown', job: null });
      expect(await feedComplete(hash, job!.id, true)).toBe('unknown');
      expect(await feedHeartbeat(hash)).toBe('unknown');
      const [audit] = await sql<{ released: number }>(`
        select (details->>'released_jobs')::int as released from public.audit_log
        where action = 'station_device_revoke' and entity_id = '${d.id}'`);
      expect(audit!.released).toBe(1);
    } finally {
      await cleanupFixtureOrders();
      await setRoute(previousRoute);
    }
  });
});

// Yayındaki Edge Function (`npm run fn:deploy -- station-feed --no-verify-jwt`) uçtan uca: sözleşme (logic.ts başı).
describe('arka plan istasyonu — station-feed Edge Function (0015)', () => {
  const fnUrl = () => `${process.env.SUPABASE_URL}/functions/v1/station-feed`;
  const call = async (body: unknown, token?: string, method = 'POST') => {
    const res = await fetch(fnUrl(), {
      method,
      headers: { 'Content-Type': 'application/json', ...(token ? { 'x-station-token': token } : {}) },
      body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? (JSON.parse(text) as Record<string, unknown>) : null };
  };

  it('kimlik: anahtar yok/bozuk/bilinmeyen → 401, GET → 405, bozuk JSON → 400', async () => {
    const bogus = randomBytes(32).toString('hex');
    expect(await call({ action: 'next', waitMs: 0 })).toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect(await call({ action: 'next', waitMs: 0 }, 'abc')).toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect(await call({ action: 'next', waitMs: 0 }, bogus)).toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect(await call({ action: 'heartbeat', version: '1', reachable: true }, bogus))
      .toEqual({ status: 401, body: { error: 'unauthorized' } });
    expect((await call(null, bogus, 'GET')).status).toBe(405);
    expect(await call('{', bogus)).toEqual({ status: 400, body: { error: 'bad_request' } });
  });

  it('rota agent: next boş döner (iş alınmaz), heartbeat ok, olmayan iş job_not_found', async () => {
    const d = await register(kitchen, 'test-sd-fn-ajan');
    await setRoute('agent');
    const next = await call({ action: 'next', waitMs: 0 }, d.token);
    expect(next.status).toBe(200);
    expect(next.body).toEqual({ job: null, route: 'agent',
      printer: { host: hasPrinterHost ? expect.any(String) : null, port: expect.any(Number) } });
    expect(await call({ action: 'heartbeat', version: '3.0.0-test', reachable: true, state: {}, error: null }, d.token))
      .toEqual({ status: 200, body: { result: 'ok' } });
    expect(await call({ action: 'complete', jobId: crypto.randomUUID(), ok: true }, d.token))
      .toEqual({ status: 200, body: { result: 'job_not_found' } });
    expect(await call({ action: 'complete', jobId: 'x', ok: true }, d.token))
      .toEqual({ status: 400, body: { error: 'bad_request' } });
  });

  it('rota station: next işi ESC/POS (base64) olarak verir, complete printed yapar; iptal edilen cihaz 401', async (ctx) => {
    guard(ctx);
    const d = await register(kitchen, 'test-sd-fn-kuyruk');
    await setRoute('station');
    try {
      const orderId = await orderWithJob();
      const next = await call({ action: 'next', waitMs: 3000 }, d.token);
      expect(next.status).toBe(200);
      const job = next.body!.job as { id: string; data: string } | null;
      expect(job).not.toBeNull();
      const [own] = await sql<{ order_id: string; claimed_by: string }>(
        `select order_id, claimed_by from public.print_jobs where id = '${job!.id}'`);
      if (own!.order_id !== orderId) {
        await sql(`update public.print_jobs set status = 'pending', claimed_by = null, claimed_at = null
                   where id = '${job!.id}'`);
        throw new Error('Arka plan istasyonu gerçek bir işi sahiplendi — iş geri bırakıldı.');
      }
      expect(own!.claimed_by).toBe(`station-bg:${d.id}`);
      expect(next.body!.route).toBe('station');
      const bytes = Buffer.from(job!.data, 'base64');
      expect([...bytes.subarray(0, 2)]).toEqual([0x1b, 0x40]); // ESC @ (yazıcıyı sıfırla)
      expect(bytes.length).toBeGreaterThan(50);

      expect(await call({ action: 'complete', jobId: job!.id, ok: true }, d.token))
        .toEqual({ status: 200, body: { result: 'ok' } });
      const [done] = await sql<{ status: string }>(`select status from public.print_jobs where id = '${job!.id}'`);
      expect(done!.status).toBe('printed');

      expect((await kitchen.rpc('revoke_station_device', { p_id: d.id })).error).toBeNull();
      expect(await call({ action: 'next', waitMs: 0 }, d.token)).toEqual({ status: 401, body: { error: 'unauthorized' } });
    } finally {
      await cleanupFixtureOrders();
      await setRoute(previousRoute);
    }
  });
});
