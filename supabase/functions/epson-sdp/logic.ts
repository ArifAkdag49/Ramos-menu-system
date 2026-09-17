// epson-sdp — saf mantık: Epson Server Direct Print (SDP) protokolü.
// Deno'ya bağımlılığı yoktur; Node + Vitest ile test edilir (npm run fn:test). Protokol kaynakları ve
// belirsizlikler: docs/epson-server-direct-print.md.
//
// Akış: yazıcı `ConnectionType=GetRequest` POST'u atar → sıradaki işleri ePOS-Print XML içinde döneriz
// (iş yoksa boş gövde) → yazıcı basar ve `ConnectionType=SetResponse&ResponseFile=<PrintResponseInfo…>`
// ile sonucu bildirir → her printjobid için kuyruk kaydı kapatılır.

/** Yazıcının göndereceği en büyük gövde. SetResponse birkaç iş sonucu taşır; 256 KB fazlasıyla yeter. */
export const MAX_BODY_BYTES = 256 * 1024;
/** `create_sdp_printer` 32 rastgele baytı küçük harf hex yazar. */
export const TOKEN_RE = /^[0-9a-f]{64}$/;

const XML_CONTENT_TYPE = 'text/xml; charset=utf-8';
const EPOS_PRINT_NS = 'http://www.epson-pos.com/schemas/2011/03/epos-print';

export interface PrintSettings {
  codepage: string;
  codepageNumber: number;
  transliterate?: boolean;
}

export interface SdpJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
}

/** `public.sdp_claim_next` dönüşü. */
export interface ClaimResult {
  printer: 'ok' | 'unknown' | 'inactive';
  jobs: SdpJob[];
  settings?: PrintSettings;
}

export interface SdpDeps {
  claimNext(tokenHash: string): Promise<ClaimResult>;
  /** `public.sdp_complete` → 'ok' | 'unknown' | 'inactive' | 'job_not_found' | 'job_not_printing'. */
  complete(tokenHash: string, jobId: string, success: boolean, error: string | null): Promise<string>;
  /** Fiş payload'ı → ESC/POS baytları (render.ts: ajanla aynı renderTicket + encodeLines). */
  render(payload: Record<string, unknown>, settings: Required<PrintSettings>): Uint8Array;
  log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void;
}

// ---------- küçük yardımcılar ----------

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return bytesToHex(new Uint8Array(digest));
}

export function bytesToHex(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b.toString(16).padStart(2, '0');
  return out;
}

export function escapeXml(s: string): string {
  return s.replace(/[<>&"']/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!);
}

const PRINT_JOB_ID_LEN = 25; // 2^128 base36'da en çok 25 hane
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Epson `printjobid`: 1–30 alfanümerik karakter. UUID (36 karakter, tire) sığmaz; 128 bitlik değer
 * base36'da 25 haneye sabitlenir ve SetResponse'ta geri çözülür — ek bir eşleme tablosu gerekmez.
 */
export function jobIdToPrintJobId(uuid: string): string {
  if (!UUID_RE.test(uuid)) throw new Error(`geçersiz iş kimliği: ${uuid}`);
  return BigInt(`0x${uuid.replace(/-/g, '')}`).toString(36).padStart(PRINT_JOB_ID_LEN, '0');
}

export function printJobIdToJobId(printJobId: string): string | null {
  if (!/^[0-9a-z]{25}$/.test(printJobId)) return null;
  let n = 0n;
  for (const ch of printJobId) n = n * 36n + BigInt(parseInt(ch, 36));
  if (n >= 1n << 128n) return null;
  const hex = n.toString(16).padStart(32, '0');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Kod sayfası: ADI ayarlardan gelir, `ESC t` NUMARASI Epson tablosundan. Ayarlardaki numara Xprinter
 * için olabilir (cp857=61, windows1254=91) ve Epson'da başka bir tabloyu seçer. Bilinmeyen ad →
 * Epson TM-m30III varsayılanı WPC1254 (48): Türkçe + Almanca harfler ve € tek tabloda.
 * Numaralar packages/shared/src/escpos.ts CODEPAGE_TABLE ile aynı (Epson sütunu).
 */
const EPSON_CODEPAGE_NUMBER: Record<string, number> = {
  cp437: 0,
  windows1252: 16,
  cp858: 19,
  cp857: 13,
  windows1254: 48,
};

export function epsonCodepage(s: Pick<PrintSettings, 'codepage' | 'codepageNumber'> | undefined): {
  codepage: string;
  codepageNumber: number;
} {
  const n = s ? EPSON_CODEPAGE_NUMBER[s.codepage] : undefined;
  return n === undefined ? { codepage: 'windows1254', codepageNumber: 48 } : { codepage: s!.codepage, codepageNumber: n };
}

// ---------- XML üretimi ----------

/**
 * Yanıt (print request), `<PrintRequestInfo Version="2.00">`: printjobid'li sürüm; yazıcı sonucu
 * `<PrintResponseInfo Version="2.00">` içinde printjobid ile geri bildirir. Fiş, ajanın bastığı ESC/POS
 * baytlarının aynısıdır ve `<command>` (hex) elemanıyla gider — Türkçe harfler için kod sayfası
 * `ESC t` ile baytların içinde seçilir, ePOS `<text>` dil kısıtlarına takılmaz.
 */
export function buildPrintRequestXml(
  jobs: { jobId: string; bytes: Uint8Array }[],
  opts: { devid?: string; timeoutMs?: number } = {},
): string {
  const devid = escapeXml(opts.devid ?? 'local_printer');
  const timeout = opts.timeoutMs ?? 60000;
  const blocks = jobs.map(
    (j) => `  <ePOSPrint>
    <Parameter>
      <devid>${devid}</devid>
      <timeout>${timeout}</timeout>
      <printjobid>${jobIdToPrintJobId(j.jobId)}</printjobid>
    </Parameter>
    <PrintData>
      <epos-print xmlns="${EPOS_PRINT_NS}">
        <command>${bytesToHex(j.bytes)}</command>
      </epos-print>
    </PrintData>
  </ePOSPrint>
`,
  );
  return `<?xml version="1.0" encoding="utf-8"?>\n<PrintRequestInfo Version="2.00">\n${blocks.join('')}</PrintRequestInfo>\n`;
}

// ---------- XML ayrıştırma (dış girdi) ----------
// Deno Edge'de DOMParser yok; tam bir XML ayrıştırıcı da gerekmiyor. Yalnız bilinen birkaç eleman,
// sınırlı boyutta (MAX_BODY_BYTES) ve geri izlemesi doğrusal kalan düzenli ifadelerle okunur.
// Varlıklar (entity) çözülmez; beklenen değerler (printjobid, success, code) alfanümeriktir.

export interface PrintResult {
  printJobId: string;
  success: boolean;
  code: string;
}

function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)')`).exec(attrs);
  return m ? (m[2] ?? m[3] ?? '') : null;
}

function textOf(xml: string, tag: string): string | null {
  const m = new RegExp(`<${tag}\\b[^>]*>([^<]*)</${tag}\\s*>`).exec(xml);
  return m ? m[1]!.trim() : null;
}

export function parsePrintResponse(xml: string): { results: PrintResult[]; serverError: string | null } {
  const results: PrintResult[] = [];
  const text = xml.slice(0, MAX_BODY_BYTES);
  for (const m of text.matchAll(/<ePOSPrint\b[^>]*>([\s\S]*?)<\/ePOSPrint\s*>/g)) {
    const block = m[1]!;
    const printJobId = textOf(block, 'printjobid');
    if (!printJobId) continue;
    const resp = /<response\b([^>]*)>/.exec(block);
    if (!resp) {
      results.push({ printJobId, success: false, code: 'no_response' });
      continue;
    }
    const success = attr(resp[1]!, 'success');
    results.push({ printJobId, success: success === 'true' || success === '1', code: attr(resp[1]!, 'code') ?? '' });
  }

  let serverError: string | null = null;
  const sdp = /<ServerDirectPrint\b[^>]*>([\s\S]*?)<\/ServerDirectPrint\s*>/.exec(text);
  if (sdp) {
    const r = /<Response\b([^>]*)>/.exec(sdp[1]!);
    if (r && attr(r[1]!, 'Success') === 'false') {
      serverError = [textOf(sdp[1]!, 'ErrorSummary'), textOf(sdp[1]!, 'ErrorDetail')].filter(Boolean).join(': ') || 'unknown';
    }
  }
  return { results, serverError };
}

/**
 * Yazıcının form gövdesi (application/x-www-form-urlencoded). Web Config'te "URL Encode" kapalıysa
 * ResponseFile ham XML olarak gelir ve içindeki `&`/`%` form ayrıştırmasını bozar; bu durumda
 * (değer kodlanmamış `<` içeriyorsa) ResponseFile gövdenin geri kalanı sayılır.
 */
export function parseForm(body: string): { connectionType: string; id: string; name: string; responseFile: string } {
  const params = new URLSearchParams(body);
  let responseFile = params.get('ResponseFile') ?? '';
  const at = body.indexOf('ResponseFile=');
  if (at >= 0 && body.slice(at + 'ResponseFile='.length).includes('<')) {
    responseFile = body.slice(at + 'ResponseFile='.length);
  }
  const head = at >= 0 ? new URLSearchParams(body.slice(0, at)) : params;
  return {
    connectionType: head.get('ConnectionType') ?? '',
    id: head.get('ID') ?? '',
    name: head.get('Name') ?? '',
    responseFile,
  };
}

// ---------- istek işleyici ----------

const empty = (status = 200) => new Response(null, { status, headers: { 'Content-Type': XML_CONTENT_TYPE } });
const plain = (status: number, text: string, headers: Record<string, string> = {}) =>
  new Response(text, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', ...headers } });

export async function handleSdpRequest(req: Request, deps: SdpDeps): Promise<Response> {
  if (req.method !== 'POST') return plain(405, 'method_not_allowed', { Allow: 'POST' });

  const declared = Number(req.headers.get('Content-Length') ?? '0');
  if (Number.isFinite(declared) && declared > MAX_BODY_BYTES) return plain(413, 'payload_too_large');
  const raw = new Uint8Array(await req.arrayBuffer());
  if (raw.byteLength > MAX_BODY_BYTES) return plain(413, 'payload_too_large');
  const form = parseForm(new TextDecoder().decode(raw));

  // Anahtar URL'de (?t=…) ya da Web Config "ID" alanında. Biçimi tutmayan anahtar DB'ye hiç gitmez.
  const urlToken = new URL(req.url).searchParams.get('t') ?? '';
  const token = urlToken || form.id;
  if (!TOKEN_RE.test(token)) return plain(401, 'unauthorized');
  const tokenHash = await sha256Hex(token);

  try {
    if (form.connectionType === 'GetRequest') return await getRequest(tokenHash, deps);
    if (form.connectionType === 'SetResponse') return await setResponse(tokenHash, form.responseFile, deps);
    // Durum bildirimi (Status Notification) vb.: bu uç noktada kullanılmıyor, boş yanıt yeterli.
    return empty();
  } catch (e) {
    deps.log('error', 'sdp_failed', { connectionType: form.connectionType, error: e instanceof Error ? e.message : String(e) });
    return plain(500, 'server_error');
  }
}

async function getRequest(tokenHash: string, deps: SdpDeps): Promise<Response> {
  const claim = await deps.claimNext(tokenHash);
  if (claim.printer === 'unknown') return plain(401, 'unauthorized');
  if (claim.printer === 'inactive') return plain(403, 'printer_inactive');
  if (claim.jobs.length === 0) return empty();

  const settings = { ...epsonCodepage(claim.settings), transliterate: claim.settings?.transliterate ?? false };
  const encoded: { jobId: string; bytes: Uint8Array }[] = [];
  for (const job of claim.jobs) {
    try {
      encoded.push({ jobId: job.id, bytes: deps.render(job.payload, settings) });
    } catch (e) {
      // Kodlama hatası yazıcı sorunu değildir: iş başarısız sayılır (geri çekilme), diğerleri basılır.
      const msg = `encode_error: ${e instanceof Error ? e.message : String(e)}`;
      deps.log('error', 'sdp_encode_error', { job: job.id, msg });
      await deps.complete(tokenHash, job.id, false, msg);
    }
  }
  if (encoded.length === 0) return empty();
  deps.log('info', 'sdp_jobs_sent', { jobs: encoded.map((j) => j.jobId) });
  return new Response(buildPrintRequestXml(encoded), { status: 200, headers: { 'Content-Type': XML_CONTENT_TYPE } });
}

async function setResponse(tokenHash: string, responseFile: string, deps: SdpDeps): Promise<Response> {
  const { results, serverError } = parsePrintResponse(responseFile);
  if (serverError) deps.log('warn', 'sdp_response_error', { error: serverError });
  // Sonuç yoksa DB'ye gidilmez: anahtarı doğrulamak için sdp_claim_next çağırmak iş SAHİPLENİRDİ.
  for (const r of results) {
    const jobId = printJobIdToJobId(r.printJobId);
    if (!jobId) {
      deps.log('warn', 'sdp_unknown_printjobid', { printJobId: r.printJobId });
      continue;
    }
    const outcome = await deps.complete(tokenHash, jobId, r.success, r.success ? null : r.code || 'print_failed');
    if (outcome === 'unknown') return plain(401, 'unauthorized');
    if (outcome === 'inactive') return plain(403, 'printer_inactive');
    if (outcome !== 'ok') deps.log('warn', 'sdp_complete_rejected', { job: jobId, outcome });
  }
  return empty();
}
