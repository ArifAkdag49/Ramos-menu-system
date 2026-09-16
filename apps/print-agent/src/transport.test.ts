import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startFakePrinter } from './fake-printer';
import { PrinterError, printWithChecks, queryStatus, sendBytes } from './transport';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => { await stop?.(); stop = undefined; });

// Fix round 1 (Görev 18 review): startFakePrinter is "too well-behaved" to catch
// Critical 2 / Important 3 — Node's default `allowHalfOpen: false` makes it close
// on FIN, and it never resets a connection. These tests use a raw net.createServer
// instead to reproduce exactly the misbehaving-printer scenarios the review probed.
function listen(server: net.Server): Promise<number> {
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      resolve(typeof addr === 'object' && addr !== null ? addr.port : 0);
    });
  });
}

describe('transport (sahte yazıcı)', () => {
  it('baytları olduğu gibi iletir ve durum okur', async () => {
    const fp = await startFakePrinter({}); stop = fp.stop;
    await sendBytes('127.0.0.1', fp.port, Uint8Array.from([1, 2, 3]));
    await new Promise((r) => setTimeout(r, 50));
    expect(Array.from(fp.jobs.at(-1)!)).toEqual([1, 2, 3]);
    expect((await queryStatus('127.0.0.1', fp.port)).known).toBe(true);
  });
  it('kağıt bittiyse göndermez', async () => {
    const fp = await startFakePrinter({ status: [0x12, 0x32, 0x72] }); stop = fp.stop;
    await expect(printWithChecks('127.0.0.1', fp.port, Uint8Array.from([9]))).rejects.toMatchObject({ code: 'paper_end' });
    expect(fp.jobs).toHaveLength(0);
  });
  it('kapalı porta bağlanamazsa offline', async () => {
    await expect(queryStatus('127.0.0.1', 1, { connectMs: 500 })).rejects.toBeInstanceOf(PrinterError);
  });
  it('durum yanıtı vermeyen yazıcı "bilinmiyor" sayılır ve basılır', async () => {
    const fp = await startFakePrinter({ silent: true }); stop = fp.stop;
    const r = await printWithChecks('127.0.0.1', fp.port, Uint8Array.from([7]));
    expect(r.before.known).toBe(false);
    await new Promise((res) => setTimeout(res, 50));
    expect(fp.jobs.some((j) => j.includes(7))).toBe(true);
  });
});

describe('transport — sendBytes zaman aşımıyla sınırlı (Critical 2)', () => {
  it('yazıcı bağlantıyı kabul edip hiç yanıt vermez/kapatmazsa asılı kalmaz', async () => {
    const server = net.createServer(() => {
      // Accept the connection and do absolutely nothing else — no data, no end, no destroy.
    });
    const port = await listen(server);
    try {
      await expect(
        sendBytes('127.0.0.1', port, Uint8Array.from([1, 2, 3]), { sendMs: 200 }),
      ).rejects.toMatchObject({ code: 'timeout' });
    } finally {
      server.close();
    }
  });
});

describe('transport — bağlantı sıfırlanırsa sendBytes başarı bildirmez (Important 3)', () => {
  it('yazıcı bağlantıyı RST ile keserse sendBytes reddeder', async () => {
    const server = net.createServer((socket) => {
      socket.resetAndDestroy();
    });
    const port = await listen(server);
    try {
      await expect(sendBytes('127.0.0.1', port, Uint8Array.from([1, 2, 3]))).rejects.toBeInstanceOf(PrinterError);
    } finally {
      server.close();
    }
  });
});

describe('transport — printWithChecks tek bağlantı kullanır (Important 5)', () => {
  it('ön kontrol + iş + son kontrol aynı TCP bağlantısı üzerinden gider (3 değil, 1)', async () => {
    let connections = 0;
    const server = net.createServer((socket) => {
      connections += 1;
      socket.on('data', (data: Buffer) => {
        let i = 0;
        while (i < data.length) {
          if (data[i] === 0x10 && data[i + 1] === 0x04) {
            socket.write(Uint8Array.from([0x12]));
            i += 3;
            continue;
          }
          i += 1;
        }
      });
    });
    const port = await listen(server);
    try {
      await printWithChecks('127.0.0.1', port, Uint8Array.from([1, 2, 3]));
      expect(connections).toBe(1);
    } finally {
      server.close();
    }
  });
});
