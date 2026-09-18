// station-feed — saf mantık: yerel Android uygulamasının arka plan yazıcı servisi için iş akışı.
// Deno'ya bağımlılığı yoktur; Node + Vitest ile test edilir (npm run fn:test).
//
// Servis kullanıcı oturumu taşıyamaz: her cihazın kendi anahtarı vardır (`register_station_device`, 0015).
// Kimlik `x-station-token` başlığındaki anahtarın sha256 özetiyle doğrulanır; düz anahtar DB'ye hiç gitmez.
//
// Sözleşme (yerel servis buna göre kodlanır — değiştirme):
//   POST, JSON gövde, başlık `x-station-token: <64 küçük harf hex>`.
//   {"action":"next","waitMs"?:n}            → 200 {"job":{"id","data":<base64 ESC/POS>}|null,"printer":{"host","port"},"route"}
//   {"action":"complete","jobId","ok","error"?} → 200 {"result":"ok"|"job_not_found"|"job_not_printing"}
//   {"action":"heartbeat","version","reachable","state"?,"error"?} → 200 {"result":"ok"}
//   401 {"error":"unauthorized"} · 400 {"error":"bad_request"} · 405 {"error":"method_not_allowed"} · 500 {"error":"server_error"}

/** `register_station_device` 32 rastgele baytı küçük harf hex yazar. */
export const TOKEN_RE = /^[0-9a-f]{64}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Gövdeler küçüktür (en büyüğü heartbeat'in durum nesnesi); fazlası kötü istek sayılır. */
export const MAX_BODY_BYTES = 16 * 1024;
export const DEFAULT_WAIT_MS = 20_000;
export const MAX_WAIT_MS = 25_000;
/** Rota 'station' ve yazıcı adresi doluyken iş yoklama aralığı. */
export const POLL_MS = 1_000;
/** Rota başka bir yoldayken (ya da yazıcı adresi boşken) yoklama aralığı: iş gelmez, DB boşuna yorulmaz. */
export const IDLE_POLL_MS = 5_000;

export interface PrintSettings {
  codepage: string;
  codepageNumber: number;
  transliterate: boolean;
}

export interface PrinterTarget {
  host: string | null;
  port: number;
}

export interface FeedJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

/** `public.station_feed_claim` dönüşü. */
export interface ClaimResult {
  device: 'ok' | 'unknown';
  route?: string;
  printer?: PrinterTarget;
  settings?: Partial<PrintSettings>;
  job: FeedJob | null;
}

export interface HeartbeatInput {
  version: string;
  reachable: boolean;
  state: Record<string, unknown> | null;
  error: string | null;
}

export interface FeedDeps {
  claim(tokenHash: string): Promise<ClaimResult>;
  /** `public.station_feed_complete` → 'ok' | 'unknown' | 'job_not_found' | 'job_not_printing'. */
  complete(tokenHash: string, jobId: string, ok: boolean, error: string | null): Promise<string>;
  /** `public.station_feed_heartbeat` → 'ok' | 'unknown'. */
  heartbeat(tokenHash: string, input: HeartbeatInput): Promise<string>;
  /** Fiş payload'ı → ESC/POS baytları (epson-sdp/render.ts: ajanla aynı renderTicket + encodeLines). */
  render(payload: Record<string, unknown>, settings: PrintSettings): Uint8Array;
  log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

// ---------- küçük yardımcılar ----------

export async function sha256Hex(text: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
  let out = '';
  for (const b of digest) out += b.toString(16).padStart(2, '0');
  return out;
}

/** Bayt → base64 (Deno'da Buffer yok; btoa ikili dize ister, yığın taşmasın diye parça parça). */
export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** Ayar eksikse web istasyonunun (`stationLogic.stationPrinterConfig`) varsayılanları. */
export function printSettings(s: Partial<PrintSettings> | undefined): PrintSettings {
  return {
    codepage: s?.codepage ?? 'cp857',
    codepageNumber: s?.codepageNumber ?? 61,
    transliterate: s?.transliterate ?? false,
  };
}

export function clampWaitMs(v: unknown): number | null {
  if (v === undefined || v === null) return DEFAULT_WAIT_MS;
  if (typeof v !== 'number' || !Number.isFinite(v)) return null;
  return Math.min(MAX_WAIT_MS, Math.max(0, Math.floor(v)));
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const errorCode = (e: unknown) => (e instanceof Error ? e.message : String(e));

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
const unauthorized = () => json(401, { error: 'unauthorized' });
const badRequest = () => json(400, { error: 'bad_request' });

// ---------- istek işleyici ----------

export async function handleFeedRequest(req: Request, deps: FeedDeps): Promise<Response> {
  if (req.method !== 'POST') return json(405, { error: 'method_not_allowed' }, { Allow: 'POST' });

  // Biçimi tutmayan anahtar DB'ye hiç gitmez.
  const token = req.headers.get('x-station-token') ?? '';
  if (!TOKEN_RE.test(token)) return unauthorized();
  const tokenHash = await sha256Hex(token);

  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return badRequest();
  let body: unknown;
  try {
    const raw = new Uint8Array(await req.arrayBuffer());
    if (raw.byteLength > MAX_BODY_BYTES) return badRequest();
    body = JSON.parse(new TextDecoder().decode(raw));
  } catch {
    return badRequest();
  }
  if (!isObject(body)) return badRequest();

  try {
    switch (body.action) {
      case 'next':
        return await next(tokenHash, body, req.signal, deps);
      case 'complete':
        return await complete(tokenHash, body, deps);
      case 'heartbeat':
        return await heartbeat(tokenHash, body, deps);
      default:
        return badRequest();
    }
  } catch (e) {
    // Anahtar, özet ve fiş içeriği asla loglanmaz; yalnız eylem ve RPC hata kodu.
    deps.log('error', 'station_feed_failed', { action: String(body.action), error: errorCode(e) });
    return json(500, { error: 'server_error' });
  }
}

/**
 * Uzun yoklama: iş gelene ya da `waitMs` dolana kadar ~1 sn arayla sahiplenmeyi dener. İş kodlanamazsa
 * başarısız kapatılır (sunucu geri çeker) ve sıradakine geçilir. İstemci bağlantıyı kopardıysa yeni iş
 * sahiplenilmez (alınan iş kimseye gitmeden 60 sn takılı kalırdı).
 */
async function next(tokenHash: string, body: Record<string, unknown>, signal: AbortSignal | undefined,
                    deps: FeedDeps): Promise<Response> {
  const waitMs = clampWaitMs(body.waitMs);
  if (waitMs === null) return badRequest();
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const deadline = now() + waitMs;

  for (;;) {
    const claim = await deps.claim(tokenHash);
    if (claim.device !== 'ok') return unauthorized();
    const printer: PrinterTarget = { host: claim.printer?.host ?? null, port: claim.printer?.port ?? 9100 };
    const route = claim.route ?? null;

    if (claim.job) {
      const job = claim.job;
      let bytes: Uint8Array;
      try {
        bytes = deps.render(job.payload, printSettings(claim.settings));
      } catch (e) {
        // Kodlama hatası yazıcı sorunu değildir: iş başarısız sayılır (geri çekilme), sıradakine geçilir.
        deps.log('error', 'station_feed_encode_error', { job: job.id });
        await deps.complete(tokenHash, job.id, false, `encode_error: ${errorCode(e)}`);
        continue;
      }
      deps.log('info', 'station_feed_job_sent', { job: job.id });
      return json(200, { job: { id: job.id, data: bytesToBase64(bytes) }, printer, route });
    }

    const remaining = deadline - now();
    if (remaining <= 0 || signal?.aborted) return json(200, { job: null, printer, route });
    const interval = route === 'station' && printer.host ? POLL_MS : IDLE_POLL_MS;
    await sleep(Math.min(interval, remaining));
    if (signal?.aborted) return json(200, { job: null, printer, route });
  }
}

async function complete(tokenHash: string, body: Record<string, unknown>, deps: FeedDeps): Promise<Response> {
  const { jobId, ok, error } = body;
  if (typeof jobId !== 'string' || !UUID_RE.test(jobId) || typeof ok !== 'boolean') return badRequest();
  if (error !== undefined && error !== null && typeof error !== 'string') return badRequest();
  const result = await deps.complete(tokenHash, jobId.toLowerCase(), ok, error ?? null);
  if (result === 'unknown') return unauthorized();
  if (result !== 'ok') deps.log('warn', 'station_feed_complete_rejected', { job: jobId, result });
  return json(200, { result });
}

async function heartbeat(tokenHash: string, body: Record<string, unknown>, deps: FeedDeps): Promise<Response> {
  const { version, reachable, state, error } = body;
  if (typeof version !== 'string' || typeof reachable !== 'boolean') return badRequest();
  if (state !== undefined && state !== null && !isObject(state)) return badRequest();
  if (error !== undefined && error !== null && typeof error !== 'string') return badRequest();
  const result = await deps.heartbeat(tokenHash, {
    version,
    reachable,
    state: state ?? null,
    error: error ?? null,
  });
  if (result === 'unknown') return unauthorized();
  return json(200, { result });
}
