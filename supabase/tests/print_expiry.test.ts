import type { SupabaseClient } from '@supabase/supabase-js';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from './helpers/sql';
import { clientFor, ensureTestUsers } from './helpers/users';

// 0019 — 3 saatten uzun süre basılamayan fiş otomatik iptal ('expired').
//
// CANLI veritabanında, restoranın istasyonu açıkken koşar. Bu yüzden testte HİÇBİR iş basılabilir durumda
// kuyruğa girmez: her satır ya zaten süresi dolmuş (ilk sahiplenen onu basmadan iptal eder — test edilen
// davranış), ya henüz zamanı gelmemiş (`next_attempt_at` gelecekte), ya yeni sahiplenilmiş ('printing',
// 60 sn dolmadan kimse alamaz) ya da 'failed'. Sipariş/masa oluşturulmaz, yük yalnız "test" fişidir.

const TEST_JOBS = `created_by in (select id from public.profiles where username like 'test-%')`;
const PAYLOAD = `'{"kind":"test","header":"TEST","table":"Test","orderNo":0,"round":1,"items":[]}'::jsonb`;
type Row = { status: string; last_error: string | null };
let admin: SupabaseClient;

beforeAll(async () => {
  await ensureTestUsers();
  admin = await clientFor('admin');
});
beforeEach(async () => {
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
});
afterAll(async () => {
  await sql(`delete from public.print_jobs where ${TEST_JOBS}`);
});

/** Test kullanıcısı adına doğrudan iş satırı ekler; `cols` sütun → SQL ifadesi. */
async function insertJob(cols: Record<string, string>): Promise<string> {
  const all: Record<string, string> = {
    type: `'test'`,
    payload: PAYLOAD,
    created_by: `(select id from public.profiles where username = 'test-admin')`,
    ...cols,
  };
  const [r] = await sql<{ id: string }>(
    `insert into public.print_jobs (${Object.keys(all).join(', ')})
     values (${Object.values(all).join(', ')}) returning id`);
  return r!.id;
}
const rowOf = async (id: string) =>
  (await sql<Row>(`select status::text, last_error from public.print_jobs where id = '${id}'`))[0]!;
const expire = () => sql(`select internal.expire_print_jobs()`);

describe('fiş süre aşımı (0019)', () => {
  it('3 saatten eski bekleyen iş expired olur, son hata korunur', async () => {
    const id = await insertJob({
      created_at: `now() - interval '4 hours'`,
      next_attempt_at: `now() - interval '4 hours'`,
      last_error: `'offline: connect timed out'`,
    });
    await expire();
    const r = await rowOf(id);
    expect(r.status).toBe('expired');
    expect(r.last_error).toMatch(/^expired: 3 saat/);
    expect(r.last_error).toContain('son hata: offline: connect timed out');
  });

  it('60 sn’den uzun takılı kalmış eski printing işi expired, şu an basılmakta olan eski iş ellenmez', async () => {
    const stuck = await insertJob({
      status: `'printing'`, claimed_by: `'test-agent'`, claimed_at: `now() - interval '5 minutes'`,
      created_at: `now() - interval '4 hours'`, next_attempt_at: `now() - interval '4 hours'`,
    });
    const active = await insertJob({
      status: `'printing'`, claimed_by: `'test-agent'`, claimed_at: `now()`,
      created_at: `now() - interval '4 hours'`, next_attempt_at: `now() - interval '4 hours'`,
    });
    await expire();
    expect((await rowOf(stuck)).status).toBe('expired');
    expect((await rowOf(active)).status).toBe('printing');
  });

  it('saat son denemeden işler: eski ama yeniden denenmiş iş ve failed iş dokunulmaz', async () => {
    // "Tekrar dene" next_attempt_at'i yeniler; burada gelecekte tutulur ki canlı istasyon onu alamasın.
    const retried = await insertJob({
      created_at: `now() - interval '5 hours'`, next_attempt_at: `now() + interval '10 minutes'`,
    });
    const failed = await insertJob({
      status: `'failed'`, created_at: `now() - interval '5 hours'`, next_attempt_at: `now() - interval '5 hours'`,
    });
    await expire();
    expect((await rowOf(retried)).status).toBe('pending');
    expect((await rowOf(failed)).status).toBe('failed');
  });

  it('süresi dolan iş tekrar denenemez (retry yalnız failed kabul eder)', async () => {
    const id = await insertJob({
      created_at: `now() - interval '4 hours'`, next_attempt_at: `now() - interval '4 hours'`,
    });
    await expire();
    const { error } = await admin.rpc('retry_print_job', { p_job_id: id });
    expect(error?.message).toBe('job_not_failed');
    expect((await rowOf(id)).status).toBe('expired');
  });

  it('tüm baskı yolları sahiplenmeden önce süre aşımını uygular', async () => {
    const [d] = await sql<{ def: string }>(
      `select pg_get_functiondef('internal.claim_print_jobs(text, int)'::regprocedure) as def`);
    expect(d!.def).toContain('internal.expire_print_jobs()');
    // Dört yol da aynı yardımcıdan geçer (ajan, istasyon, arka plan istasyonu, Epson SDP).
    const users = await sql<{ proname: string }>(`
      select p.proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.prokind = 'f' and p.prosrc like '%internal.claim_print_jobs(%'
      order by 1`);
    expect(users.map((u) => u.proname)).toEqual(
      ['claim_print_job', 'sdp_claim_next', 'station_claim_print_job', 'station_feed_claim']);
  });
});
