import { createHash, randomBytes } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { cleanupFixtureOrders, ensureFixtures, hideFixtures, type Fixtures } from './helpers/fixtures';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers, serviceClient } from './helpers/users';

// 0012 — Epson Server Direct Print. CANLI veritabanında koşar:
// - Baskı yolu (`settings.print_route`) yalnız gerektiği testte, saniyeler içinde 'epson_sdp' yapılır ve
//   `finally` ile ÖNCEKİ değere döner (canlıda 'agent'). O sürede gelen gerçek bir sipariş ajan tarafından
//   basılmaz; test bittiğinde kuyrukta kalır ve ajan onu alır.
// - SDP'nin sahiplendiği her iş test siparişine mi ait diye bakılır; değilse iş geri bırakılır ve test düşer.
// - Test yazıcıları 'test-sdp-' önekiyle açılır ve sonunda silinir.

let f: Fixtures;
let waiter: SupabaseClient, admin: SupabaseClient, printer: SupabaseClient;
let service: SupabaseClient;
let previousRoute: string;
/** printer_status ('main') testten önceki hâli: SDP testleri onu ezer, sonunda aynen geri yazılır. */
let previousStatus: Record<string, unknown> | undefined;
const TEST_JOBS = `created_by in (select id from public.profiles where username like 'test-%')`;

const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');
type Claim = { printer: string; jobs: { id: string; type: string; payload: Record<string, unknown> }[];
  settings?: { codepage: string; codepageNumber: number; transliterate: boolean } };

beforeAll(async () => {
  await ensureTestUsers();
  f = await ensureFixtures();
  [waiter, admin, printer] = await Promise.all((['waiter', 'admin', 'printer'] as const).map(clientFor));
  service = serviceClient();
  const [s] = await sql<{ print_route: string }>(`select print_route from public.settings where id = 1`);
  previousRoute = s!.print_route;
  [previousStatus] = await sql(`select to_jsonb(ps) as row from public.printer_status ps where id = 'main'`)
    .then((rows) => rows.map((r) => r.row as Record<string, unknown>));
  const foreign = await sql(`select 1 from public.print_jobs
                             where status in ('pending','printing') and not (${TEST_JOBS})`);
  if (foreign.length) throw new Error('Kuyrukta test dışı iş var — gerçek fişe dokunmamak için test durdu.');
});
beforeEach(async () => {
  await cleanupFixtureOrders();
});
afterEach(async () => {
  await setRoute(previousRoute);
});
afterAll(async () => {
  await setRoute(previousRoute ?? 'agent');
  await sql(`delete from public.sdp_printers where name like 'test-sdp-%'`);
  if (previousStatus) {
    // Ajan o arada heartbeat attıysa onun yazdığı korunur; yalnız SDP test kaydı geri alınır.
    await sql(`update public.printer_status ps
               set (agent_id, agent_version, host, last_seen_at, printer_reachable, printer_state, last_error, last_printed_at)
                 = (select r.agent_id, r.agent_version, r.host, r.last_seen_at, r.printer_reachable, r.printer_state,
                           r.last_error, r.last_printed_at
                    from jsonb_populate_record(null::public.printer_status,
                                               '${JSON.stringify(previousStatus).replace(/'/g, "''")}'::jsonb) r)
               where ps.id = 'main' and ps.agent_id like 'epson-sdp:%'`);
  }
  await cleanupFixtureOrders();
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
  await hideFixtures();
});

async function setRoute(route: string) {
  await sql(`update public.settings set print_route = '${['epson_sdp', 'station'].includes(route) ? route : 'agent'}' where id = 1`);
}

async function createPrinter(name: string) {
  const { data, error } = await admin.rpc('create_sdp_printer', { p_name: name });
  if (error) throw error;
  return data as { id: string; token: string };
}

async function orderWithJob() {
  const id = crypto.randomUUID();
  const { error } = await waiter.rpc('submit_order', {
    p_order_id: id, p_table_id: f.tableId, p_items: [{ product_id: f.colaId, quantity: 1 }],
  });
  if (error) throw error;
  return id;
}

/** SDP adına iş alır; test siparişine ait olmayan bir iş gelirse onu geri bırakıp testi düşürür. */
async function sdpClaim(tokenHash: string): Promise<Claim> {
  const { data, error } = await service.rpc('sdp_claim_next', { p_token_hash: tokenHash });
  if (error) throw error;
  const claim = data as Claim;
  const ids = claim.jobs.map((j) => j.id);
  if (ids.length) {
    const foreign = await sql<{ id: string }>(`
      select j.id from public.print_jobs j
      where j.id in (${ids.map((i) => `'${i}'`).join(',')})
        and not (j.order_id in (select o.id from public.orders o join public.table_sessions ts on ts.id = o.session_id
                                join public.dining_tables t on t.id = ts.table_id where t.name like 'Test-Tisch%')
                 or ${TEST_JOBS})`);
    if (foreign.length) {
      await sql(`update public.print_jobs set status = 'pending', claimed_by = null, claimed_at = null
                 where id in (${foreign.map((r) => `'${r.id}'`).join(',')})`);
      throw new Error('SDP gerçek bir işi sahiplendi — iş geri bırakıldı.');
    }
  }
  return claim;
}

const complete = async (tokenHash: string, jobId: string, ok: boolean, err: string | null = null) => {
  const { data, error } = await service.rpc('sdp_complete',
    { p_token_hash: tokenHash, p_job_id: jobId, p_success: ok, p_error: err });
  if (error) throw error;
  return data as string;
};

describe('Epson SDP — yazıcı kaydı (admin)', () => {
  it('admin yazıcı ekler: düz anahtar yalnız yanıtta, DB\'de sha256 özeti; sütun okunamaz', async () => {
    const p = await createPrinter('test-sdp-kayit');
    expect(p.token).toMatch(/^[0-9a-f]{64}$/);
    const [row] = await sql<{ token_hash: string; is_active: boolean }>(
      `select token_hash, is_active from public.sdp_printers where id = '${p.id}'`);
    expect(row).toEqual({ token_hash: sha256(p.token), is_active: true });

    const list = await admin.from('sdp_printers').select('id, name, is_active, last_seen_at');
    expect(list.error).toBeNull();
    expect(list.data?.map((r) => r.id)).toContain(p.id);
    expect((await admin.from('sdp_printers').select('token_hash')).error).not.toBeNull();

    const [audit] = await sql<{ n: number }>(
      `select count(*)::int as n from public.audit_log where action = 'sdp_printer_create' and entity_id = '${p.id}'`);
    expect(audit!.n).toBe(1);
  });

  it('admin dışı kullanıcı yazıcıları göremez ve ekleyemez; boş ad reddedilir', async () => {
    await createPrinter('test-sdp-gizli');
    expect((await waiter.from('sdp_printers').select('id')).data ?? []).toEqual([]);
    expect((await printer.from('sdp_printers').select('id')).data ?? []).toEqual([]);
    expect((await waiter.rpc('create_sdp_printer', { p_name: 'test-sdp-x' })).error?.message).toBe('not_authorized');
    expect((await admin.rpc('create_sdp_printer', { p_name: '   ' })).error?.message).toBe('printer_name_invalid');
  });

  it('SDP iç fonksiyonları personel oturumlarına kapalı (yalnız service_role)', async () => {
    const hash = sha256('x');
    expect((await admin.rpc('sdp_claim_next', { p_token_hash: hash })).error?.code).toBe('42501');
    expect((await printer.rpc('sdp_complete',
      { p_token_hash: hash, p_job_id: crypto.randomUUID(), p_success: true, p_error: null })).error?.code).toBe('42501');
  });

  it('yanlış anahtar ve pasif yazıcı reddedilir; anahtar yenilenince eskisi geçersiz', async () => {
    const p = await createPrinter('test-sdp-anahtar');
    expect((await sdpClaim(sha256(randomBytes(32).toString('hex')))).printer).toBe('unknown');

    expect((await admin.rpc('set_sdp_printer_active', { p_id: p.id, p_active: false })).error).toBeNull();
    expect(await sdpClaim(sha256(p.token))).toMatchObject({ printer: 'inactive', jobs: [] });
    expect(await complete(sha256(p.token), crypto.randomUUID(), true)).toBe('inactive');
    expect((await admin.rpc('set_sdp_printer_active', { p_id: p.id, p_active: true })).error).toBeNull();

    const { data, error } = await admin.rpc('rotate_sdp_printer_token', { p_id: p.id });
    expect(error).toBeNull();
    const next = data as { id: string; token: string };
    expect(next.token).not.toBe(p.token);
    expect((await sdpClaim(sha256(p.token))).printer).toBe('unknown');
    expect((await sdpClaim(sha256(next.token))).printer).toBe('ok');
    const [seen] = await sql<{ seen: boolean }>(
      `select last_seen_at > now() - interval '1 minute' as seen from public.sdp_printers where id = '${p.id}'`);
    expect(seen!.seen).toBe(true);
  });
});

describe('Epson SDP — kuyruk', () => {
  it('baskı yolu epson_sdp: ajan boş döner, SDP işi alır, başarı printed yapar ve printer_status\'u günceller', async () => {
    const p = await createPrinter('test-sdp-kuyruk');
    const hash = sha256(p.token);
    await setRoute('epson_sdp');
    try {
      const orderId = await orderWithJob();

      const agent = await printer.rpc('claim_print_job', { p_agent_id: 'test-agent' });
      expect(agent.error).toBeNull();
      expect(agent.data).toEqual([]);

      const claim = await sdpClaim(hash);
      expect(claim.printer).toBe('ok');
      expect(claim.jobs).toHaveLength(1);
      expect(claim.jobs[0]).toMatchObject({ type: 'order', payload: { table: 'Test-Tisch' } });
      expect(claim.settings).toMatchObject({ codepage: expect.any(String), codepageNumber: expect.any(Number) });
      const jobId = claim.jobs[0]!.id;
      const [claimed] = await sql<{ status: string; claimed_by: string; order_id: string }>(
        `select status, claimed_by, order_id from public.print_jobs where id = '${jobId}'`);
      expect(claimed).toEqual({ status: 'printing', claimed_by: `epson-sdp:${p.id}`, order_id: orderId });
      expect((await sdpClaim(hash)).jobs).toEqual([]);

      // Baskı yolu SDP iken ajanın heartbeat'i printer_status'u ezmez.
      expect((await printer.rpc('agent_heartbeat', { p_agent_id: 'test-agent', p_version: '0.0.0', p_host: 'test',
        p_reachable: false, p_state: {}, p_error: 'x' })).error).toBeNull();

      expect(await complete(hash, jobId, true)).toBe('ok');
      const [done] = await sql<{ status: string; printed_at: string | null }>(
        `select status, printed_at from public.print_jobs where id = '${jobId}'`);
      expect(done!.status).toBe('printed');
      expect(done!.printed_at).not.toBeNull();

      const [ps] = await sql<{ agent_id: string; host: string; printer_reachable: boolean; fresh: boolean; printed: boolean }>(`
        select agent_id, host, printer_reachable, last_seen_at > now() - interval '1 minute' as fresh,
               last_printed_at > now() - interval '1 minute' as printed
        from public.printer_status where id = 'main'`);
      expect(ps).toEqual({ agent_id: `epson-sdp:${p.id}`, host: 'Epson SDP', printer_reachable: true, fresh: true, printed: true });
      expect(await complete(hash, jobId, true)).toBe('job_not_printing');
    } finally {
      // Önce test işleri silinir: yol 'agent'e dönünce canlı ajan bekleyen test işini basmasın.
      await cleanupFixtureOrders();
      await setRoute(previousRoute);
    }
  });

  it('başarısız sonuç geri çekilir (5 sn), kağıt bitti durumu yazılır; başka yazıcı işi kapatamaz', async () => {
    const p = await createPrinter('test-sdp-hata');
    const other = await createPrinter('test-sdp-baska');
    const hash = sha256(p.token);
    await setRoute('epson_sdp');
    try {
      await orderWithJob();
      const [job] = (await sdpClaim(hash)).jobs;
      expect(job).toBeDefined();
      expect(await complete(sha256(other.token), job!.id, true)).toBe('job_not_printing');

      const [t] = await sql<{ t0: string }>(`select now()::text as t0`);
      expect(await complete(hash, job!.id, false, 'EPTR_REC_EMPTY')).toBe('ok');
      const [r] = await sql<{ status: string; attempts: number; last_error: string; wait: number }>(`
        select status, attempts, last_error, extract(epoch from next_attempt_at - '${t!.t0}'::timestamptz)::int as wait
        from public.print_jobs where id = '${job!.id}'`);
      expect(r).toMatchObject({ status: 'pending', attempts: 1, last_error: 'EPTR_REC_EMPTY' });
      expect(r!.wait).toBeGreaterThanOrEqual(5);
      expect(r!.wait).toBeLessThan(14);

      const [ps] = await sql<{ printer_reachable: boolean; paper_end: boolean; last_error: string }>(`
        select printer_reachable, (printer_state->>'paper_end')::boolean as paper_end, last_error
        from public.printer_status where id = 'main'`);
      expect(ps).toEqual({ printer_reachable: true, paper_end: true, last_error: 'EPTR_REC_EMPTY' });
      const [pr] = await sql<{ last_error: string }>(`select last_error from public.sdp_printers where id = '${p.id}'`);
      expect(pr!.last_error).toBe('EPTR_REC_EMPTY');
    } finally {
      // Önce test işleri silinir: yol 'agent'e dönünce canlı ajan bekleyen test işini basmasın.
      await cleanupFixtureOrders();
      await setRoute(previousRoute);
    }
  });

  it('baskı yolu agent iken SDP iş almaz (yalnız son görülme güncellenir)', async () => {
    const p = await createPrinter('test-sdp-ajan-yolu');
    await setRoute('agent');
    // Ajan canlıda çalışıyor olabilir: bu testte kuyruğa iş KONMAZ, yalnız SDP'nin boş döndüğü görülür.
    const claim = await sdpClaim(sha256(p.token));
    expect(claim).toMatchObject({ printer: 'ok', jobs: [] });
    expect(claim.settings).toBeUndefined();
  });
});
