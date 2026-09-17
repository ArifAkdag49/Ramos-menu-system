import type { TicketPayload } from '@ramos/shared';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { RpcError } from '../../lib/rpc';
import { base64ToBytes } from '../../native/base64';
import type { RamosPrinterPlugin, RamosPrinterSendResult } from '../../native/capacitor';
import { jobToBytes, type PrintJobRow, type StationPrinterConfig } from './stationLogic';
import { StationRunner, type StationRunnerDeps } from './stationRunner';
import type { StationSnapshot } from './stationStore';

const payload: TicketPayload = {
  kind: 'test',
  header: "RAMO'S",
  table: '-',
  createdAt: '2026-09-17T12:00:00Z',
  items: [],
};

const cfg: StationPrinterConfig = {
  host: '192.168.1.50',
  port: 9100,
  codepage: 'cp857',
  codepageNumber: 61,
  transliterate: false,
};

const job = (id: string, over: Partial<PrintJobRow> = {}): PrintJobRow => ({
  id,
  type: 'test',
  payload,
  attempts: 0,
  ...over,
});

function setup(
  opts: {
    jobs?: PrintJobRow[];
    send?: (n: number) => RamosPrinterSendResult;
    config?: StationPrinterConfig | null;
  } = {},
) {
  const queue = [...(opts.jobs ?? [])];
  const calls: { fn: string; args: Record<string, unknown> }[] = [];
  const completeImpl = vi.fn(async (): Promise<unknown> => null);
  const claimImpl = vi.fn(async (): Promise<PrintJobRow[]> => {
    const next = queue.shift();
    return next ? [next] : [];
  });
  const rpc = vi.fn(async (fn: string, args: Record<string, unknown>) => {
    calls.push({ fn, args });
    if (fn === 'station_claim_print_job') return claimImpl();
    if (fn === 'station_complete_print_job') return completeImpl();
    return null;
  });
  let sends = 0;
  const printer = {
    send: vi.fn(async () => (opts.send ? opts.send(sends++) : { ok: true, status: '160000' })),
    status: vi.fn(async () => ({ reachable: true, status: '160000' })),
  } satisfies RamosPrinterPlugin;
  const changes: Partial<StationSnapshot>[] = [];
  const snapshot = () => Object.assign({}, ...changes) as Partial<StationSnapshot>;
  const deps: StationRunnerDeps = {
    stationId: 'tab-1',
    version: 'test/1',
    printer,
    rpc: rpc as StationRunnerDeps['rpc'],
    getConfig: () => (opts.config === undefined ? cfg : opts.config),
    onChange: (p) => changes.push(p),
    now: () => 1_000_000,
  };
  const runner = new StationRunner(deps, { completeRetryBaseMs: 1, claimRetryBaseMs: 1 });
  // drain() yalnız çalışırken iş alır.
  (runner as unknown as { stopped: boolean }).stopped = false;
  return { runner, rpc, calls, printer, claimImpl, completeImpl, snapshot, deps };
}

afterEach(() => vi.useRealTimers());

describe('StationRunner.drain', () => {
  it('kuyruktaki her iş: claim → send (base64 ESC/POS, durum denetimli) → complete(ok)', async () => {
    const t = setup({ jobs: [job('j1'), job('j2')] });
    await expect(t.runner.drain()).resolves.toBe(2);

    expect(t.printer.send).toHaveBeenCalledTimes(2);
    const sent = (t.printer.send.mock.calls as unknown as unknown[][])[0]![0] as {
      host: string;
      port: number;
      data: string;
      checkStatus: boolean;
    };
    expect(sent).toMatchObject({ host: '192.168.1.50', port: 9100, checkStatus: true });
    expect(base64ToBytes(sent.data)).toEqual(jobToBytes(payload, cfg));

    expect(t.calls.map((c) => c.fn)).toEqual([
      'station_claim_print_job',
      'station_complete_print_job',
      'station_claim_print_job',
      'station_complete_print_job',
      'station_claim_print_job',
    ]);
    expect(t.calls[0]!.args).toEqual({ p_station_id: 'tab-1' });
    expect(t.calls[1]!.args).toEqual({
      p_job_id: 'j1',
      p_ok: true,
      p_error: null,
      p_station_id: 'tab-1',
    });
    expect(t.snapshot()).toMatchObject({
      reachable: true,
      lastPrintedAt: 1_000_000,
      failures: 0,
      lastError: null,
    });
  });

  it('yazıcı hatası: iş başarısız kapatılır (ajan biçimi), tur biter, ulaşılamıyor', async () => {
    const t = setup({
      jobs: [job('j1'), job('j2')],
      send: () => ({ ok: false, error: 'offline', message: 'connect ECONNREFUSED' }),
    });
    await expect(t.runner.drain()).resolves.toBe(0);
    expect(t.printer.send).toHaveBeenCalledOnce();
    expect(t.calls.at(-1)).toEqual({
      fn: 'station_complete_print_job',
      args: {
        p_job_id: 'j1',
        p_ok: false,
        p_error: 'offline: connect ECONNREFUSED',
        p_station_id: 'tab-1',
      },
    });
    expect(t.snapshot()).toMatchObject({
      reachable: false,
      failures: 1,
      lastError: 'offline: connect ECONNREFUSED',
    });
  });

  it('kapak açık: başarısız ama yazıcıya ulaşılıyor', async () => {
    const t = setup({ jobs: [job('j1')], send: () => ({ ok: false, error: 'cover_open' }) });
    await t.runner.drain();
    expect(t.snapshot()).toMatchObject({ reachable: true, lastError: 'cover_open: cover_open' });
  });

  it('eklenti sözleşmeye rağmen reddederse io hatası; döngü çökmez', async () => {
    const t = setup({ jobs: [job('j1')] });
    t.printer.send.mockRejectedValueOnce(new Error('plugin not implemented'));
    await expect(t.runner.drain()).resolves.toBe(0);
    expect(t.calls.at(-1)!.args).toMatchObject({
      p_ok: false,
      p_error: 'io: plugin not implemented',
    });
  });

  it('kodlama hatası yazıcı sorunu değil: iş başarısız, sıradaki iş basılır', async () => {
    const t = setup({ jobs: [job('bad', { payload: null }), job('j2')] });
    await expect(t.runner.drain()).resolves.toBe(1);
    const complete = t.calls.filter((c) => c.fn === 'station_complete_print_job');
    expect(complete[0]!.args).toMatchObject({ p_job_id: 'bad', p_ok: false });
    expect(String(complete[0]!.args.p_error)).toMatch(/^encode_error: /);
    expect(complete[1]!.args).toMatchObject({ p_job_id: 'j2', p_ok: true });
  });

  it('yazıcı adresi yoksa iş sahiplenilmez', async () => {
    const t = setup({ jobs: [job('j1')], config: null });
    await t.runner.drain();
    expect(t.rpc).not.toHaveBeenCalled();
    expect(t.snapshot()).toMatchObject({ missingPrinter: true });
  });

  it('basılan işin onayı ağ hatasında yeniden denenir (çift fiş olmasın)', async () => {
    const t = setup({ jobs: [job('j1')] });
    t.completeImpl
      .mockRejectedValueOnce(new RpcError('network'))
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValue(null);
    await t.runner.drain();
    expect(t.printer.send).toHaveBeenCalledOnce();
    expect(t.completeImpl).toHaveBeenCalledTimes(3);
  });

  it('iş artık bu istasyonun değilse onay denemesi bırakılır', async () => {
    const t = setup({ jobs: [job('j1')] });
    t.completeImpl.mockRejectedValue(new RpcError('job_not_printing'));
    await t.runner.drain();
    expect(t.completeImpl).toHaveBeenCalledOnce();
  });

  it('sahiplenme hatası: geri çekilme ve son hata', async () => {
    const t = setup({ jobs: [job('j1')] });
    t.claimImpl.mockRejectedValueOnce(new RpcError('network'));
    await t.runner.drain();
    expect(t.printer.send).not.toHaveBeenCalled();
    expect(t.snapshot()).toMatchObject({ failures: 1, lastError: 'claim_error: network' });
  });

  it('tek uçuş: sürerken gelen sinyal ikinci eşzamanlı döngü açmaz, tur sonunda bir kez daha döner', async () => {
    const t = setup({ jobs: [job('j1')] });
    let release!: () => void;
    t.printer.send.mockImplementationOnce(
      () => new Promise<RamosPrinterSendResult>((r) => (release = () => r({ ok: true }))),
    );
    const first = t.runner.drain();
    await vi.waitFor(() => expect(t.printer.send).toHaveBeenCalledOnce());
    await expect(t.runner.drain()).resolves.toBe(0); // eşzamanlı çağrı hemen döner
    release();
    await expect(first).resolves.toBe(1);
    // j1 basıldı + boş claim; "again" turu bir claim daha yapar.
    expect(t.calls.filter((c) => c.fn === 'station_claim_print_job')).toHaveLength(3);
  });

  it('durdurulunca yeni iş sahiplenmez', async () => {
    const t = setup({ jobs: [job('j1')] });
    t.runner.stop();
    await t.runner.drain();
    expect(t.rpc).not.toHaveBeenCalled();
  });
});

describe('StationRunner.heartbeat', () => {
  it('yazıcı durumunu yoklar ve station_heartbeat yazar', async () => {
    const t = setup();
    t.printer.status.mockResolvedValueOnce({ reachable: true, status: '16240c' });
    await t.runner.heartbeat();
    expect(t.printer.status).toHaveBeenCalledWith({
      host: '192.168.1.50',
      port: 9100,
      timeoutMs: 3000,
    });
    const hb = t.calls.find((c) => c.fn === 'station_heartbeat')!;
    expect(hb.args).toMatchObject({
      p_station_id: 'tab-1',
      p_version: 'test/1',
      p_host: '192.168.1.50:9100',
      p_reachable: true,
      p_error: null,
    });
    expect(hb.args.p_state).toMatchObject({ known: true, cover_open: true, raw: '16240c' });
  });

  it('ulaşılamıyorsa reachable=false ve hata metni; eklenti reddetse de yazılır', async () => {
    const t = setup();
    t.printer.status.mockRejectedValueOnce(new Error('timeout'));
    await t.runner.heartbeat();
    const hb = t.calls.find((c) => c.fn === 'station_heartbeat')!;
    expect(hb.args).toMatchObject({
      p_reachable: false,
      p_state: null,
      p_error: 'offline: timeout',
    });
    expect(t.snapshot()).toMatchObject({ reachable: false });
  });

  it('heartbeat RPC hatası yutulur', async () => {
    const t = setup();
    t.rpc.mockRejectedValue(new Error('network'));
    await expect(t.runner.heartbeat()).resolves.toBeUndefined();
  });

  it('baskı sürerken durum yoklaması yazıcıya bağlanmaz (kilit)', async () => {
    const t = setup({ jobs: [job('j1')] });
    let release!: () => void;
    t.printer.send.mockImplementationOnce(
      () => new Promise<RamosPrinterSendResult>((r) => (release = () => r({ ok: true }))),
    );
    const draining = t.runner.drain();
    await vi.waitFor(() => expect(t.printer.send).toHaveBeenCalledOnce());
    const hb = t.runner.heartbeat();
    await new Promise((r) => setTimeout(r, 10));
    expect(t.printer.status).not.toHaveBeenCalled();
    release();
    await Promise.all([draining, hb]);
    expect(t.printer.status).toHaveBeenCalledOnce();
  });
});

describe('StationRunner.start/stop', () => {
  it('başlayınca hemen yoklar ve heartbeat atar; 5 sn yoklama, 30 sn heartbeat; Realtime sinyali drain tetikler', async () => {
    vi.useFakeTimers();
    const t = setup();
    (t.runner as unknown as { stopped: boolean }).stopped = true;
    let signal: (() => void) | null = null;
    const unsubscribe = vi.fn();
    t.deps.subscribeJobs = (cb) => {
      signal = cb;
      return unsubscribe;
    };
    t.runner.start();
    await vi.advanceTimersByTimeAsync(0);
    const count = (fn: string) => t.calls.filter((c) => c.fn === fn).length;
    expect(count('station_claim_print_job')).toBe(1);
    expect(count('station_heartbeat')).toBe(1);

    await vi.advanceTimersByTimeAsync(5_000);
    expect(count('station_claim_print_job')).toBe(2);
    signal!();
    await vi.advanceTimersByTimeAsync(0);
    expect(count('station_claim_print_job')).toBe(3);
    await vi.advanceTimersByTimeAsync(25_000);
    expect(count('station_heartbeat')).toBe(2);

    t.runner.stop();
    expect(unsubscribe).toHaveBeenCalledOnce();
    const before = t.calls.length;
    await vi.advanceTimersByTimeAsync(60_000);
    expect(t.calls.length).toBe(before);
    expect(t.runner.running).toBe(false);
  });
});
