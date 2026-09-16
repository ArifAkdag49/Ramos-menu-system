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
    complete: vi.fn<(id: string, ok: boolean, error?: string) => Promise<void>>(async () => {}), heartbeat: vi.fn(async () => {}),
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

// ---------- Review fix round 1 ----------

const freshLog = () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() });
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('Agent — C1: fiziksel olarak basılan bir bilet asla ikinci kez basılmaz', () => {
  it('complete(true) geçici olarak başarısız olursa iş failed/pending olarak KAPATILMAZ; başarana kadar yeniden denenir', async () => {
    const api = fakeApi([job('a')]);
    let calls = 0;
    api.complete = vi.fn(async (_id: string, ok: boolean) => {
      calls += 1;
      if (calls < 3) throw new Error('ağ kesintisi');
      expect(ok).toBe(true);
    });
    const printer = { status: vi.fn(async () => okState), print: vi.fn(async () => ({ before: okState, after: okState })) };
    const agent = new Agent(api, { printer, log: freshLog() }, { completeRetryBaseMs: 0 });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(1); // bayt gitti — bu iş "basıldı" sayılır
    expect(api.complete).toHaveBeenCalledTimes(3);
    for (const call of api.complete.mock.calls) {
      expect(call[1]).toBe(true); // ASLA complete(id, false, ...) ile kapatılmadı
    }
  });

  // R68 (review fix round 2, NEW-1) — ZORUNLU test #1: eski sınırlı deneme (varsayılan 5,
  // ~31 sn) `claim_print_job`'ın 60 sn'lik stale-`printing` reclaim penceresinden KISAYDI;
  // 31-60 sn'lik bir kesinti "vazgeç → printing'de kal → 60 sn'de reclaim → İKİNCİ KEZ BAS"
  // zincirini üretiyordu. Bu test, eski sınırın (5 deneme → 6. çağrıda vazgeçilirdi) ÇOK
  // ötesine (8 çağrı) geçildiğini ve hiçbir çağrının `false` ile yapılmadığını kanıtlar.
  it('R68: complete(true) art arda başarısız olsa bile ASLA vazgeçilmez — eski sınırın ötesinde de denemeye devam eder', async () => {
    const OLD_BOUND_ATTEMPTS = 6; // eski (kaldırılan) completeRetries=5 varsayılanının izin verdiği toplam çağrı sayısı
    const api = fakeApi([job('a')]);
    let calls = 0;
    api.complete = vi.fn(async (_id: string, ok: boolean) => {
      calls += 1;
      if (calls <= OLD_BOUND_ATTEMPTS + 2) throw new Error('uzun süren kesinti');
      expect(ok).toBe(true);
    });
    const testLog = freshLog();
    const printer = { status: vi.fn(async () => okState), print: vi.fn(async () => ({ before: okState, after: okState })) };
    const agent = new Agent(api, { printer, log: testLog }, { completeRetryBaseMs: 0 });
    await agent.checkPrinter();
    expect(await agent.drain()).toBe(1); // bayt gitti, basılı sayılır — eski koddaysa burada "vazgeçilip" false ile kapanırdı
    expect(api.complete).toHaveBeenCalledTimes(OLD_BOUND_ATTEMPTS + 3); // eski sınırı aştı VE sonunda başardı
    for (const call of api.complete.mock.calls) {
      expect(call[1]).toBe(true); // hiçbir çağrı false ile yapılmadı — vazgeçme yok
    }
  });
});

describe('Agent — R68/NEW-3: stop() basılmış-ama-doğrulanmamış bir işi asla terk etmez', () => {
  it('complete(true) tekrarla başarısız olsa bile stop() — stopGraceMs çoktan geçmiş olsa da — doğrulanana kadar bekler', async () => {
    const events: string[] = [];
    const api = fakeApi([job('a')]);
    let calls = 0;
    api.complete = vi.fn(async () => {
      calls += 1;
      events.push(`complete-${calls}`);
      if (calls < 4) throw new Error('kesinti');
    });
    api.close = vi.fn(async () => {
      events.push('close');
    });
    const printer = { status: vi.fn(async () => okState), print: vi.fn(async () => ({ before: okState, after: okState })) };
    // stopGraceMs KASITLI OLARAK çok kısa (1 ms) — completeSuccessWithRetry bunu kolayca aşacak;
    // stop() yine de basılan işi doğrulanana kadar terk etmemeli.
    const agent = new Agent(api, { printer, log: freshLog() }, { completeRetryBaseMs: 5, stopGraceMs: 1 });
    await agent.checkPrinter();
    const drainPromise = agent.drain();
    await tick(); // print() dönsün, ilk complete() denemesi başlasın (pendingConfirmations > 0)
    await agent.stop();
    await drainPromise;
    expect(events).toEqual(['complete-1', 'complete-2', 'complete-3', 'complete-4', 'close']);
  });
});

describe('Agent — C2: beklenmeyen hatalar süreci çökertmez', () => {
  it('claim_print_job reddederse drain() reddetmez (unhandled rejection oluşmaz)', async () => {
    const api = fakeApi([]);
    api.claim = vi.fn(async () => { throw new Error('DB 500'); });
    const testLog = freshLog();
    const printer = { status: vi.fn(async () => okState), print: vi.fn() };
    const agent = new Agent(api, { printer, log: testLog });
    await agent.checkPrinter();
    await expect(agent.drain()).resolves.toBe(0);
    expect(testLog.error).toHaveBeenCalled();
  });

  it('drain() içindeki beklenmeyen (Error olmayan) bir fırlatma da dışarı sızmaz', async () => {
    const api = fakeApi([job('a')]);
    api.claim = vi.fn(async () => { throw new Error('beklenmeyen (dize gövdeli) hata'); });
    const testLog = freshLog();
    const printer = { status: vi.fn(async () => okState), print: vi.fn() };
    const agent = new Agent(api, { printer, log: testLog });
    await agent.checkPrinter();
    await expect(agent.drain()).resolves.toBe(0);
  });
});

describe('Agent — I1: boşta yazıcı kontrolü baskı sürerken atlanır (tek TCP oturumu)', () => {
  it('draining sırasında checkPrinterIfIdle ikinci bir durum sorgusu açmaz, boşta kalınca açar', async () => {
    const api = fakeApi([job('a')]);
    let resolvePrint: (() => void) | undefined;
    const printer = {
      status: vi.fn(async () => okState),
      print: vi.fn(
        () =>
          new Promise<{ before: typeof okState; after: typeof okState }>((resolve) => {
            resolvePrint = () => resolve({ before: okState, after: okState });
          }),
      ),
    };
    const agent = new Agent(api, { printer, log: freshLog() });
    await agent.checkPrinter();
    const statusCallsAfterInitial = printer.status.mock.calls.length;

    const drainPromise = agent.drain();
    await new Promise((r) => setTimeout(r, 0)); // drain() print() içine girsin (draining=true)
    await agent.checkPrinterIfIdle();
    expect(printer.status.mock.calls.length).toBe(statusCallsAfterInitial); // atlandı

    resolvePrint!();
    await drainPromise;
    await agent.checkPrinterIfIdle();
    expect(printer.status.mock.calls.length).toBe(statusCallsAfterInitial + 1); // artık boşta, çalıştı
  });
});

// R69 (review fix round 2, NEW-2) — ZORUNLU test #2: `checkPrinterIfIdle`'ın `this.draining`
// bayrağı TEK YÖNLÜYDÜ (yalnız "baskı sürerken durum sorgusu başlamasın"). `checkPrinter()`
// `printer.status()`'u beklerken hiçbir bayrak ayarlanmıyordu; `drain()`'in `printerReady()`'si
// await'ten ÖNCEKİ durumu okuyup `true` dönüp `printWithChecks`'in İKİNCİ bir TCP bağlantısı
// açmasına izin verebiliyordu. Gerçek mutex, HER İKİ sırada da (durum→baskı, baskı→durum) tam
// karşılıklı dışlama sağlamalı — aşağıdaki testler bunu `checkPrinter()`'ı (draining bayrağını
// atlayan ham yöntemi) kullanarak, bayraktan bağımsız biçimde doğrudan mutex üzerinden kanıtlar.
function controllablePrinter() {
  let inFlight = 0;
  let maxInFlight = 0;
  let holdStatus = false;
  let holdPrint = false;
  let releaseStatus: (() => void) | undefined;
  let releasePrint: (() => void) | undefined;
  const printer = {
    status: vi.fn(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (!holdStatus) {
        inFlight -= 1;
        return Promise.resolve(okState);
      }
      return new Promise<typeof okState>((resolve) => {
        releaseStatus = () => {
          inFlight -= 1;
          resolve(okState);
        };
      });
    }),
    print: vi.fn(() => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      if (!holdPrint) {
        inFlight -= 1;
        return Promise.resolve({ before: okState, after: okState });
      }
      return new Promise<{ before: typeof okState; after: typeof okState }>((resolve) => {
        releasePrint = () => {
          inFlight -= 1;
          resolve({ before: okState, after: okState });
        };
      });
    }),
  };
  return {
    printer,
    setHoldStatus: (v: boolean) => { holdStatus = v; },
    setHoldPrint: (v: boolean) => { holdPrint = v; },
    releaseStatus: () => releaseStatus?.(),
    releasePrint: () => releasePrint?.(),
    getMaxInFlight: () => maxInFlight,
  };
}

describe('Agent — R69: yazıcıya dokunan iki işlem asla aynı anda uçmaz (gerçek mutex)', () => {
  it('durum→baskı sırası: checkPrinter() durum sorgusu sürerken başlayan bir print() onu bekler', async () => {
    const api = fakeApi([job('a')]);
    const { printer, setHoldStatus, releaseStatus, getMaxInFlight } = controllablePrinter();
    const agent = new Agent(api, { printer, log: freshLog() });
    await agent.checkPrinter(); // kurulum: anında döner, state hazır olur

    setHoldStatus(true);
    const checkPromise = agent.checkPrinter(); // artık status() mutex'i tutacak
    await tick();
    expect(printer.status).toHaveBeenCalledTimes(2);

    const drainPromise = agent.drain(); // printerReady() eski (hazır) state'i okur, true döner
    await tick();
    await tick();
    expect(printer.print).not.toHaveBeenCalled(); // status hâlâ sürüyor — mutex print()i bekletiyor

    releaseStatus();
    await checkPromise;
    await drainPromise;
    expect(printer.print).toHaveBeenCalledTimes(1);
    expect(getMaxInFlight()).toBe(1); // hiçbir an ikisi birden uçmadı
  });

  it('baskı→durum sırası: print() sürerken başlayan bir checkPrinter() onu bekler (draining bayrağından bağımsız)', async () => {
    const api = fakeApi([job('a')]);
    const { printer, setHoldPrint, releasePrint, getMaxInFlight } = controllablePrinter();
    const agent = new Agent(api, { printer, log: freshLog() });
    await agent.checkPrinter();

    setHoldPrint(true);
    const drainPromise = agent.drain();
    await tick();
    await tick();
    expect(printer.print).toHaveBeenCalledTimes(1); // mutex'i tuttu, henüz bitmedi

    // Kasıtlı olarak `checkPrinterIfIdle()` değil, ham `checkPrinter()` — `this.draining` hâlâ
    // true olsa bile mutex'in KENDİSİ karşılıklı dışlamayı sağlamalı, yalnızca bayrak değil.
    const checkPromise = agent.checkPrinter();
    await tick();
    expect(printer.status).toHaveBeenCalledTimes(1); // yalnız kurulum çağrısı — ikincisi henüz başlamadı

    releasePrint();
    await drainPromise;
    await checkPromise;
    expect(printer.status).toHaveBeenCalledTimes(2);
    expect(getMaxInFlight()).toBe(1);
  });
});

describe('Agent — I2: stop() sürmekte olan bir baskıyı bekler', () => {
  it('drain() print() içindeyken stop() onu bekler, sonra api.close() çağrılır', async () => {
    const api = fakeApi([job('a')]);
    let resolvePrint: (() => void) | undefined;
    const printer = {
      status: vi.fn(async () => okState),
      print: vi.fn(
        () =>
          new Promise<{ before: typeof okState; after: typeof okState }>((resolve) => {
            resolvePrint = () => resolve({ before: okState, after: okState });
          }),
      ),
    };
    const agent = new Agent(api, { printer, log: freshLog() }, { stopGraceMs: 2000 });
    await agent.checkPrinter();
    const drainPromise = agent.drain();
    await new Promise((r) => setTimeout(r, 0));

    let stopped = false;
    const stopPromise = agent.stop().then(() => { stopped = true; });
    await new Promise((r) => setTimeout(r, 30));
    expect(stopped).toBe(false);
    expect(api.close).not.toHaveBeenCalled();

    resolvePrint!();
    await drainPromise;
    await stopPromise;
    expect(stopped).toBe(true);
    expect(api.close).toHaveBeenCalled();
  });
});

describe('Agent — I4: art arda claim hatalarında geri çekilme', () => {
  it('claim art arda başarısız olduğunda backoff süresi dolmadan hemen tekrar denenmez', async () => {
    const api = fakeApi([]);
    api.claim = vi.fn(async () => { throw new Error('DB 500'); });
    const printer = { status: vi.fn(async () => okState), print: vi.fn() };
    const agent = new Agent(api, { printer, log: freshLog() }, { claimRetryBaseMs: 10_000 });
    await agent.checkPrinter();
    await agent.drain(); // 1. deneme başarısız olur, geri çekilme kurulur
    expect(api.claim).toHaveBeenCalledTimes(1);
    await agent.drain(); // backoff (10 sn) dolmadan hemen tekrar tetiklenir
    expect(api.claim).toHaveBeenCalledTimes(1); // tekrar denenmedi
  });
});

describe('Agent — M4: host kaybolunca eski durum heartbeat üzerinden taşınmaz', () => {
  it('ayarlar host\'u boşaltırsa state ve hata birlikte güncellenir', async () => {
    const api = fakeApi([]);
    const printer = { status: vi.fn(async () => okState), print: vi.fn() };
    const agent = new Agent(api, { printer, log: freshLog() });
    await agent.start();
    await new Promise((r) => setTimeout(r, 0));
    await agent.sendHeartbeat();
    expect(api.heartbeat).toHaveBeenLastCalledWith(expect.objectContaining({ state: expect.objectContaining({ known: true }) }));

    const cb = api.onSettings.mock.calls[0]![0] as (s: typeof settings) => void;
    cb({ ...settings, host: '' });
    await new Promise((r) => setTimeout(r, 0));
    await agent.sendHeartbeat();
    expect(api.heartbeat).toHaveBeenLastCalledWith(expect.objectContaining({ state: null, error: 'printer_host_missing' }));

    await agent.stop();
  });
});
