import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { AgentSettings, PrinterPort } from './agent';
import { blockingProblem, type PrinterState } from './status';
import { PrinterError } from './transport';

// USB ile bilgisayara bağlı yazıcı (Windows). Fiş, Windows yazıcı kuyruğuna RAW olarak verilir —
// ESC/POS baytları sürücüden geçmeden yazıcıya gider. İşi `ramos-usb.exe` yapar (kurulum sihirbazı
// usb/ramos-usb.cs'yi bilgisayarın kendi csc.exe'siyle derler).
//
// "Basıldı" burada "Windows kuyruğuna teslim edildi" demektir: USB kablosu çıkmışsa iş kuyrukta
// bekler ve kablo takılınca basılır (kaybolmaz, çift basılmaz). Kuyrukta takılı iş varsa ya da
// kuyruk "çevrimdışı kullan" modundaysa durum `offline` sayılır ve ajan yeni iş sahiplenmez —
// siparişler mutfak ekranında beklemeye devam eder.

export interface UsbQueueStatus {
  exists: boolean;
  name?: string;
  port?: string;
  driver?: string;
  status: number;
  attributes: number;
  jobs: number;
  jobsInError: number;
}

export interface ExecResult { code: number; stdout: string; stderr: string }
export type ExecFn = (file: string, args: string[], timeoutMs: number) => Promise<ExecResult>;

// winspool PRINTER_INFO_2.Status / Attributes bayrakları
const STATUS_ERROR = 0x2;
const STATUS_PAPER_JAM = 0x8;
const STATUS_PAPER_OUT = 0x10;
const STATUS_OFFLINE = 0x80;
const STATUS_NOT_AVAILABLE = 0x1000;
const STATUS_USER_INTERVENTION = 0x100000;
const STATUS_DOOR_OPEN = 0x400000;
const ATTRIBUTE_WORK_OFFLINE = 0x400;

/** Windows kuyruk durumunu ajanın yazıcı durumuna çevirir. Kuyruk hiçbir sorun bildirmiyorsa durum "bilinmiyor"dur (baskıyı engellemez). */
export function usbStateFrom(q: UsbQueueStatus): PrinterState {
  const offline =
    (q.status & (STATUS_OFFLINE | STATUS_NOT_AVAILABLE)) !== 0 || (q.attributes & ATTRIBUTE_WORK_OFFLINE) !== 0 || q.jobsInError > 0;
  const paper_end = (q.status & STATUS_PAPER_OUT) !== 0;
  const cover_open = (q.status & STATUS_DOOR_OPEN) !== 0;
  const error = (q.status & (STATUS_ERROR | STATUS_PAPER_JAM | STATUS_USER_INTERVENTION)) !== 0;
  return {
    known: offline || paper_end || cover_open || error,
    offline,
    cover_open,
    paper_end,
    paper_near_end: false,
    error,
    raw: `usb:${q.status.toString(16)}:${q.attributes.toString(16)}:${q.jobsInError}`,
  };
}

export const defaultExec: ExecFn = (file, args, timeoutMs) =>
  new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, windowsHide: true, encoding: 'utf8' }, (err, stdout, stderr) => {
      if (!err) return resolve({ code: 0, stdout, stderr });
      const e = err as NodeJS.ErrnoException & { code?: number | string; killed?: boolean };
      const code = typeof e.code === 'number' ? e.code : -1;
      resolve({ code, stdout: stdout ?? '', stderr: stderr || (e.killed ? 'zaman aşımı' : e.message) });
    });
  });

export interface UsbPrinterOptions {
  exe: string;
  printerName: string;
  exec?: ExecFn;
  tmpDir?: string;
  statusTimeoutMs?: number;
  printTimeoutMs?: number;
}

export function createUsbPrinter(opts: UsbPrinterOptions): PrinterPort & { queueStatus(): Promise<UsbQueueStatus> } {
  const exec = opts.exec ?? defaultExec;
  const tmpDir = opts.tmpDir ?? os.tmpdir();

  async function queueStatus(): Promise<UsbQueueStatus> {
    const r = await exec(opts.exe, ['status', opts.printerName], opts.statusTimeoutMs ?? 10000);
    if (r.code === 3) throw new PrinterError('offline', `USB yazıcı Windows'ta bulunamadı: ${opts.printerName}`);
    if (r.code !== 0) throw new PrinterError('io', `ramos-usb status: ${r.stderr.trim() || `çıkış ${r.code}`}`);
    try {
      return JSON.parse(r.stdout.trim()) as UsbQueueStatus;
    } catch {
      throw new PrinterError('io', `ramos-usb status okunamadı: ${r.stdout.slice(0, 200)}`);
    }
  }

  async function status(): Promise<PrinterState> {
    return usbStateFrom(await queueStatus());
  }

  async function print(_s: AgentSettings, bytes: Uint8Array): Promise<{ before: PrinterState; after: PrinterState }> {
    // TCP yolundaki `printWithChecks` ile aynı sözleşme: önce durum, engel varsa hiç göndermeden reddet.
    const before = await status();
    const problem = blockingProblem(before);
    if (problem) throw new PrinterError(problem);

    const file = path.join(tmpDir, `ramos-bon-${process.pid}-${randomUUID()}.bin`);
    fs.writeFileSync(file, bytes);
    try {
      // Yerel kuyruğa teslim anlıktır; uzun zaman aşımı, kuyruğa verilmiş bir işin "başarısız"
      // sayılıp yeniden basılma (çift fiş) ihtimalini pratikte sıfırlar.
      const r = await exec(opts.exe, ['print', opts.printerName, file], opts.printTimeoutMs ?? 60000);
      if (r.code === 3) throw new PrinterError('offline', `USB yazıcı Windows'ta bulunamadı: ${opts.printerName}`);
      if (r.code !== 0) throw new PrinterError('io', `ramos-usb print: ${r.stderr.trim() || `çıkış ${r.code}`}`);
    } finally {
      fs.rmSync(file, { force: true });
    }
    return { before, after: before };
  }

  return { status, print, queueStatus };
}

/** `usb:<Windows yazıcı adı>` — ajan ayarlarında USB yazıcının "adresi". */
export const usbHost = (printerName: string): string => `usb:${printerName}`;
