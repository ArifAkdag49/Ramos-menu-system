import net from 'node:net';
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

function connect(host: string, port: number, connectMs: number): Promise<net.Socket> {
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
  { connectMs = 3000, replyMs = 1000 }: { connectMs?: number; replyMs?: number } = {},
): Promise<PrinterState> {
  const s = await connect(host, port, connectMs);
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
  { connectMs = 3000, sendMs = 5000 }: { connectMs?: number; sendMs?: number } = {},
): Promise<void> {
  const s = await connect(host, port, connectMs);
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
  { connectMs = 3000, replyMs = 1000, sendMs = 5000 }: { connectMs?: number; replyMs?: number; sendMs?: number } = {},
): Promise<{ before: PrinterState; after: PrinterState }> {
  const s = await connect(host, port, connectMs);
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
