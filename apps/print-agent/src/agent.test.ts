import { describe, expect, it, vi } from 'vitest';
import { Agent, type AgentApi, type Job } from './agent';
import { createTimeoutFetch } from './api';
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
  it('complete(true) tekrarla başarısız olsa bile stop() süre sınırı olmadan doğrulanana kadar bekler', async () => {
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
    // R70: `stopGraceMs` kaldırıldı — stop() artık süre sınırı olmadan doğrulanana kadar bekler.
    const agent = new Agent(api, { printer, log: freshLog() }, { completeRetryBaseMs: 5 });
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
    const agent = new Agent(api, { printer, log: freshLog() });
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

// ---------- Review fix round 3 (R70) ----------
//
// Bulgu: `stop()`'un `pendingConfirmations` beklemesi bittikten sonra `api.close()`
// `this.draining`'i YENİDEN KONTROL ETMİYORDU; `drain()` ise bu sırada YENİ iş sahiplenip
// basmaya devam edebiliyordu. Sahne: B işi basılıyor → `api.close()` oturumu kapatıyor →
// `complete(B, true)` ölü oturumda sonsuza dek yeniden deneniyor → B `printing` kalıyor →
// 60 sn'de `claim_print_job` geri alıp İKİNCİ KEZ bastırıyor.
//
// R70(a): `stopping` bayrağı — `stop()` çağrıldığı andan itibaren `drain()` YENİ iş
// sahiplenmez (elindeki işi sonuna kadar işler). R70(b): son bekleme TEK, birleşik bir
// koşuldur — `while (this.draining || this.pendingConfirmations > 0)` — `api.close()` asla
// sürmekte olan bir baskının ya da bekleyen bir onayın altından çekilmez.

describe('Agent — R70(a): stop() çağrıldıktan sonra drain() yeni iş sahiplenmez', () => {
  it('elindeki işi (basılmakta olanı) bitirir ama kuyrukta bekleyen ikinci işi asla sahiplenmez', async () => {
    const api = fakeApi([job('a'), job('b')]);
    let resolvePrintA: (() => void) | undefined;
    let printCalls = 0;
    const printer = {
      status: vi.fn(async () => okState),
      print: vi.fn(() => {
        printCalls += 1;
        if (printCalls === 1) {
          return new Promise<{ before: typeof okState; after: typeof okState }>((resolve) => {
            resolvePrintA = () => resolve({ before: okState, after: okState });
          });
        }
        return Promise.resolve({ before: okState, after: okState });
      }),
    };
    const agent = new Agent(api, { printer, log: freshLog() });
    await agent.checkPrinter();

    const drainPromise = agent.drain();
    await tick(); // print(a) başladı ve asılı kaldı — draining=true, b henüz sahiplenilmedi

    const stopPromise = agent.stop(); // R70(a): stopping=true buradan itibaren

    resolvePrintA!(); // a'nın baytları gitti — drain() devam eder, ama artık YENİ iş almamalı
    await drainPromise;
    await stopPromise;

    expect(api.claim).toHaveBeenCalledTimes(1); // yalnız a — b hiç sahiplenilmedi
    expect(printer.print).toHaveBeenCalledTimes(1); // b hiç basılmadı
    expect(api.close).toHaveBeenCalled();
  });
});

describe('Agent — R70(b): api.close() sürmekte olan baskı VE bekleyen onay bitmeden asla çağrılmaz', () => {
  it('bir işin onayı sürerken stop() çağrılırsa, ardından o iş yüzünden sahiplenilebilecek hiçbir ikinci iş basılırken api.close() çağrılmaz', async () => {
    const api = fakeApi([job('a'), job('b')]);
    let resolveCompleteA: (() => void) | undefined;
    api.complete = vi.fn(
      (id: string) =>
        new Promise<void>((resolve) => {
          if (id === 'a') resolveCompleteA = resolve;
          else resolve();
        }),
    );

    let printCalls = 0;
    let printBPending = false; // true: b'nin basımı başladı ama henüz bitmedi
    let resolvePrintB: (() => void) | undefined;
    const printer = {
      status: vi.fn(async () => okState),
      print: vi.fn(() => {
        printCalls += 1;
        if (printCalls === 2) {
          printBPending = true;
          return new Promise<{ before: typeof okState; after: typeof okState }>((resolve) => {
            resolvePrintB = () => {
              printBPending = false;
              resolve({ before: okState, after: okState });
            };
          });
        }
        return Promise.resolve({ before: okState, after: okState });
      }),
    };

    let closeCalledWhilePrintBPending = false;
    api.close = vi.fn(async () => {
      closeCalledWhilePrintBPending = printBPending;
    });

    const agent = new Agent(api, { printer, log: freshLog() });
    await agent.checkPrinter();

    const drainPromise = agent.drain();
    await tick(); // a basıldı, complete(a) çağrıldı ve ASILI kaldı (pendingConfirmations=1)

    const stopPromise = agent.stop(); // stopping=true buradan itibaren (R70a) — b artık sahiplenilmemeli

    resolveCompleteA!(); // a'nın onayı biter — pendingConfirmations 0'a düşer

    // Eski (kusurlu) kodda burada drain() b'yi sahiplenip basmaya başlıyor ve stop()'un yalnız
    // pendingConfirmations'a bakan ikinci döngüsü api.close()'u b HÂLÂ basılırken çağırabiliyordu.
    // Bu yüzden gerçek zamanlı olarak eski kodun ~200 ms'lik yoklama aralığını aşacak kadar bekliyoruz.
    await new Promise((r) => setTimeout(r, 300));

    resolvePrintB?.(); // (yalnız eski koddaysa) b'nin basımını serbest bırak, test asılı kalmasın
    await drainPromise;
    await stopPromise;

    expect(closeCalledWhilePrintBPending).toBe(false);
    expect(api.claim).toHaveBeenCalledTimes(1); // R70(a) ile b hiç sahiplenilmemeli
    expect(api.close).toHaveBeenCalled();
  }, 10000);
});

// İsteğe bağlı minor: uzun bir onay denemesi (`completeSuccessWithRetry`) sürerken yazıcı
// FİİLEN boştadır (bayt zaten gitti, yalnız Supabase'e `complete` RPC'si deneniyor) — eski kod
// `checkPrinterIfIdle`'ı yalnız `this.draining`'e bakarak atlıyordu, bu yüzden heartbeat bu süre
// boyunca bayat durum bildiriyordu. Düzeltme ucuz olduğu için kapatıldı: yeni `printerBusy`
// bayrağı yalnız gerçek `printer.print()` çağrısı sürerken true'dur; `draining` yerine bu
// kullanılır. Karar: minor düzeltildi (ayrı bir bayrakla) — ertelenmedi.
describe('Agent — R70 minor: onay yeniden denemesi sürerken yazıcı durumu güncel kalır', () => {
  it('completeSuccessWithRetry sürerken (yazıcı fiilen boşta) checkPrinterIfIdle artık atlanmaz', async () => {
    const api = fakeApi([job('a')]);
    api.complete = vi.fn(() => new Promise<void>(() => {})); // hiç çözülmez — pendingConfirmations>0 sabit kalır
    const printer = { status: vi.fn(async () => okState), print: vi.fn(async () => ({ before: okState, after: okState })) };
    const agent = new Agent(api, { printer, log: freshLog() });
    await agent.checkPrinter();
    const statusCallsAfterInitial = printer.status.mock.calls.length;

    void agent.drain();
    await tick(); // print() bitti, completeSuccessWithRetry api.complete()'i çağırdı ve ASILI (draining hâlâ true)

    await agent.checkPrinterIfIdle();
    expect(printer.status.mock.calls.length).toBe(statusCallsAfterInitial + 1); // artık atlanmadı
  });
});

// ---------- Review fix round 4 ----------

describe('Agent — R71 (I-2): bir Supabase isteği istemci tarafında hiç zaman aşımına uğramasa bile ajan sonsuza dek takılmaz', () => {
  it('her deneme AbortSignal.timeout ile sarılı gerçek `createTimeoutFetch` sayesinde sınırlı sürede reddeder, yeniden dener ve stop() sonunda döner', async () => {
    const api = fakeApi([job('a')]);
    let attempts = 0;
    // R71'in gerçek mekanizması: temel fetch hiç çözülmese bile (yarı açık TCP'yi taklit eder)
    // `createTimeoutFetch` her denemeyi ~20 ms'de reddeder.
    const hangingBaseFetch = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('zaman aşımı'), { name: 'AbortError' })));
        }),
    ) as unknown as typeof fetch;
    const timeoutFetch = createTimeoutFetch(20, hangingBaseFetch);

    api.complete = vi.fn(async (_id: string, ok: boolean) => {
      attempts += 1;
      if (attempts < 3) {
        await timeoutFetch('https://x.example/rest/v1/rpc/complete_print_job', {}); // her zaman reddeder
        return; // buraya asla ulaşılmaz
      }
      expect(ok).toBe(true);
    });

    const printer = { status: vi.fn(async () => okState), print: vi.fn(async () => ({ before: okState, after: okState })) };
    const agent = new Agent(api, { printer, log: freshLog() }, { completeRetryBaseMs: 0 });
    await agent.checkPrinter();

    const drainPromise = agent.drain();
    await tick(); // print() bitti, completeSuccessWithRetry başladı — ilk deneme zaman aşımına gidiyor

    const stopPromise = agent.stop(); // R71 sayesinde her deneme sınırlı sürede reddeder — sonsuza dek asılı kalmaz

    await drainPromise;
    await stopPromise;

    expect(attempts).toBe(3);
    expect(api.close).toHaveBeenCalled();
  }, 5000);
});

describe('Agent — R72 (I-1): kapanış beklemesi artık sessiz değil', () => {
  it('bekleme başlarken bir kez, sonra ~10 sn\'de bir tekrar log\'lanır (her 25 ms\'de değil)', async () => {
    const api = fakeApi([job('a')]);
    let resolveComplete: (() => void) | undefined;
    api.complete = vi.fn(() => new Promise<void>((resolve) => { resolveComplete = resolve; }));
    const printer = { status: vi.fn(async () => okState), print: vi.fn(async () => ({ before: okState, after: okState })) };
    const testLog = freshLog();
    let fakeMs = 0;
    const now = () => new Date(fakeMs);
    const agent = new Agent(api, { printer, log: testLog, now }, { completeRetryBaseMs: 5 });
    await agent.checkPrinter();

    const drainPromise = agent.drain();
    await tick(); // print bitti, complete() çağrıldı ve ASILI kaldı (pendingConfirmations=1)

    const stopPromise = agent.stop();
    await tick();
    const waitLogs = () => testLog.info.mock.calls.filter((c) => c[0] === 'kapanış bekleniyor').length;
    expect(waitLogs()).toBe(1); // yalnız başlangıç logu

    fakeMs += 11000; // sahte saat 10 sn eşiğini aştı
    await new Promise((r) => setTimeout(r, 90)); // birkaç 25 ms'lik gerçek poll turu geçsin
    expect(waitLogs()).toBe(2); // eşik aşıldığı için bir kez daha log'landı

    resolveComplete!();
    await drainPromise;
    await stopPromise;
  });
});

describe('Agent — M1 (round-4 re-review): R70(b) birleşik bekleme koşulu doğrudan sabitlenir', () => {
  it('draining VE pendingConfirmations ayrı ayrı değil BİRLİKTE değerlendirilir — biri bile true ise beklemeye devam edilir', () => {
    const api = fakeApi([]);
    const printer = { status: vi.fn(async () => okState), print: vi.fn() };
    const agent = new Agent(api, { printer, log: freshLog() });
    const agentInternal = agent as unknown as {
      draining: boolean;
      pendingConfirmations: number;
      shouldKeepWaitingBeforeClose(): boolean;
    };

    agentInternal.draining = false;
    agentInternal.pendingConfirmations = 0;
    expect(agentInternal.shouldKeepWaitingBeforeClose()).toBe(false); // ikisi de temiz — kapanabilir

    agentInternal.draining = true;
    agentInternal.pendingConfirmations = 0;
    expect(agentInternal.shouldKeepWaitingBeforeClose()).toBe(true);

    // R70(b)'nin asıl sabitlediği durum: `draining` ZATEN false olsa bile `pendingConfirmations`
    // hâlâ pozitifse yine de beklemeye devam edilmeli — eski (round-2) iki-AYRI-döngü biçiminde
    // bu durumu ikinci döngü doğru yakalıyordu, ama İLK döngüden `pendingConfirmations > 0`a
    // dönüldüğü anda çıkılıp `draining` bir daha HİÇ kontrol edilmiyordu. Bu fonksiyon her
    // çağrıda İKİ koşulu da BİRLİKTE, yeniden değerlendirir.
    agentInternal.draining = false;
    agentInternal.pendingConfirmations = 1;
    expect(agentInternal.shouldKeepWaitingBeforeClose()).toBe(true);

    agentInternal.draining = true;
    agentInternal.pendingConfirmations = 1;
    expect(agentInternal.shouldKeepWaitingBeforeClose()).toBe(true);
  });
});

describe('Agent — M2 (round-4 re-review): stop() sonrası aynı örnek start() ile yeniden kullanılabilir', () => {
  it('start() → stop() → start() sonrası ajan yeniden iş basabilir (stopping sıfırlanır)', async () => {
    const jobs: Job[] = [];
    const api = fakeApi(jobs);
    const printed: string[] = [];
    const printer = {
      status: vi.fn(async () => okState),
      print: vi.fn(async (_s: unknown, bytes: Uint8Array) => {
        printed.push(Buffer.from(bytes).toString('latin1'));
        return { before: okState, after: okState };
      }),
    };
    const agent = new Agent(api, { printer, log: freshLog() });

    await agent.start();
    await tick();
    await agent.stop();

    jobs.push(job('a'));
    await agent.start(); // yeniden başlatma — stopping/stopPromise sıfırlanmalı
    await tick();
    expect(printed.length).toBe(1); // yeniden basabildi — eski koddaysa `stopping` kalıcı true kalır, hiç basmaz

    await agent.stop();
  });
});

describe('Agent — M3 (round-4 re-review): stop() idempotenttir', () => {
  it('art arda birden çok kez (eşzamanlı da) çağrılırsa api.close() yalnızca BİR kez çalışır', async () => {
    const api = fakeApi([]);
    const printer = { status: vi.fn(async () => okState), print: vi.fn() };
    const agent = new Agent(api, { printer, log: freshLog() });
    await agent.checkPrinter();

    await Promise.all([agent.stop(), agent.stop(), agent.stop()]);

    expect(api.close).toHaveBeenCalledTimes(1);
  });
});

describe('Agent — M5 (round-4 re-review): 60 sn\'yi aşan takılı bir onay heartbeat\'in hata alanına yansır', () => {
  it('stuck eşiği aşılınca heartbeat.error \'complete_stuck\' içerir, doğrulanınca temizlenir', async () => {
    const api = fakeApi([job('a')]);
    let attempt = 0;
    let rejectAttempt: ((e: Error) => void) | undefined;
    let resolveAttempt: (() => void) | undefined;
    api.complete = vi.fn(
      () =>
        new Promise<void>((resolve, reject) => {
          attempt += 1;
          if (attempt === 1) rejectAttempt = reject;
          else resolveAttempt = resolve;
        }),
    );
    const printer = { status: vi.fn(async () => okState), print: vi.fn(async () => ({ before: okState, after: okState })) };
    let fakeMs = 0;
    const now = () => new Date(fakeMs);
    const testLog = freshLog();
    const agent = new Agent(api, { printer, log: testLog, now }, { completeRetryBaseMs: 5 });
    await agent.checkPrinter();

    const drainPromise = agent.drain();
    await tick(); // print bitti, ilk complete() denemesi başladı (attempt=1) ve ASILI

    fakeMs = 61000; // sahte saat 60 sn eşiğini aştı
    rejectAttempt!(new Error('kesinti')); // ilk deneme reddedildi — catch artık STALE eşiğini görecek
    await new Promise((r) => setTimeout(r, 40)); // backoff (5 ms) geçsin, 2. deneme başlasın ve ASILI kalsın

    await agent.sendHeartbeat();
    const stuckCall = (api.heartbeat as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as { error: string | null };
    expect(stuckCall.error).toContain('complete_stuck');

    resolveAttempt!(); // 2. deneme başarıyla biter
    await drainPromise;

    await agent.sendHeartbeat();
    const clearedCall = (api.heartbeat as ReturnType<typeof vi.fn>).mock.calls.at(-1)![0] as { error: string | null };
    expect(clearedCall.error ?? '').not.toContain('complete_stuck'); // doğrulandı — temizlendi
  });
});
