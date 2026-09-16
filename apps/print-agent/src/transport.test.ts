import { afterEach, describe, expect, it } from 'vitest';
import { startFakePrinter } from './fake-printer';
import { PrinterError, printWithChecks, queryStatus, sendBytes } from './transport';

let stop: (() => Promise<void>) | undefined;
afterEach(async () => { await stop?.(); stop = undefined; });

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
