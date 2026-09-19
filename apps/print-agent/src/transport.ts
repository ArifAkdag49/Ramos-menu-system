import net from 'node:net';
import tls from 'node:tls';
import { eposPrint, eposStatus, isEposPort } from './epos';
import { blockingProblem, parseStatus, type PrinterState } from './status';

export class PrinterError extends Error {
  constructor(
    public code: 'offline' | 'timeout' | 'io' | 'cover_open' | 'paper_end',
    msg?: string,
  ) {
    super(msg ?? code);
  }
}

// DLE EOT n for n = 1 (printer status), 2 (off-line status), 4 (paper sensor status).
const STATUS_QUERY = Uint8Array.from([0x10, 0x04, 0x01, 0x10, 0x04, 0x02, 0x10, 0x04, 0x04]);

/**
 * Epson "Secure Printing" (TM-m30III gibi Avrupa/RED modellerinde fabrikadan açık): şifresiz
 * TCP 9100 RAW baskı reddedilir ya da sessizce atılır; aynı ESC/POS baytları TLS ile 9143'ten
 * basılır. Kural sade: port 9143 ise bağlantı TLS'tir, başka her port düz TCP.
 *
 * Port 443 / 80 ise yol bambaşkadır: Epson ePOS-Print (yazıcının web servisi, `./epos`). TM-m30III
 * bazı kurulumlarda 9100'e de 9143'e de hiç cevap vermez; ePOS-Print o durumda çalışır. Kural
 * tablet istasyonu (PrinterClient.java) ve Ayarlar'daki "Yazıcı türü" ile ortaktır.
 */
export const EPSON_TLS_PORT = 9143;

export interface TransportOptions {
  connectMs?: number;
  /**
   * Yalnız testler için: 9143 dışındaki bir portta da TLS'i zorlar (sahte TLS yazıcı rastgele
   * portta dinler). Üretim kodu bunu vermez; orada kural "9143 → TLS" olarak kalır.
   */
  tls?: boolean;
}

export function usesTls(port: number, tlsFlag?: boolean): boolean {
  return tlsFlag === true || port === EPSON_TLS_PORT;
}

function connectPlain(host: string, port: number, connectMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host, port });
    const t = setTimeout(() => {
      s.destroy();
      reject(new PrinterError('offline', 'connect timeout'));
    }, connectMs);
    s.once('connect', () => {
      clearTimeout(t);
      resolve(s);
    });
    s.once('error', (e) => {
      clearTimeout(t);
      reject(new PrinterError('offline', e.message));
    });
  });
}

// TLS bağlantısı: zaman aşımı TCP bağlantısı + el sıkışmanın TAMAMINI kapsar ('secureConnect').
// `rejectUnauthorized: false` bilinçli: yazıcının sertifikası yazıcının kendi ürettiği, kendinden
// imzalı bir sertifikadır (bir CA zinciri yoktur, adı da IP adresidir), bağlantı yalnız restoranın
// yerel ağında kurulur. Şifreleme yazıcının şifresiz baskıyı reddetmesini aşmak için gereklidir;
// sunucu kimliği doğrulanmaz. İleride yazıcının sertifika parmak izi ilk kurulumda .env'e yazılıp
// sabitlenebilir (pinning). TLS 1.2 altı kabul edilmez.
// `tls.TLSSocket` `net.Socket`'ten türer: yazma, DLE EOT durum okuma ve boşta kalma zaman aşımı
// aşağıda aynı kodla çalışır.
function connectTls(host: string, port: number, connectMs: number): Promise<net.Socket> {
  return new Promise((resolve, reject) => {
    const s = tls.connect({ host, port, rejectUnauthorized: false, minVersion: 'TLSv1.2' });
    const t = setTimeout(() => {
      s.destroy();
      reject(new PrinterError('offline', 'tls: connect timeout'));
    }, connectMs);
    s.once('secureConnect', () => {
      clearTimeout(t);
      resolve(s);
    });
    s.once('error', (e) => {
      clearTimeout(t);
      s.destroy();
      reject(new PrinterError('offline', `tls: ${e.message}`));
    });
  });
}

function connect(host: string, port: number, { connectMs = 3000, tls: tlsFlag }: TransportOptions): Promise<net.Socket> {
  return usesTls(port, tlsFlag) ? connectTls(host, port, connectMs) : connectPlain(host, port, connectMs);
}

// Sends the DLE EOT status query on an already-connected socket and resolves with
// whatever came back within `replyMs` — never rejects. A missing/short/garbled
// reply (including one cut short by the peer resetting the connection) is simply
// "unknown" (BUILD-PROMPT §6: unknown must never block printing), which is why
// this deliberately has no 'error' handling: an error here just means fewer bytes
// arrive before the timer fires, same as a printer that stays silent.
function readStatus(s: net.Socket, replyMs: number): Promise<PrinterState> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const onData = (d: Buffer) => {
      chunks.push(d);
      if (Buffer.concat(chunks).length >= 3) finish();
    };
    const finish = () => {
      clearTimeout(t);
      s.off('data', onData);
      resolve(parseStatus(new Uint8Array(Buffer.concat(chunks))));
    };
    const t = setTimeout(finish, replyMs);
    s.on('data', onData);
    s.write(STATUS_QUERY);
  });
}

// Writes `bytes` on an already-connected socket. Bounded by an *idle* timeout
// (Critical 2, Görev 18 review): `socket.setTimeout` fires only after `sendMs` of
// silence in either direction, so a printer that accepts the connection and then
// never reads/replies/closes can no longer hang the agent forever — the socket is
// destroyed and the promise rejected instead. Every 'error' for the lifetime of
// this promise rejects it (Important 3, review): a connection reset must fail the
// job, never resolve as if it had printed.
//
// `mode: 'end'` (used by the standalone `sendBytes`) sends the bytes *and* FIN,
// and only resolves on 'close' — a real signal that the peer is done with the
// connection, not just that our own kernel accepted the write. `mode: 'write'`
// (used by `printWithChecks`, Important 5) keeps the connection open so the same
// socket can carry the post-send status query afterwards, and resolves as soon as
// the write callback fires.
function sendAndAwait(s: net.Socket, bytes: Uint8Array, sendMs: number, mode: 'end' | 'write'): Promise<void> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const cleanup = () => {
      s.setTimeout(0);
      s.off('timeout', onTimeout);
      s.off('error', onError);
      if (mode === 'end') s.off('close', onClose);
    };
    const finish = (err?: Error) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (err) reject(err);
      else resolve();
    };
    const onTimeout = () => {
      s.destroy();
      finish(new PrinterError('timeout', 'send timed out (yazıcıdan hiç yanıt/aktivite yok)'));
    };
    const onError = (e: Error) => finish(new PrinterError('io', e.message));
    const onClose = () => finish();

    s.setTimeout(sendMs);
    s.on('timeout', onTimeout);
    s.on('error', onError);

    if (mode === 'end') {
      s.on('close', onClose);
      s.end(bytes);
    } else {
      s.write(bytes, (err) => {
        if (err) finish(new PrinterError('io', err.message));
        else finish();
      });
    }
  });
}

// BUILD-PROMPT §5: TCP connect timeout 3s, status reply timeout 1s.
export async function queryStatus(
  host: string,
  port: number,
  { connectMs = 3000, replyMs = 1000, tls: tlsFlag }: TransportOptions & { replyMs?: number } = {},
): Promise<PrinterState> {
  if (isEposPort(port)) return eposStatus(host, port, { connectMs, timeoutMs: connectMs + replyMs + 2000 });
  const s = await connect(host, port, { connectMs, tls: tlsFlag });
  try {
    return await readStatus(s, replyMs);
  } finally {
    s.destroy();
  }
}

export async function sendBytes(
  host: string,
  port: number,
  bytes: Uint8Array,
  { connectMs = 3000, sendMs = 5000, tls: tlsFlag }: TransportOptions & { sendMs?: number } = {},
): Promise<void> {
  const s = await connect(host, port, { connectMs, tls: tlsFlag });
  try {
    await sendAndAwait(s, bytes, sendMs, 'end');
  } finally {
    s.destroy();
  }
}

// "Yazıldı ≠ basıldı": query status before sending (refuse on a blocking problem,
// without sending), send, then query again — a failed/short post-send query never
// turns an already-sent job into a failure (BUILD-PROMPT §6).
//
// Important 5 (Görev 18 review): spec §10.3.3 requires the pre-check, the payload
// and the post-check to share a SINGLE TCP connection — the Xprinter (spec §6)
// only accepts one session at a time, and rapid close/reconnect churn risks
// refused connections on the real device. DLE EOT is a real-time command, valid
// mid-stream on an already-open connection, so all three phases run here on one
// `connect()`.
export async function printWithChecks(
  host: string,
  port: number,
  bytes: Uint8Array,
  { connectMs = 3000, replyMs = 1000, sendMs = 5000, tls: tlsFlag }: TransportOptions & { replyMs?: number; sendMs?: number } = {},
): Promise<{ before: PrinterState; after: PrinterState }> {
  if (isEposPort(port)) return eposPrint(host, port, bytes, { connectMs, timeoutMs: connectMs + sendMs + 2000 });
  const s = await connect(host, port, { connectMs, tls: tlsFlag });
  try {
    const before = await readStatus(s, replyMs);
    const problem = blockingProblem(before);
    if (problem) throw new PrinterError(problem);
    await sendAndAwait(s, bytes, sendMs, 'write');
    const after = await readStatus(s, replyMs).catch(() => before);
    return { before, after };
  } finally {
    s.destroy();
  }
}
