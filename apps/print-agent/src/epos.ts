import http from 'node:http';
import https from 'node:https';
import { parseStatus, type PrinterState } from './status';
import { PrinterError } from './transport';

/**
 * Epson ePOS-Print (TM-m30III vb.): fiş, yazıcının kendi web servisine HTTP(S) POST ile gider — Epson
 * TM Utility'nin test fişi bastığı yol. TM-m30III bazı kurulumlarda ham 9100/9143 baskısına hiç cevap
 * vermez; bu yol o durumda çalışır. Aynı ESC/POS baytları XML zarfın içinde onaltılık yollanır
 * (ePOS-Print XML `<command>`; epson-sdp de aynı elemanı kullanır).
 *
 * Port kuralı (tablet istasyonu `PrinterClient.java` ve Ayarlar ile ortak): 443 → HTTPS, 80 → HTTP.
 * Yazıcının sertifikası kendinden imzalıdır: 9143'teki gibi yalnız yerel ağda doğrulanmadan kabul edilir
 * (`rejectUnauthorized: false`; transport.ts connectTls gerekçesi).
 *
 * Kurallar `printWithChecks` ile aynı: yanıt okunduysa yazıcının dediği geçerlidir (success / hata kodu +
 * ASB durumu). İstek tamamen yazıldıktan sonra yanıt hiç gelmezse "bayt gitti" → basılmış sayılır, durum
 * bilinmiyor (yanıt kaybı yüzünden çift fiş basılmasın). Yazma sırasındaki hata → iş gitmedi → hata.
 */

export const EPOS_HTTPS_PORT = 443;
export const EPOS_HTTP_PORT = 80;
export const EPOS_PATH = '/cgi-bin/epos/service.cgi';
export const EPOS_DEVID = 'local_printer';
const EPOS_NS = 'http://www.epson-pos.com/schemas/2011/03/epos-print';

export function isEposPort(port: number): boolean {
  return port === EPOS_HTTPS_PORT || port === EPOS_HTTP_PORT;
}

const hex = (bytes: Uint8Array): string => Buffer.from(bytes).toString('hex');

/** Fiş belgesi; `escpos` boşsa yalnız durum sorusu (yazıcı boş işe de durumla cevap verir). */
export function eposDocument(escpos: Uint8Array): string {
  const command = escpos.length > 0 ? `<command>${hex(escpos)}</command>` : '';
  return (
    '<?xml version="1.0" encoding="utf-8"?>' +
    '<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/"><s:Body>' +
    `<epos-print xmlns="${EPOS_NS}">${command}</epos-print>` +
    '</s:Body></s:Envelope>'
  );
}

export interface EposResponse {
  success: boolean;
  /** ePOS hata kodu (EPTR_COVER_OPEN, EPTR_REC_EMPTY, EX_TIMEOUT …); başarıda "". */
  code: string;
  /** `status` özniteliği (ASB, 32 bit); yoksa null. */
  asb: number | null;
}

/** `<response success="…" code="…" status="…"/>` ayrıştırma; eleman yoksa null (ePOS değil / kapalı). */
export function parseEposResponse(body: string): EposResponse | null {
  const el = /<(?:[A-Za-z0-9_]+:)?response\b([^>]*)>/.exec(body);
  if (!el?.[1]) return null;
  const attrs = new Map<string, string>();
  for (const m of el[1].matchAll(/([A-Za-z_]+)\s*=\s*"([^"]*)"/g)) attrs.set(m[1]!, m[2]!);
  const raw = attrs.get('status')?.trim() ?? '';
  const asb = /^\d+$/.test(raw) ? Number(raw) : null;
  return {
    success: attrs.get('success')?.toLowerCase() === 'true',
    code: attrs.get('code') ?? '',
    asb: asb !== null && Number.isSafeInteger(asb) ? asb : null,
  };
}

/**
 * ASB (ePOS `status`) → DLE EOT 1/2/4 biçiminde 3 bayt: `parseStatus` tek ayrıştırıcı olarak kalır.
 * Sabit bitler (0x12) gerçek DLE EOT cevabındaki gibi. ASB: 0x08 çevrimdışı, 0x20 kapak açık,
 * 0x400/0x800/0x2000/0x4000 mekanik/kesici/kurtarılamaz/otomatik kurtarılan hata, 0x20000 kağıt azaldı,
 * 0x80000 kağıt bitti. Java karşılığı: EposClient.asbToStatus.
 */
export function asbToStatusBytes(asb: number): Uint8Array {
  const offline = (asb & 0x08) !== 0;
  const cover = (asb & 0x20) !== 0;
  const error = (asb & (0x400 | 0x800 | 0x2000 | 0x4000)) !== 0;
  const nearEnd = (asb & 0x20000) !== 0;
  const end = (asb & 0x80000) !== 0;
  return Uint8Array.from([
    0x12 | (offline ? 0x08 : 0),
    0x12 | (cover ? 0x04 : 0) | (end ? 0x20 : 0) | (error ? 0x40 : 0),
    0x12 | (nearEnd ? 0x0c : 0) | (end ? 0x60 : 0),
  ]);
}

export function asbToState(asb: number | null): PrinterState {
  return parseStatus(asb === null ? new Uint8Array() : asbToStatusBytes(asb));
}

/** ePOS hata kodu → `PrinterError.code`. */
export function eposErrorCode(code: string): PrinterError['code'] {
  switch (code) {
    case 'EPTR_REC_EMPTY':
      return 'paper_end';
    case 'EPTR_COVER_OPEN':
      return 'cover_open';
    case 'EX_TIMEOUT':
      return 'timeout';
    case 'DeviceNotFound':
    case 'EX_BADPORT':
    case 'PrintSystemError':
    case 'EX_SPOOLER':
      return 'offline';
    default:
      // EPTR_MECHANICAL, EPTR_CUTTER, EPTR_UNRECOVERABLE, Printing, TooManyRequests, SchemaError … →
      // sunucu geri çekilmeyle yeniden dener.
      return 'io';
  }
}

export interface EposOptions {
  connectMs?: number;
  /** Yanıt için toplam bekleme; yazıcıya verilen iş süresi bundan 2 sn kısadır (önce o cevap versin). */
  timeoutMs?: number;
  /** Yalnız testler: 443 dışındaki bir portta da HTTPS'i zorlar ya da 443'te düz HTTP kullanır. */
  tls?: boolean;
}

export class EposNoResponseError extends Error {}

/**
 * HTTP(S) POST. Çözülen değer HTTP durumu + gövde. İstek tamamen yazıldıktan sonra yanıt gelmezse
 * `EposNoResponseError`; yazma öncesi/sırası hata → `PrinterError('offline' | 'io')`.
 */
export function eposRequest(
  host: string,
  port: number,
  body: string,
  { connectMs = 3000, timeoutMs = 10000, tls: tlsFlag }: EposOptions = {},
): Promise<{ status: number; body: string }> {
  const tls = tlsFlag ?? port === EPOS_HTTPS_PORT;
  const printerTimeout = Math.max(3000, timeoutMs - 2000);
  const payload = Buffer.from(body, 'utf8');
  const options: https.RequestOptions = {
    host,
    port,
    method: 'POST',
    path: `${EPOS_PATH}?devid=${EPOS_DEVID}&timeout=${printerTimeout}`,
    headers: {
      'Content-Type': 'text/xml; charset=utf-8',
      SOAPAction: '""',
      'Content-Length': payload.length,
      Connection: 'close',
    },
    ...(tls ? { rejectUnauthorized: false, minVersion: 'TLSv1.2' as const } : {}),
  };
  return new Promise((resolve, reject) => {
    let sent = false;
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      fn();
    };
    const req = (tls ? https : http).request(options, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (d: Buffer) => chunks.push(d));
      res.on('end', () =>
        finish(() => resolve({ status: res.statusCode ?? 0, body: Buffer.concat(chunks).toString('utf8') })),
      );
      res.on('error', () => finish(() => reject(new EposNoResponseError('yanıt yarım kaldı'))));
    });
    const connectTimer = setTimeout(() => {
      if (!req.socket || req.socket.connecting) {
        req.destroy();
        finish(() => reject(new PrinterError('offline', 'connect timeout')));
      }
    }, connectMs);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      finish(() =>
        reject(sent ? new EposNoResponseError('yanıt zaman aşımı') : new PrinterError('timeout', 'send timed out')),
      );
    });
    req.on('finish', () => {
      sent = true;
    });
    req.on('error', (e) => {
      clearTimeout(connectTimer);
      finish(() =>
        reject(sent ? new EposNoResponseError(`yanıt okunamadı: ${e.message}`) : new PrinterError('offline', e.message)),
      );
    });
    req.on('response', () => clearTimeout(connectTimer));
    req.end(payload);
  });
}

function interpret(res: { status: number; body: string }): EposResponse {
  if (res.status !== 200) throw new PrinterError('io', `epos: HTTP ${res.status} — ePOS-Print kapalı ya da yanlış cihaz`);
  const parsed = parseEposResponse(res.body);
  if (!parsed) throw new PrinterError('io', 'epos: ePOS yanıtı yok (ePOS-Print kapalı ya da bu bir Epson değil)');
  return parsed;
}

/**
 * Baskı. `printWithChecks` ile aynı dönüş biçimi: ePOS'ta ayrı ön durum sorusu yoktur (yazıcı engel
 * varsa işi kendisi reddeder), o yüzden `before` ve `after` aynı yanıt durumudur.
 */
export async function eposPrint(
  host: string,
  port: number,
  bytes: Uint8Array,
  opts: EposOptions = {},
): Promise<{ before: PrinterState; after: PrinterState }> {
  let res: { status: number; body: string };
  try {
    res = await eposRequest(host, port, eposDocument(bytes), opts);
  } catch (e) {
    // Bayt gitti, yanıt yok: basılmış sayılır (ham yolla aynı kural), durum bilinmiyor.
    if (e instanceof EposNoResponseError) {
      const unknown = asbToState(null);
      return { before: unknown, after: unknown };
    }
    throw e;
  }
  const r = interpret(res);
  const state = asbToState(r.asb);
  if (!r.success) throw new PrinterError(eposErrorCode(r.code), `epos: ${r.code}`);
  return { before: state, after: state };
}

/** Durum sorusu: boş belge. Yanıt hata koduyla gelse de (kapak/kağıt) durum baytları döner. */
export async function eposStatus(host: string, port: number, opts: EposOptions = {}): Promise<PrinterState> {
  let res: { status: number; body: string };
  try {
    res = await eposRequest(host, port, eposDocument(new Uint8Array()), opts);
  } catch (e) {
    if (e instanceof EposNoResponseError) throw new PrinterError('offline', `epos: ${e.message}`);
    throw e;
  }
  return asbToState(interpret(res).asb);
}
