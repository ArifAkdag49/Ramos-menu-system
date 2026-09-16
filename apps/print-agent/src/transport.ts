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

// BUILD-PROMPT §5: TCP connect timeout 3s, status reply timeout 1s.
export async function queryStatus(
  host: string,
  port: number,
  { connectMs = 3000, replyMs = 1000 }: { connectMs?: number; replyMs?: number } = {},
): Promise<PrinterState> {
  const s = await connect(host, port, connectMs);
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    const done = () => {
      s.destroy();
      resolve(parseStatus(new Uint8Array(Buffer.concat(chunks))));
    };
    const t = setTimeout(done, replyMs);
    s.on('data', (d: Buffer) => {
      chunks.push(d);
      if (Buffer.concat(chunks).length >= 3) {
        clearTimeout(t);
        done();
      }
    });
    s.write(STATUS_QUERY);
  });
}

export async function sendBytes(
  host: string,
  port: number,
  bytes: Uint8Array,
  { connectMs = 3000 }: { connectMs?: number } = {},
): Promise<void> {
  const s = await connect(host, port, connectMs);
  await new Promise<void>((resolve, reject) => {
    s.once('error', (e) => reject(new PrinterError('io', e.message)));
    s.end(bytes, () => resolve());
  });
  await new Promise((r) => s.once('close', r));
}

// "Yazıldı ≠ basıldı": query status before sending (refuse on a blocking problem,
// without sending), send, then query again — a failed/short post-send query never
// turns an already-sent job into a failure (BUILD-PROMPT §6).
export async function printWithChecks(
  host: string,
  port: number,
  bytes: Uint8Array,
): Promise<{ before: PrinterState; after: PrinterState }> {
  const before = await queryStatus(host, port);
  const problem = blockingProblem(before);
  if (problem) throw new PrinterError(problem);
  await sendBytes(host, port, bytes);
  const after = await queryStatus(host, port).catch(() => before);
  return { before, after };
}
