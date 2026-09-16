import { describe, expect, it, vi } from 'vitest';
import { Agent, type AgentApi, type Job } from './agent';
import { PrinterError } from './transport';

const settings = { host: '127.0.0.1', port: 9100, codepage: 'cp857', codepageNumber: 61, transliterate: false };
const job = (id: string, table = 'Tisch 12'): Job => ({ id, type: 'order', attempts: 0, payload: {
  kind: 'order', header: 'KÜCHE', table, orderNo: 1, round: 1, createdAt: '2026-09-15T17:00:00Z', waiter: 'Ali',
  note: null, items: [{ qty: 1, code: '05', name: 'Drehspieß Sandwich', isBeverage: false, variant: 'Kalb',
  without: ['Zwiebeln'], groups: [], note: null }] } });

function fakeApi(jobs: Job[]) {
  const api = {
    claim: vi.fn(async () => jobs.shift() ?? null),
    complete: vi.fn(async () => {}), heartbeat: vi.fn(async () => {}),
    settings: vi.fn(async () => settings), onJobs: vi.fn(), onSettings: vi.fn(), close: vi.fn(async () => {}),
  } satisfies AgentApi;
  return api;
}
const okState = { known: true, offline: false, cover_open: false, paper_end: false, paper_near_end: false, error: false, raw: '121212' };
const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };

describe('Agent', () => {
  it('bekleyen işleri sırayla basar ve başarıyla kapatır', async () => {
    const api = fakeApi([job('a', 'Tisch 1'), job('b', 'Tisch 2')]);
    const printed: string[] = [];
    const printer = { status: vi.fn(async () => okState),
      print: vi.fn(async (_s: unknown, bytes: Uint8Array) => { printed.push(Buffer.from(bytes).toString('latin1')); return { before: okState, after: okState }; }) };
    const agent = new Agent(api, { printer, log });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(2);
    expect(printed[0]).toContain('TISCH 1');
    expect(printed[1]).toContain('TISCH 2');
    expect(api.complete).toHaveBeenNthCalledWith(1, 'a', true, undefined);
  });

  it('yazıcı sorunluyken iş sahiplenmez; heartbeat sorunu bildirir', async () => {
    const api = fakeApi([job('a')]);
    const printer = { status: vi.fn(async () => ({ ...okState, paper_end: true })), print: vi.fn() };
    const agent = new Agent(api, { printer, log });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(0);
    expect(api.claim).not.toHaveBeenCalled();
    await agent.sendHeartbeat();
    expect(api.heartbeat).toHaveBeenCalledWith(expect.objectContaining({ reachable: true, state: expect.objectContaining({ paper_end: true }) }));
  });

  it('yazıcıya ulaşılamıyorsa sahiplenmez, reachable=false', async () => {
    const api = fakeApi([job('a')]);
    const printer = { status: vi.fn(async () => { throw new PrinterError('offline'); }), print: vi.fn() };
    const agent = new Agent(api, { printer, log });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(0);
    await agent.sendHeartbeat();
    expect(api.heartbeat).toHaveBeenCalledWith(expect.objectContaining({ reachable: false }));
  });

  it('gönderim sırasında hata olursa işi hata ile kapatır ve devam etmez', async () => {
    const api = fakeApi([job('a'), job('b')]);
    const printer = { status: vi.fn(async () => okState), print: vi.fn(async () => { throw new PrinterError('io', 'reset'); }) };
    const agent = new Agent(api, { printer, log });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(0);
    expect(api.complete).toHaveBeenCalledWith('a', false, 'io: reset');
    expect(api.claim).toHaveBeenCalledTimes(1);
  });

  it('ayar değişince yeni host kullanılır', async () => {
    const jobs: Job[] = [];
    const api = fakeApi(jobs);
    const seen: string[] = [];
    const printer = { status: vi.fn(async () => okState),
      print: vi.fn(async (s: { host: string }) => { seen.push(s.host); return { before: okState, after: okState }; }) };
    const agent = new Agent(api, { printer, log });
    await agent.start();                              // kuyruk boş: başlangıç drain'i hemen biter
    await new Promise((r) => setTimeout(r, 0));
    const cb = api.onSettings.mock.calls[0]![0] as (s: typeof settings) => void;
    cb({ ...settings, host: '10.0.0.9' });
    jobs.push(job('a'));
    await agent.drain();
    await agent.stop();
    expect(seen).toEqual(['10.0.0.9']);
  });
});
