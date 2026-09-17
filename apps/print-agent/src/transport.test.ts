import net from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { startFakePrinter } from './fake-printer';
import { testTlsCredentials } from './__fixtures__/testTls';
import { EPSON_TLS_PORT, PrinterError, printWithChecks, queryStatus, sendBytes, usesTls } from './transport';

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

describe('transport — TLS (Epson Secure Printing, port 9143)', () => {
  const creds = testTlsCredentials();

  it('kural: yalnız 9143 TLS; test bayrağı başka portta TLS zorlar', () => {
    expect(EPSON_TLS_PORT).toBe(9143);
    expect(usesTls(9143)).toBe(true);
    expect(usesTls(9100)).toBe(false);
    expect(usesTls(40001, true)).toBe(true);
  });

  it('kendinden imzalı sertifikalı TLS yazıcıya baytlar ulaşır ve durum sorusu cevaplanır', async () => {
    const fp = await startFakePrinter({ tls: creds }); stop = fp.stop;
    const r = await printWithChecks('127.0.0.1', fp.port, Uint8Array.from([0x1b, 0x40, 0x41, 0x42]), { tls: true });
    expect(r.before).toMatchObject({ known: true, raw: '121212' });
    expect(r.after.known).toBe(true);
    await sendBytes('127.0.0.1', fp.port, Uint8Array.from([5, 6, 7]), { tls: true });
    await new Promise((res) => setTimeout(res, 50));
    expect(fp.jobs.map((j) => Array.from(j))).toEqual(expect.arrayContaining([[0x1b, 0x40, 0x41, 0x42], [5, 6, 7]]));
    expect((await queryStatus('127.0.0.1', fp.port, { tls: true })).raw).toBe('121212');
  });

  it('TLS yazıcıda kağıt yoksa göndermez (durum okuma TLS üzerinden de çalışır)', async () => {
    const fp = await startFakePrinter({ tls: creds, status: [0x12, 0x32, 0x72] }); stop = fp.stop;
    await expect(printWithChecks('127.0.0.1', fp.port, Uint8Array.from([9]), { tls: true })).rejects.toMatchObject({ code: 'paper_end' });
    expect(fp.jobs).toHaveLength(0);
  });

  it('düz TCP yazıcıya TLS ile bağlanılırsa (el sıkışma hatası) offline döner, mesaj "tls:" ile başlar', async () => {
    const server = net.createServer((socket) => {
      socket.on('error', () => {}); // TLS istemcisi el sıkışma hatasında bağlantıyı sıfırlayabilir
      socket.end('HTTP/1.0 400 Bad Request\r\n\r\n');
    });
    const port = await listen(server);
    try {
      const err = await queryStatus('127.0.0.1', port, { tls: true, connectMs: 2000 }).catch((e: unknown) => e);
      expect(err).toBeInstanceOf(PrinterError);
      expect(err).toMatchObject({ code: 'offline' });
      expect((err as Error).message).toMatch(/^tls: /);
      expect((err as Error).message).not.toBe('tls: connect timeout'); // gerçek el sıkışma hatası, zaman aşımı değil
    } finally {
      server.close();
    }
  });

  it('el sıkışmasına hiç cevap vermeyen cihaz zaman aşımıyla offline döner', async () => {
    const sockets: net.Socket[] = [];
    const server = net.createServer((socket) => { sockets.push(socket); });
    const port = await listen(server);
    try {
      await expect(queryStatus('127.0.0.1', port, { tls: true, connectMs: 300 })).rejects.toMatchObject({
        code: 'offline',
        message: 'tls: connect timeout',
      });
    } finally {
      for (const so of sockets) so.destroy();
      server.close();
    }
  });

  it('TLS yazıcıya düz TCP ile gönderilen iş ulaşmaz (Secure Printing neden gerekli)', async () => {
    const fp = await startFakePrinter({ tls: creds }); stop = fp.stop;
    await sendBytes('127.0.0.1', fp.port, Uint8Array.from([1, 2, 3]), { sendMs: 1000 }).catch(() => {});
    await new Promise((res) => setTimeout(res, 50));
    expect(fp.jobs).toHaveLength(0);
  });
});
