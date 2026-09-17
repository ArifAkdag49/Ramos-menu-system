import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { blockingProblem } from './status';
import { PrinterError } from './transport';
import { createUsbPrinter, usbStateFrom, type ExecFn, type UsbQueueStatus } from './usb';

const q = (over: Partial<UsbQueueStatus> = {}): UsbQueueStatus => ({ exists: true, status: 0, attributes: 0x40, jobs: 0, jobsInError: 0, ...over });
const settings = { host: 'usb:POS-80', port: 9100, codepage: 'cp857', codepageNumber: 61, transliterate: false };

describe('usbStateFrom', () => {
  it('kuyruk sorun bildirmiyorsa durum bilinmiyor sayılır ve baskıyı engellemez', () => {
    const s = usbStateFrom(q());
    expect(s.known).toBe(false);
    expect(blockingProblem(s)).toBeNull();
  });

  it('"çevrimdışı kullan" modu, OFFLINE bayrağı ya da takılı iş çevrimdışı sayılır', () => {
    expect(blockingProblem(usbStateFrom(q({ attributes: 0x440 })))).toBe('offline');
    expect(blockingProblem(usbStateFrom(q({ status: 0x80 })))).toBe('offline');
    expect(blockingProblem(usbStateFrom(q({ jobs: 2, jobsInError: 1 })))).toBe('offline');
  });

  it('kağıt yok ve kapak açık bayraklarını okur', () => {
    expect(blockingProblem(usbStateFrom(q({ status: 0x10 })))).toBe('paper_end');
    expect(blockingProblem(usbStateFrom(q({ status: 0x400000 })))).toBe('cover_open');
  });
});

function fakeExec(handlers: { status?: () => { code: number; stdout?: string; stderr?: string }; print?: (file: string) => { code: number; stderr?: string } }) {
  const calls: { args: string[]; bytes?: Buffer }[] = [];
  const exec: ExecFn = vi.fn(async (_file, args) => {
    if (args[0] === 'status') {
      calls.push({ args });
      const r = handlers.status?.() ?? { code: 0, stdout: JSON.stringify(q()) };
      return { code: r.code, stdout: r.stdout ?? '', stderr: r.stderr ?? '' };
    }
    const bytes = fs.readFileSync(args[2]!);
    calls.push({ args, bytes });
    const r = handlers.print?.(args[2]!) ?? { code: 0 };
    return { code: r.code, stdout: '{"sent":1}', stderr: r.stderr ?? '' };
  });
  return { exec, calls };
}

describe('createUsbPrinter', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ramos-usb-test-'));

  it('baytları geçici dosyayla ramos-usb.exe print\'e verir ve dosyayı siler', async () => {
    const { exec, calls } = fakeExec({});
    const usb = createUsbPrinter({ exe: 'C:\\x\\ramos-usb.exe', printerName: 'POS-80', exec, tmpDir });
    await usb.print(settings, Uint8Array.from([0x1b, 0x40, 0x41]));
    const printCall = calls.find((c) => c.args[0] === 'print')!;
    expect(printCall.args[1]).toBe('POS-80');
    expect([...printCall.bytes!]).toEqual([0x1b, 0x40, 0x41]);
    expect(fs.existsSync(printCall.args[2]!)).toBe(false);
  });

  it('kuyruk çevrimdışıysa hiç göndermeden reddeder (yeni iş sahiplenilmesin)', async () => {
    const { exec, calls } = fakeExec({ status: () => ({ code: 0, stdout: JSON.stringify(q({ attributes: 0x440, jobs: 3 })) }) });
    const usb = createUsbPrinter({ exe: 'ramos-usb.exe', printerName: 'XP-80', exec, tmpDir });
    await expect(usb.print(settings, Uint8Array.from([1]))).rejects.toMatchObject({ code: 'offline' });
    expect(calls.some((c) => c.args[0] === 'print')).toBe(false);
  });

  it('Windows\'ta yazıcı yoksa (çıkış 3) offline, diğer hatalarda io hatası fırlatır; geçici dosya yine silinir', async () => {
    const missing = createUsbPrinter({ exe: 'x', printerName: 'Yok', exec: fakeExec({ status: () => ({ code: 3, stderr: 'bulunamadi' }) }).exec, tmpDir });
    await expect(missing.status(settings)).rejects.toMatchObject({ code: 'offline' });

    const { exec, calls } = fakeExec({ print: () => ({ code: 1, stderr: 'WritePrinter: erişim engellendi' }) });
    const broken = createUsbPrinter({ exe: 'x', printerName: 'POS-80', exec, tmpDir });
    const err = await broken.print(settings, Uint8Array.from([1])).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(PrinterError);
    expect((err as PrinterError).code).toBe('io');
    expect((err as Error).message).toContain('erişim engellendi');
    expect(fs.existsSync(calls.find((c) => c.args[0] === 'print')!.args[2]!)).toBe(false);
  });

  it('bozuk status çıktısında io hatası verir', async () => {
    const usb = createUsbPrinter({ exe: 'x', printerName: 'POS-80', exec: fakeExec({ status: () => ({ code: 0, stdout: 'merhaba' }) }).exec, tmpDir });
    await expect(usb.status(settings)).rejects.toMatchObject({ code: 'io' });
  });
});
