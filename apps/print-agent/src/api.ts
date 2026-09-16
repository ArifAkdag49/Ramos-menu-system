import os from 'node:os';
import type { Database } from '@ramos/shared';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import type { AgentApi, AgentSettings, Heartbeat, Job, Logger } from './agent';
import type { AgentEnv } from './config';

// build.mjs bunu bundle sırasında JSON olarak gömer — ayrı bir dist dosyasına bağımlılık kalmaz.
import pkg from '../package.json' with { type: 'json' };
export const AGENT_VERSION: string = pkg.version;

const consoleLogger: Logger = {
  info: (m, d) => console.log(JSON.stringify({ level: 'info', msg: m, ...d })),
  warn: (m, d) => console.warn(JSON.stringify({ level: 'warn', msg: m, ...d })),
  error: (m, d) => console.error(JSON.stringify({ level: 'error', msg: m, ...d })),
};

type PrintJobRow = Database['public']['Tables']['print_jobs']['Row'];

function toJob(row: PrintJobRow): Job {
  return { id: row.id, type: row.type, payload: row.payload as unknown as Job['payload'], attempts: row.attempts };
}

// R71 (review fix round 4, I-2), düzeltildi R78 (round 5): `sb.rpc()` çağrılarının istemci
// tarafında zaman aşımı yoktu. Yarı açık bir TCP bağlantısında (ör. modem yeniden başlaması)
// istek ne çözülür ne reddedilir — tek sınır undici'nin ~300 sn'lik varsayılanıydı. `complete`
// bu şekilde askıda kalırsa `completeSuccessWithRetry` TEK denemede sonsuza dek takılır (asla
// reddetmediği için yeniden deneme döngüsüne HİÇ girmez). ÇİFT FİŞ RİSKİ İÇİN TEK BAŞINA BU
// YETMEZ: `drain()` tek-uçuşludur ve `completeSuccessWithRetry` kendi döngüsünün İÇİNDE
// `await` edilir, bu yüzden aynı ajan kendi askıda kalan işini asla ikinci kez basamaz —
// gerçek risk, İKİNCİ bir sahiplenici gerektirir: süreç Zamanlanmış Görev watchdog'unca ya da
// operatörce yeniden başlatılır (yeni `runAgentId`) → 60 sn'lik `claim_print_job` reclaim'i
// eski `printing` satırı geri alır → aynı fiş İKİNCİ KEZ basılır. Bu senaryo gerçekçi olduğu
// için R71 haklıydı (round-4 raporundaki tek-ajanla-sonsuza-dek-takılma zinciri yanlıştı, bkz.
// task-19-report.md "Düzeltme turu 5").
//
// R78 (round 5, Important — R71'in REGRESYONU): round-4'ün TEK sabit değeri (10 sn, tüm
// çağrılara `global.fetch` üzerinden uygulanıyordu) `claim_print_job` için YENİ bir çift-fiş
// YOKLUĞU riski açtı: `claim_print_job` sunucuda ÖNCE işi `printing` yapıp `claimed_at = now()`
// damgalıyor, SONRA döndürüyor. İstemci 10 sn'de iptal ederse iş sunucuda `printing` damgalı
// kalır, ajan onu hiç GÖRMEZ; yeniden sahiplenme ancak `claimed_at < now() - 60 sn` ile mümkün,
// ama o an yapılan yeni `claim` denemesi de 10 sn'de iptal edilip `claimed_at`'i TEKRAR `now()`'a
// çekiyor. Gidiş-dönüş sürekli >10 sn kaldığı sürece bu bir LIVELOCK'tur: fiş ASLA basılmaz.
// Çözüm: zaman aşımı artık ÇAĞRI BAŞINA. 60 sn'lik reclaim penceresinden KISA olmak yalnız
// `complete` için doğruluk gereğidir (bayt zaten gitti, `complete` askıda kalırsa reclaim'in
// onu tekrar bastırmaması için erken vazgeçip yeniden denemeye geçmeliyiz — R68). `claim`,
// `heartbeat`, `settings`, `signIn` için KISA bir zaman aşımı YARARSIZ hatta ZARARLIDIR (yukarıdaki
// livelock) — bunlar 25 sn alır (hâlâ 60 sn'nin çok altında, livelock penceresi 2,5 kat daralır,
// ama `claimed_at`'in gereksiz yere sık sık `now()`'a çekilmesi engellenir).
export const DEFAULT_RPC_TIMEOUT_MS = 25000; // R78: claim / heartbeat / settings / signIn (global.fetch varsayılanı)
export const DEFAULT_COMPLETE_TIMEOUT_MS = 10000; // R78: yalnız complete_print_job

/** R71: `baseFetch`'i (varsayılan: gerçek `fetch`) `AbortSignal.timeout(timeoutMs)` ile sarar —
 *  temel istek ne kadar sürerse sürsün (hatta hiç çözülmese bile), dönen söz `timeoutMs` içinde
 *  (reddederek) çözülür. Saf, `createSupabaseApi`'den bağımsız test edilebilir bir fonksiyon.
 *  M-a (round 5): çağıranın kendi `init.signal`'ı varsa (ör. postgrest-js'in
 *  `.abortSignal(AbortSignal.timeout(completeTimeoutMs))` ile taktığı ÇAĞRIYA ÖZGÜ, R78'in
 *  `complete` için kullandığı kısa sinyal) SESSİZCE ATILMAZ — `AbortSignal.any([...])` ile
 *  BİRLEŞTİRİLİR: hangisi önce dolarsa istek o an reddeder. Önceki hâl çağıranın kendi
 *  sinyalini görmezden geliyordu; bugün `realtime-js`'in `_fetchWithTimeout`'u ve postgrest'in
 *  `.abortSignal()`'ı bu yüzden sessizce devre dışı kalırdı (şu an erişilmiyor, ama sessiz bir
 *  tuzaktı) — R78'in kendisi de tam olarak bu birleştirmeye dayanıyor (bkz. `rpc()`).
 */
export function createTimeoutFetch(timeoutMs: number, baseFetch: typeof fetch = fetch): typeof fetch {
  return ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signal = init?.signal ? AbortSignal.any([init.signal, timeoutSignal]) : timeoutSignal;
    return baseFetch(input, { ...init, signal });
  }) as typeof fetch;
}

export interface SupabaseApiOptions {
  /** R78: `claim`/`heartbeat`/`settings`/`signIn` için istemci tarafı üst sınır (genel
   *  varsayılan, `global.fetch` ile TÜM isteklere uygulanır). Varsayılan 25 sn. */
  rpcTimeoutMs?: number;
  /** R78: yalnız `complete_print_job` için — `rpc()` bu çağrıya ayrıca `.abortSignal()` ile
   *  KISA bir sinyal takar (M-a sayesinde `rpcTimeoutMs`'in `global.fetch` sinyaliyle
   *  BİRLEŞİR, hangisi önce dolarsa o kazanır — pratikte bu her zaman daha kısa olanıdır).
   *  Varsayılan 10 sn. */
  completeTimeoutMs?: number;
  /** Yalnız testler için: gerçek `fetch`'in yerine geçecek temel uygulama. */
  baseFetch?: typeof fetch;
}

/**
 * Yazıcı kullanıcısıyla giriş yapar, `print-jobs` ve `settings` private kanallarını dinler.
 * R55: `claim`/`complete` bu çalıştırmaya özgü bir kimlik kullanır (`${AGENT_ID}#${başlangıç}`),
 * `agent_heartbeat` ise sade `AGENT_ID` gönderir — takılmış eski bir süreçle yeniden başlayan
 * süreç böylece birbirinin işini kapatamaz (ownership guard'ı devre dışı bırakmazlar).
 *
 * M-c (round 5): "her istek `rpcTimeoutMs` ile sınırlıdır" ifadesi yalnız POST (`claim`/
 * `complete`/`heartbeat`, hepsi `.rpc()` — postgrest-js bunları ASLA kendiliğinden yeniden
 * denemez) için doğrudur. `settings()` bir GET'tir (`.from().select()`); postgrest-js GET'leri
 * (503/520 ya da zaman aşımı hatasında) kendi içinde en fazla 3 KEZ DAHA dener, HER denemede
 * bizim sarmalayıcımız TAZE bir `AbortSignal.timeout()` üretir (postgrest'in kendi yeniden
 * deneme sinyali AYRI, bizim sarmalayıcımız her `fetchImpl` çağrısında yeni bir zaman aşımı
 * sinyali kurar) — bu yüzden `settings()` toplamda `rpcTimeoutMs`'in ~4 katına (varsayılanla
 * ~100 sn) kadar sürebilir. Bu YAVAŞLIK kabul edilebilir (kritik yol `claim`/`complete`'tir,
 * ikisi de POST); yalnız yorumun/raporun bunu DOĞRU yansıtması gerekiyordu (round-4 raporu
 * yanlış "her istek 10 sn ile sınırlı" diyordu).
 */
export async function createSupabaseApi(
  env: AgentEnv,
  log: Logger = consoleLogger,
  opts: SupabaseApiOptions = {},
): Promise<AgentApi> {
  const rpcTimeoutMs = opts.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
  const completeTimeoutMs = opts.completeTimeoutMs ?? DEFAULT_COMPLETE_TIMEOUT_MS;
  const sb: SupabaseClient<Database> = createClient<Database>(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: true },
    // R71/R78: TÜM istekler (auth, rpc, realtime REST) bu sarmalı fetch'ten geçer — bu,
    // `claim`/`heartbeat`/`settings`/`signIn` için GENEL (25 sn) üst sınırdır. `complete`,
    // `rpc()` içinde `.abortSignal()` ile AYRICA kısa (10 sn) bir sinyal takar (M-a sayesinde
    // ikisi `AbortSignal.any()` ile birleşir, kısa olan kazanır).
    global: { fetch: createTimeoutFetch(rpcTimeoutMs, opts.baseFetch) },
  });

  const runAgentId = `${env.AGENT_ID}#${Date.now()}`;
  const channels: RealtimeChannel[] = [];

  const signIn = async (): Promise<void> => {
    const { error } = await sb.auth.signInWithPassword({ email: env.AGENT_EMAIL, password: env.AGENT_PASSWORD });
    if (error) throw new Error(`Ajan girişi başarısız: ${error.message}`);
    await sb.realtime.setAuth();
  };
  await signIn();

  // R52: `claim`/`complete`/`heartbeat` `401` (oturum düşmüş) dönerse bir kez yeniden giriş
  // yapılır, sonra tekrar denenir — sonsuz döngüye girmemesi için yalnızca bir kez.
  // R78: isteğe bağlı `timeoutMs` verilirse (yalnız `complete_print_job`) çağrıya `.abortSignal()`
  // ile ÇAĞRIYA ÖZGÜ, kısa bir sinyal takılır — hem ilk denemede hem 401 sonrası yeniden denemede.
  async function rpc<T>(
    fn: string,
    args: Record<string, unknown>,
    timeoutMs?: number,
  ): Promise<{ data: T | null; error: { message: string } | null }> {
    const call = () => {
      const builder = sb.rpc(fn as never, args as never);
      return timeoutMs !== undefined ? builder.abortSignal(AbortSignal.timeout(timeoutMs)) : builder;
    };
    let res = await call();
    if (res.status === 401) {
      await signIn();
      res = await call();
    }
    return res as { data: T | null; error: { message: string } | null };
  }

  const api: AgentApi = {
    async claim(): Promise<Job | null> {
      const { data, error } = await rpc<PrintJobRow[]>('claim_print_job', { p_agent_id: runAgentId });
      if (error) throw new Error(`claim_print_job: ${error.message}`);
      const row = data?.[0];
      return row ? toJob(row) : null;
    },

    async complete(id: string, ok: boolean, error?: string): Promise<void> {
      // R78: yalnız BU çağrı kısa (varsayılan 10 sn) zaman aşımı alır — bkz. dosya başı yorumu.
      const res = await rpc(
        'complete_print_job',
        { p_job_id: id, p_ok: ok, p_error: error ?? null, p_agent_id: runAgentId },
        completeTimeoutMs,
      );
      if (res.error) {
        // Başka bir ajan işi geri almışsa complete_print_job `job_not_printing` fırlatır —
        // bu baskı hatası değildir, yalnızca loglanır ve döngü devam eder (R52/R55).
        if (res.error.message === 'job_not_printing') {
          log.warn('job_not_printing — iş başka bir ajan tarafından geri alınmış', { job: id });
          return;
        }
        throw new Error(`complete_print_job: ${res.error.message}`);
      }
    },

    async heartbeat(h: Heartbeat): Promise<void> {
      const { error } = await rpc('agent_heartbeat', {
        p_agent_id: env.AGENT_ID,
        p_version: AGENT_VERSION,
        p_host: os.hostname(),
        p_reachable: h.reachable,
        p_state: h.state,
        p_error: h.error,
      });
      if (error) throw new Error(`agent_heartbeat: ${error.message}`);
    },

    async settings(): Promise<AgentSettings> {
      const { data, error } = await sb
        .from('settings')
        .select('printer_host, printer_port, printer_codepage, printer_codepage_number, printer_transliterate')
        .eq('id', 1)
        .single();
      if (error) throw new Error(`settings: ${error.message}`);
      return {
        // Kurulum sihirbazının yazdığı yerel adres, sitedeki genel ayarın önüne geçer (config.ts).
        host: env.PRINTER_HOST ?? data.printer_host,
        port: env.PRINTER_PORT ?? data.printer_port,
        codepage: data.printer_codepage,
        codepageNumber: data.printer_codepage_number,
        transliterate: data.printer_transliterate,
      };
    },

    onJobs(cb: () => void): void {
      channels.push(
        sb
          .channel('print-jobs', { config: { private: true } })
          .on('broadcast', { event: '*' }, () => cb())
          .subscribe(),
      );
    },

    onSettings(cb: (s: AgentSettings) => void): void {
      channels.push(
        sb
          .channel('settings', { config: { private: true } })
          .on('broadcast', { event: '*' }, () => {
            void api.settings().then(cb).catch((e: unknown) => log.warn('settings yenilenemedi', { e: String(e) }));
          })
          .subscribe(),
      );
    },

    async close(): Promise<void> {
      for (const ch of channels) await sb.removeChannel(ch);
      channels.length = 0;
      await sb.auth.signOut();
    },
  };

  return api;
}
