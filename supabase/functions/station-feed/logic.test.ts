import { createHash } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_WAIT_MS,
  IDLE_POLL_MS,
  MAX_BODY_BYTES,
  MAX_WAIT_MS,
  POLL_MS,
  bytesToBase64,
  clampWaitMs,
  handleFeedRequest,
  printSettings,
  sha256Hex,
  type ClaimResult,
  type FeedDeps,
  type FeedJob,
} from './logic';
import { renderEscpos } from '../epson-sdp/render';

const TOKEN = 'b'.repeat(64);
const HASH = createHash('sha256').update(TOKEN, 'utf8').digest('hex');
const JOB = '6f1c2b1e-8d4a-4c1b-9a53-0d6c7f1e2a90';
const JOB2 = '00000000-0000-4000-8000-000000000001';
const URL_ = 'https://x.supabase.co/functions/v1/station-feed';
const SETTINGS = { codepage: 'cp857', codepageNumber: 61, transliterate: false };
const PRINTER = { host: '192.168.1.50', port: 9100 };

const payload = {
  kind: 'order',
  header: "RAMO'S · KÜCHE",
  table: 'Test-Tisch',
  orderNo: 7,
  createdAt: '2026-09-18T10:00:00Z',
  waiter: 'Ali',
  items: [{ qty: 2, code: '05', name: 'Drehspieß Sandwich', isBeverage: false, variant: 'Tavuk', without: ['Zwiebeln'],
            groups: [{ label: 'Soße', format: 'label_values', values: ['Knoblauch'] }], note: 'az soğanlı' }],
};

const claimOk = (job: FeedJob | null, over: Partial<ClaimResult> = {}): ClaimResult => ({
  device: 'ok', route: 'station', printer: PRINTER, settings: SETTINGS, job, ...over,
});

/** Sahte saat: sleep saati ilerletir, gerçek bekleme yok. */
function fakeClock() {
  let t = 1_000_000;
  const sleeps: number[] = [];
  return {
    now: () => t,
    sleep: vi.fn(async (ms: number) => {
      sleeps.push(ms);
      t += ms;
    }),
    advance: (ms: number) => (t += ms),
    sleeps,
  };
}

function makeDeps(claims: ClaimResult[] = []) {
  const clock = fakeClock();
  const queue = [...claims];
  const deps = {
    claim: vi.fn(async (hash: string) => {
      void hash;
      return queue.shift() ?? claimOk(null);
    }),
    complete: vi.fn(async () => 'ok'),
    heartbeat: vi.fn(async () => 'ok'),
    render: vi.fn((p: Record<string, unknown>, s: Parameters<FeedDeps['render']>[1]) => renderEscpos(p, s)),
    log: vi.fn(),
    now: clock.now,
    sleep: clock.sleep,
  } satisfies FeedDeps;
  return { deps, clock };
}

const post = (body: unknown, token: string | null = TOKEN, init: RequestInit = {}) =>
  new Request(URL_, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token === null ? {} : { 'x-station-token': token }) },
    body: typeof body === 'string' ? body : JSON.stringify(body),
    ...init,
  });

const b64ToBytes = (s: string) => new Uint8Array(Buffer.from(s, 'base64'));

describe('yardımcılar', () => {
  it('sha256Hex Node crypto ile aynı (DB: encode(sha256(convert_to(token, UTF8)), hex))', async () =>
    expect(await sha256Hex(TOKEN)).toBe(HASH));

  it('bytesToBase64: büyük dizide de (parça sınırı) Buffer ile aynı', () => {
    const big = new Uint8Array(100_000).map((_, i) => (i * 31) % 256);
    expect(bytesToBase64(big)).toBe(Buffer.from(big).toString('base64'));
    expect(bytesToBase64(new Uint8Array())).toBe('');
  });

  it('clampWaitMs: varsayılan 20 sn, 0..25 sn aralığı, sayı dışı null', () => {
    expect(clampWaitMs(undefined)).toBe(DEFAULT_WAIT_MS);
    expect(clampWaitMs(null)).toBe(DEFAULT_WAIT_MS);
    expect(clampWaitMs(-5)).toBe(0);
    expect(clampWaitMs(99_999)).toBe(MAX_WAIT_MS);
    expect(clampWaitMs(1234.9)).toBe(1234);
    expect(clampWaitMs('100')).toBeNull();
  });

  it('printSettings: eksik ayar → web istasyonunun varsayılanları', () => {
    expect(printSettings(undefined)).toEqual({ codepage: 'cp857', codepageNumber: 61, transliterate: false });
    expect(printSettings({ codepage: 'windows1254', codepageNumber: 91, transliterate: true }))
      .toEqual({ codepage: 'windows1254', codepageNumber: 91, transliterate: true });
  });
});

describe('kimlik ve istek biçimi', () => {
  it('POST dışı → 405', async () => {
    const { deps } = makeDeps();
    const res = await handleFeedRequest(new Request(URL_, { method: 'GET' }), deps);
    expect(res.status).toBe(405);
    expect(await res.json()).toEqual({ error: 'method_not_allowed' });
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it('anahtar yok / bozuk → 401, DB\'ye gidilmez', async () => {
    const { deps } = makeDeps();
    for (const token of [null, '', 'B'.repeat(64), 'b'.repeat(63), `${'b'.repeat(64)}0`, 'g'.repeat(64)]) {
      const res = await handleFeedRequest(post({ action: 'next', waitMs: 0 }, token), deps);
      expect(res.status, String(token)).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    expect(deps.claim).not.toHaveBeenCalled();
  });

  it('tanınmayan cihaz → 401 (next, complete, heartbeat)', async () => {
    const { deps } = makeDeps([{ device: 'unknown', job: null }]);
    deps.complete.mockResolvedValue('unknown');
    deps.heartbeat.mockResolvedValue('unknown');
    for (const body of [
      { action: 'next', waitMs: 5000 },
      { action: 'complete', jobId: JOB, ok: true },
      { action: 'heartbeat', version: '1.0.0', reachable: true },
    ]) {
      const res = await handleFeedRequest(post(body), deps);
      expect(res.status, body.action).toBe(401);
      expect(await res.json()).toEqual({ error: 'unauthorized' });
    }
    expect(deps.claim).toHaveBeenCalledWith(HASH);
    expect(deps.claim).toHaveBeenCalledTimes(1); // bilinmeyen cihaz beklemeye alınmaz
  });

  it('bozuk JSON, nesne olmayan gövde, bilinmeyen eylem, büyük gövde → 400', async () => {
    const { deps } = makeDeps();
    for (const body of ['{', '[]', '"next"', 'null', JSON.stringify({ action: 'print' }), JSON.stringify({})]) {
      const res = await handleFeedRequest(post(body), deps);
      expect(res.status, body).toBe(400);
      expect(await res.json()).toEqual({ error: 'bad_request' });
    }
    const big = JSON.stringify({ action: 'heartbeat', version: 'x'.repeat(MAX_BODY_BYTES), reachable: true });
    expect((await handleFeedRequest(post(big), deps)).status).toBe(400);
    expect(deps.claim).not.toHaveBeenCalled();
    expect(deps.heartbeat).not.toHaveBeenCalled();
  });

  it('RPC hatası → 500 server_error; log anahtar/özet içermez', async () => {
    const { deps } = makeDeps();
    deps.claim.mockRejectedValue(new Error('station_feed_claim: 57014'));
    const res = await handleFeedRequest(post({ action: 'next', waitMs: 0 }), deps);
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: 'server_error' });
    const logged = JSON.stringify(deps.log.mock.calls);
    expect(logged).toContain('57014');
    expect(logged).not.toContain(TOKEN);
    expect(logged).not.toContain(HASH);
  });
});

describe('next — uzun yoklama', () => {
  it('iş varsa hemen döner: base64 baytlar render çıktısının aynısı; log fiş içeriği taşımaz', async () => {
    const { deps, clock } = makeDeps([claimOk({ id: JOB, type: 'order', payload })]);
    const res = await handleFeedRequest(post({ action: 'next' }), deps);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { job: { id: string; data: string }; printer: unknown; route: string };
    expect(body.printer).toEqual(PRINTER);
    expect(body.route).toBe('station');
    expect(body.job.id).toBe(JOB);
    expect(Object.keys(body.job).sort()).toEqual(['data', 'id']);
    expect(b64ToBytes(body.job.data)).toEqual(renderEscpos(payload, SETTINGS));
    expect(deps.render).toHaveBeenCalledWith(payload, SETTINGS);
    expect(clock.sleeps).toEqual([]);
    const logged = JSON.stringify(deps.log.mock.calls);
    expect(logged).toContain(JOB);
    expect(logged).not.toContain('Drehspieß');
    expect(logged).not.toContain(TOKEN);
  });

  it('iş yoksa 1 sn arayla yeniden dener, waitMs dolunca job:null döner (süre aşılmaz)', async () => {
    const { deps, clock } = makeDeps();
    const t0 = clock.now();
    const res = await handleFeedRequest(post({ action: 'next', waitMs: 3500 }), deps);
    expect(await res.json()).toEqual({ job: null, printer: PRINTER, route: 'station' });
    expect(clock.sleeps).toEqual([POLL_MS, POLL_MS, POLL_MS, 500]);
    expect(deps.claim).toHaveBeenCalledTimes(5);
    expect(clock.now() - t0).toBe(3500);
  });

  it('beklerken gelen iş bir sonraki denemede döner', async () => {
    const { deps, clock } = makeDeps([claimOk(null), claimOk(null), claimOk({ id: JOB, type: 'order', payload })]);
    const res = await handleFeedRequest(post({ action: 'next', waitMs: 20_000 }), deps);
    const body = (await res.json()) as { job: { id: string } };
    expect(body.job.id).toBe(JOB);
    expect(clock.sleeps).toEqual([POLL_MS, POLL_MS]);
  });

  it('waitMs varsayılanı 20 sn, üst sınırı 25 sn, 0 = tek deneme', async () => {
    for (const [waitMs, total] of [[undefined, DEFAULT_WAIT_MS], [60_000, MAX_WAIT_MS], [0, 0], [-10, 0]] as const) {
      const { deps, clock } = makeDeps();
      const t0 = clock.now();
      const res = await handleFeedRequest(post({ action: 'next', ...(waitMs === undefined ? {} : { waitMs }) }), deps);
      expect(res.status).toBe(200);
      expect(clock.now() - t0, String(waitMs)).toBe(total);
      expect(clock.sleeps.every((ms) => ms <= POLL_MS)).toBe(true);
    }
    const { deps } = makeDeps();
    expect((await handleFeedRequest(post({ action: 'next', waitMs: '100' }), deps)).status).toBe(400);
  });

  it('gerçek RPC gecikmesiyle de toplam süre waitMs + bir RPC\'yi aşmaz', async () => {
    const { deps, clock } = makeDeps();
    deps.claim.mockImplementation(async () => {
      clock.advance(300); // her RPC 300 ms sürer
      return claimOk(null);
    });
    const t0 = clock.now();
    await handleFeedRequest(post({ action: 'next', waitMs: 5000 }), deps);
    expect(clock.now() - t0).toBeLessThanOrEqual(5000 + 300);
  });

  it('rota station değilse / yazıcı adresi yoksa seyrek yoklar (5 sn) ve rotayı bildirir', async () => {
    for (const over of [{ route: 'agent' }, { printer: { host: null, port: 9100 } }] as Partial<ClaimResult>[]) {
      const { deps, clock } = makeDeps();
      deps.claim.mockImplementation(async () => claimOk(null, over));
      const res = await handleFeedRequest(post({ action: 'next', waitMs: 12_000 }), deps);
      const body = (await res.json()) as { job: null; route: string; printer: unknown };
      expect(body.job).toBeNull();
      expect(body.route).toBe(over.route ?? 'station');
      expect(body.printer).toEqual(over.printer ?? PRINTER);
      expect(clock.sleeps).toEqual([IDLE_POLL_MS, IDLE_POLL_MS, 2000]);
    }
  });

  it('kodlama hatası: iş encode_error ile başarısız kapatılır, döngü sıradaki işe geçer', async () => {
    const { deps } = makeDeps([
      claimOk({ id: JOB, type: 'order', payload: { broken: true } }),
      claimOk({ id: JOB2, type: 'order', payload }),
    ]);
    deps.render.mockImplementationOnce(() => {
      throw new Error('bilinmeyen kod sayfası');
    });
    const res = await handleFeedRequest(post({ action: 'next', waitMs: 10_000 }), deps);
    const body = (await res.json()) as { job: { id: string } };
    expect(body.job.id).toBe(JOB2);
    expect(deps.complete).toHaveBeenCalledWith(HASH, JOB, false, 'encode_error: bilinmeyen kod sayfası');
    expect(deps.complete).toHaveBeenCalledTimes(1);
    // Hata mesajı (fiş içeriğinden karakter taşıyabilir) loga yazılmaz; yalnız iş kimliği.
    expect(deps.log).toHaveBeenCalledWith('error', 'station_feed_encode_error', { job: JOB });
  });

  it('kodlama hatasından sonra iş kalmadıysa beklemeye devam eder', async () => {
    const { deps, clock } = makeDeps([claimOk({ id: JOB, type: 'order', payload })]);
    deps.render.mockImplementationOnce(() => {
      throw new Error('x');
    });
    const res = await handleFeedRequest(post({ action: 'next', waitMs: 2000 }), deps);
    expect(await res.json()).toEqual({ job: null, printer: PRINTER, route: 'station' });
    expect(clock.sleeps).toEqual([POLL_MS, POLL_MS]);
  });

  it('istemci bağlantıyı kopardıysa yeni iş sahiplenmez', async () => {
    const ctrl = new AbortController();
    const { deps, clock } = makeDeps();
    deps.claim.mockImplementation(async () => claimOk(null));
    clock.sleep.mockImplementation(async (ms: number) => {
      clock.advance(ms);
      ctrl.abort();
    });
    const res = await handleFeedRequest(post({ action: 'next', waitMs: 20_000 }, TOKEN, { signal: ctrl.signal }), deps);
    expect(res.status).toBe(200);
    expect(deps.claim).toHaveBeenCalledTimes(1);
  });
});

describe('complete / heartbeat', () => {
  it('complete: RPC sonucunu aynen döner; hata metni isteğe bağlı', async () => {
    const { deps } = makeDeps();
    let res = await handleFeedRequest(post({ action: 'complete', jobId: JOB, ok: true }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'ok' });
    expect(deps.complete).toHaveBeenLastCalledWith(HASH, JOB, true, null);

    deps.complete.mockResolvedValueOnce('job_not_printing');
    res = await handleFeedRequest(post({ action: 'complete', jobId: JOB, ok: false, error: 'paper_end: Kâğıt bitti' }), deps);
    expect(await res.json()).toEqual({ result: 'job_not_printing' });
    expect(deps.complete).toHaveBeenLastCalledWith(HASH, JOB, false, 'paper_end: Kâğıt bitti');
  });

  it('complete: bozuk jobId / ok → 400', async () => {
    const { deps } = makeDeps();
    for (const body of [
      { action: 'complete', jobId: 'x', ok: true },
      { action: 'complete', ok: true },
      { action: 'complete', jobId: JOB },
      { action: 'complete', jobId: JOB, ok: 'true' },
      { action: 'complete', jobId: JOB, ok: false, error: 42 },
    ]) {
      expect((await handleFeedRequest(post(body), deps)).status, JSON.stringify(body)).toBe(400);
    }
    expect(deps.complete).not.toHaveBeenCalled();
  });

  it('heartbeat: alanlar RPC\'ye aynen gider → {result: ok}', async () => {
    const { deps } = makeDeps();
    const res = await handleFeedRequest(post({ action: 'heartbeat', version: '2.1.0', reachable: false,
      state: { paper_near_end: true }, error: 'offline: bağlantı yok' }), deps);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ result: 'ok' });
    expect(deps.heartbeat).toHaveBeenCalledWith(HASH, { version: '2.1.0', reachable: false,
      state: { paper_near_end: true }, error: 'offline: bağlantı yok' });

    await handleFeedRequest(post({ action: 'heartbeat', version: '2.1.0', reachable: true }), deps);
    expect(deps.heartbeat).toHaveBeenLastCalledWith(HASH, { version: '2.1.0', reachable: true, state: null, error: null });
  });

  it('heartbeat: bozuk alanlar → 400', async () => {
    const { deps } = makeDeps();
    for (const body of [
      { action: 'heartbeat', reachable: true },
      { action: 'heartbeat', version: 1, reachable: true },
      { action: 'heartbeat', version: '1', reachable: 'yes' },
      { action: 'heartbeat', version: '1', reachable: true, state: [1] },
      { action: 'heartbeat', version: '1', reachable: true, error: {} },
    ]) {
      expect((await handleFeedRequest(post(body), deps)).status, JSON.stringify(body)).toBe(400);
    }
    expect(deps.heartbeat).not.toHaveBeenCalled();
  });
});
