import { beforeEach, describe, expect, it, vi } from 'vitest';

// Görev 19 review, TESTS #3: gerçek bir ağ olmadan `api.ts`'in RPC sözleşmesini sabitler
// (R52: complete_print_job dört argümanlı imza; R55: claim/complete run-özgü kimlik, heartbeat
// sade AGENT_ID; job_not_printing'in yutulması). `@supabase/supabase-js`'in `createClient`'ı
// sahte bir istemciyle değiştirilir — gerçek ağ/DB'ye hiç bağlanılmaz.

type RpcResult = { data: unknown; error: { message: string } | null; status: number };
type RpcCall = { fn: string; args: Record<string, unknown>; signal?: AbortSignal };

const rpcCalls: RpcCall[] = [];
let rpcHandler: (fn: string, args: Record<string, unknown>) => RpcResult;

// R78 (round 5): postgrest-js'in gerçek `.rpc()` dönüşü thenable BİR builder'dır ve
// `.abortSignal(signal)` metodu `this`'i döndürüp await edilmeden ÖNCE zincirlenebilir (bkz.
// `PostgrestTransformBuilder.abortSignal`). Sahte istemci bunu birebir taklit eder — `api.ts`
// içindeki `rpc()` yardımcısının `builder.abortSignal(...)` çağırıp await ETTİĞİ gerçek akışı
// (yalnız `complete_print_job` için, R78) doğru sınayabilelim diye.
function makeRpcBuilder(fn: string, args: Record<string, unknown>) {
  let signal: AbortSignal | undefined;
  const builder = {
    abortSignal: (s: AbortSignal) => {
      signal = s;
      return builder;
    },
    then: (
      onFulfilled: (v: RpcResult) => unknown,
      onRejected?: (e: unknown) => unknown,
    ) => {
      rpcCalls.push({ fn, args, signal });
      return Promise.resolve(rpcHandler(fn, args)).then(onFulfilled, onRejected);
    },
  };
  return builder;
}

vi.mock('@supabase/supabase-js', () => ({
  createClient: vi.fn(() => ({
    auth: {
      signInWithPassword: vi.fn(async () => ({ error: null })),
      signOut: vi.fn(async () => ({ error: null })),
    },
    realtime: { setAuth: vi.fn(async () => {}) },
    rpc: vi.fn((fn: string, args: Record<string, unknown>) => makeRpcBuilder(fn, args)),
    channel: vi.fn(() => {
      const chain = { on: vi.fn(() => chain), subscribe: vi.fn(() => chain) };
      return chain;
    }),
    removeChannel: vi.fn(async () => {}),
    from: vi.fn(),
  })),
}));

const { createSupabaseApi, createTimeoutFetch, DEFAULT_RPC_TIMEOUT_MS, DEFAULT_COMPLETE_TIMEOUT_MS } = await import('./api');
const { createClient } = await import('@supabase/supabase-js');

const env = {
  SUPABASE_URL: 'https://x.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  AGENT_EMAIL: 'drucker@staff.example.com',
  AGENT_PASSWORD: 'secret1234',
  AGENT_ID: 'ramos-pc-1',
  LOG_DIR: './logs',
};

const log = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
const ok = (data: unknown = null): RpcResult => ({ data, error: null, status: 200 });

beforeEach(() => {
  rpcCalls.length = 0;
  log.info.mockClear();
  log.warn.mockClear();
  log.error.mockClear();
  rpcHandler = () => ok();
});

describe('createSupabaseApi — R55: run-özgü kimlik ayrımı', () => {
  it('claim: claim_print_job\'ı `${AGENT_ID}#...` biçiminde bir run-özgü kimlikle çağırır', async () => {
    rpcHandler = (fn) => (fn === 'claim_print_job' ? ok([]) : ok());
    const api = await createSupabaseApi(env, log);
    await api.claim();

    const call = rpcCalls.find((c) => c.fn === 'claim_print_job');
    expect(call).toBeDefined();
    expect(call!.args).toHaveProperty('p_agent_id');
    const agentId = call!.args.p_agent_id as string;
    expect(agentId.startsWith(`${env.AGENT_ID}#`)).toBe(true);
    expect(agentId).not.toBe(env.AGENT_ID);
  });

  it('complete: aynı run-özgü kimliği kullanır (claim ile complete BİRBİRİYLE AYNI)', async () => {
    rpcHandler = (fn) => (fn === 'claim_print_job' ? ok([]) : ok());
    const api = await createSupabaseApi(env, log);
    await api.claim();
    await api.complete('job-1', true, undefined);

    const claimId = rpcCalls.find((c) => c.fn === 'claim_print_job')!.args.p_agent_id;
    const completeId = rpcCalls.find((c) => c.fn === 'complete_print_job')!.args.p_agent_id;
    expect(completeId).toBe(claimId);
  });

  it('heartbeat: sade AGENT_ID gönderir — claim/complete kimliğiyle AYNI DEĞİL', async () => {
    const api = await createSupabaseApi(env, log);
    await api.claim();
    await api.heartbeat({ reachable: true, state: null, error: null });

    const claimId = rpcCalls.find((c) => c.fn === 'claim_print_job')!.args.p_agent_id;
    const hbId = rpcCalls.find((c) => c.fn === 'agent_heartbeat')!.args.p_agent_id;
    expect(hbId).toBe(env.AGENT_ID);
    expect(hbId).not.toBe(claimId);
  });
});

describe('createSupabaseApi — R52: complete_print_job dört argümanlı imza', () => {
  it('complete tam olarak {p_job_id, p_ok, p_error, p_agent_id} gönderir — fazla/eksik alan yok', async () => {
    const api = await createSupabaseApi(env, log);
    await api.claim();
    await api.complete('job-1', true, undefined);

    const call = rpcCalls.find((c) => c.fn === 'complete_print_job')!;
    expect(Object.keys(call.args).sort()).toEqual(['p_agent_id', 'p_error', 'p_job_id', 'p_ok'].sort());
    expect(call.args.p_job_id).toBe('job-1');
    expect(call.args.p_ok).toBe(true);
    expect(call.args.p_error).toBeNull();
  });

  it('complete(ok=false, error) p_error alanını taşır', async () => {
    const api = await createSupabaseApi(env, log);
    await api.complete('job-1', false, 'io: reset');
    const call = rpcCalls.find((c) => c.fn === 'complete_print_job')!;
    expect(call.args.p_error).toBe('io: reset');
  });
});

describe('createSupabaseApi — job_not_printing (R52/R55) baskı hatası sayılmaz', () => {
  it('complete_print_job "job_not_printing" ile reddederse yutulur (fırlatmaz), loglanır', async () => {
    rpcHandler = (fn) => (fn === 'complete_print_job' ? { data: null, error: { message: 'job_not_printing' }, status: 200 } : ok());
    const api = await createSupabaseApi(env, log);
    await expect(api.complete('job-1', true, undefined)).resolves.toBeUndefined();
    expect(log.warn).toHaveBeenCalled();
  });

  it('başka bir RPC hatası (ör. job_not_found) fırlatılır — yalnız job_not_printing yutulur', async () => {
    rpcHandler = (fn) => (fn === 'complete_print_job' ? { data: null, error: { message: 'job_not_found' }, status: 200 } : ok());
    const api = await createSupabaseApi(env, log);
    await expect(api.complete('job-1', true, undefined)).rejects.toThrow(/job_not_found/);
  });
});

describe('createSupabaseApi — 401 üzerinde bir kez yeniden giriş', () => {
  it('ilk çağrı 401 dönerse bir kez yeniden giriş yapıp aynı RPC\'yi tekrar dener', async () => {
    let attempts = 0;
    rpcHandler = (fn) => {
      if (fn !== 'claim_print_job') return ok();
      attempts += 1;
      return attempts === 1 ? { data: null, error: { message: 'jwt expired' }, status: 401 } : ok([]);
    };
    const api = await createSupabaseApi(env, log);
    const job = await api.claim();
    expect(job).toBeNull();
    expect(attempts).toBe(2);
  });
});

// ---------- Review fix round 4 (R71, I-2) ----------
//
// Bulgu: `rpc()` çağrılarında istemci tarafı zaman aşımı yoktu. Yarı açık bir TCP bağlantısında
// istek ne çözülür ne reddedilir; tek sınır undici'nin ~300 sn'lik varsayılanıydı —
// `claim_print_job`'ın 60 sn'lik reclaim penceresinden çok uzun. Çözüm: `global.fetch`'i
// `AbortSignal.timeout()` ile saran bir fetch (`createTimeoutFetch`).

describe('createTimeoutFetch — R71: her deneme istemci tarafı zaman aşımıyla sınırlanır', () => {
  it('temel fetch hiç çözülmese bile istek zaman aşımı içinde REDDEDER (askıda kalmaz)', async () => {
    const hangingFetch = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('zaman aşımı'), { name: 'AbortError' })));
        }),
    ) as unknown as typeof fetch;

    const timeoutFetch = createTimeoutFetch(20, hangingFetch); // testte hızlı olsun diye 20 ms
    await expect(timeoutFetch('https://x.example/rpc', {})).rejects.toThrow();
    expect(hangingFetch).toHaveBeenCalledTimes(1);
  });

  it('normal (hızlı çözülen) istekleri etkilemez — yanıt olduğu gibi geçer', async () => {
    const fastFetch = vi.fn(async () => new Response('ok', { status: 200 })) as unknown as typeof fetch;
    const timeoutFetch = createTimeoutFetch(5000, fastFetch);
    const res = await timeoutFetch('https://x.example/rpc', {});
    expect(await res.text()).toBe('ok');
  });

  it('R78: varsayılan genel zaman aşımı 25 sn — claim/heartbeat/settings/signIn (60 sn\'lik reclaim penceresinden kısa, ama livelock\'a yol açmayacak kadar uzun)', () => {
    expect(DEFAULT_RPC_TIMEOUT_MS).toBe(25000);
  });

  it('R78: varsayılan complete zaman aşımı 10 sn — YALNIZ complete_print_job (bayt zaten gitti, erken vazgeçip yeniden denemeye geçmeli)', () => {
    expect(DEFAULT_COMPLETE_TIMEOUT_MS).toBe(10000);
  });
});

describe('createSupabaseApi — R71: istemci global.fetch AbortSignal.timeout ile sarılı olarak kurulur', () => {
  it('createClient bir global.fetch seçeneğiyle çağrılır ve bu fetch, temel fetch hiç çözülmese bile reddeder', async () => {
    const hangingBaseFetch = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('zaman aşımı'), { name: 'AbortError' })));
        }),
    ) as unknown as typeof fetch;

    await createSupabaseApi(env, log, { rpcTimeoutMs: 20, baseFetch: hangingBaseFetch });

    const call = (createClient as unknown as { mock: { calls: unknown[][] } }).mock.calls.at(-1)!;
    const options = call[2] as { global?: { fetch?: typeof fetch } };
    expect(typeof options.global?.fetch).toBe('function');
    await expect(options.global!.fetch!('https://x.example/rpc', {})).rejects.toThrow();
  });
});

// ---------- Review fix round 5 (R78/M-a) ----------
//
// I-A/R78 bulgusu: round-4'ün TEK sabit zaman aşımı değeri (10 sn, `claim_print_job`'a da
// uygulanıyordu) yeni bir LIVELOCK riski açtı — `claim_print_job` sunucuda önce işi `printing`
// yapıp `claimed_at = now()` damgalıyor, sonra döndürüyor; istemci 10 sn'de iptal ederse
// `claimed_at` sürekli `now()`'a çekilip fiş ASLA basılmaz. Çözüm: zaman aşımı çağrı başına —
// yalnız `complete_print_job` kısa (10 sn) alır, `claim`/`heartbeat`/`settings`/`signIn` genel
// (25 sn) varsayılanı kullanır. M-a: `createTimeoutFetch` artık çağıranın kendi `init.signal`'ını
// (postgrest'in `.abortSignal()`'ı) `AbortSignal.any()` ile birleştiriyor — bu birleşim, `complete`
// için genel (25 sn) ve özel (10 sn) sinyallerin AYNI ANDA etkili olmasını (kısa olanın kazanmasını)
// sağlıyor.

describe('createSupabaseApi — R78: zaman aşımı ÇAĞRI BAŞINA — complete kısa, claim/heartbeat uzun', () => {
  it('complete_print_job çağrısına .abortSignal() ile AYRI, kısa bir sinyal takılır; claim_print_job/agent_heartbeat\'e TAKILMAZ (genel global.fetch varsayılanını kullanırlar)', async () => {
    rpcHandler = (fn) => (fn === 'claim_print_job' ? ok([]) : ok());
    const api = await createSupabaseApi(env, log);
    await api.claim();
    await api.complete('job-1', true, undefined);
    await api.heartbeat({ reachable: true, state: null, error: null });

    const claimCall = rpcCalls.find((c) => c.fn === 'claim_print_job')!;
    const completeCall = rpcCalls.find((c) => c.fn === 'complete_print_job')!;
    const heartbeatCall = rpcCalls.find((c) => c.fn === 'agent_heartbeat')!;

    // R78'in ASIL sabitlediği regresyon: claim_print_job'a ÇAĞRIYA ÖZGÜ kısa bir sinyal
    // TAKILMAMALI — yalnız global.fetch'in genel (25 sn) varsayılanına tabidir.
    expect(claimCall.signal).toBeUndefined();
    expect(heartbeatCall.signal).toBeUndefined();
    expect(completeCall.signal).toBeInstanceOf(AbortSignal);
  });

  it('complete_print_job\'a takılan sinyal opts.completeTimeoutMs\'e göre kurulur (varsayılan 10 sn) ve bu süre içinde gerçekten dolar', async () => {
    const api = await createSupabaseApi(env, log, { completeTimeoutMs: 20 }); // testte hızlı olsun diye 20 ms
    await api.complete('job-1', true, undefined);
    const completeCall = rpcCalls.find((c) => c.fn === 'complete_print_job')!;
    expect(completeCall.signal?.aborted).toBe(false); // henüz dolmadı (çağrı anında)
    await new Promise((r) => setTimeout(r, 60));
    expect(completeCall.signal?.aborted).toBe(true); // 20 ms sonra doldu
  });
});

describe('createTimeoutFetch — M-a: çağıranın kendi signal\'ı sessizce atılmaz, birleştirilir', () => {
  it('çağıranın KISA signal\'ı sarmalayıcının UZUN varsayılanından önce reddeder (AbortSignal.any birleşimi)', async () => {
    const hangingFetch = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('iptal'), { name: 'AbortError' })));
        }),
    ) as unknown as typeof fetch;
    const timeoutFetch = createTimeoutFetch(5000, hangingFetch); // sarmalayıcının kendi süresi UZUN (5 sn)
    const callerSignal = AbortSignal.timeout(20); // çağırana özgü, ÇOK daha kısa

    const startedAt = Date.now();
    await expect(timeoutFetch('https://x.example/rpc', { signal: callerSignal })).rejects.toThrow();
    expect(Date.now() - startedAt).toBeLessThan(1000); // 5 sn'yi değil, çağıranın ~20 ms'sini bekledi
  });

  it('çağıranın signal\'ı yoksa yalnızca sarmalayıcının kendi zaman aşımı uygulanır (regresyon: önceki davranış korunur)', async () => {
    const hangingFetch = vi.fn(
      (_input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(Object.assign(new Error('iptal'), { name: 'AbortError' })));
        }),
    ) as unknown as typeof fetch;
    const timeoutFetch = createTimeoutFetch(20, hangingFetch);
    await expect(timeoutFetch('https://x.example/rpc', {})).rejects.toThrow();
  });
});
