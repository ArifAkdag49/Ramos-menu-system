import fs from 'node:fs';
import path from 'node:path';
import { linesToText, renderTicket, type TicketPayload, type Database } from '@ramos/shared';
import { createClient } from '@supabase/supabase-js';
import CodepageEncoder, { type Codepage } from '@point-of-sale/codepage-encoder';
import { Agent, type PrinterPort } from './agent';
import { AGENT_VERSION, createSupabaseApi } from './api';
import { loadConfig } from './config';
import { startFakePrinter } from './fake-printer';
import { encodeLines } from './escpos';
import { createLogger, type Logger } from './log';
import { printWithChecks, queryStatus } from './transport';

const [cmd = 'run', ...rest] = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

const tcpPrinter: PrinterPort = {
  status: (s) => queryStatus(s.host, s.port),
  print: (s, bytes) => printWithChecks(s.host, s.port, bytes),
};

// ---------- tek örnek çalıştırma kilidi ----------

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/** Ajan aynı PC'de yalnız tek örnek çalışsın diye bir PID kilit dosyası tutar. */
function acquireLock(dir: string): () => void {
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, 'agent.lock');
  if (fs.existsSync(lockPath)) {
    const existing = Number(fs.readFileSync(lockPath, 'utf8').trim());
    if (existing && isRunning(existing)) {
      throw new Error(`Ajan zaten çalışıyor (pid ${existing}). Kilit dosyası: ${lockPath}`);
    }
  }
  fs.writeFileSync(lockPath, String(process.pid));
  return () => {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Kilit dosyası başka bir sebeple zaten silinmiş olabilir.
    }
  };
}

// ---------- run ----------

async function cmdRun(): Promise<void> {
  const cfg = loadConfig();
  const releaseLock = acquireLock(cfg.LOG_DIR);
  const log = createLogger(cfg.LOG_DIR);
  try {
    log.info('ajan başlıyor', { version: AGENT_VERSION, agentId: cfg.AGENT_ID });
    const api = await createSupabaseApi(cfg, log);
    const agent = new Agent(api, { printer: tcpPrinter, log });
    await agent.start();
    const settings = await api.settings();
    log.info('ajan çalışıyor', { host: settings.host, port: settings.port });

    let stopping = false;
    const shutdown = (signal: string): void => {
      if (stopping) return;
      stopping = true;
      log.info('kapatılıyor', { signal });
      void agent
        .stop()
        .catch((e: unknown) => log.error('kapatma sırasında hata', { e: String(e) }))
        .finally(() => {
          releaseLock();
          process.exit(0);
        });
    };
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
  } catch (e) {
    releaseLock();
    throw e;
  }
}

// ---------- status ----------

async function resolveHostPort(log: Logger): Promise<{ host: string; port: number }> {
  const hostArg = arg('host');
  const portArg = arg('port');
  if (hostArg && portArg) return { host: hostArg, port: Number(portArg) };
  const cfg = loadConfig();
  const api = await createSupabaseApi(cfg, log);
  try {
    const s = await api.settings();
    return { host: hostArg ?? s.host, port: portArg ? Number(portArg) : s.port };
  } finally {
    await api.close();
  }
}

const silentLog: Logger = { info: () => {}, warn: () => {}, error: () => {} };

async function cmdStatus(): Promise<void> {
  const { host, port } = await resolveHostPort(silentLog);
  const state = await queryStatus(host, port);
  console.log(JSON.stringify(state, null, 2));
}

// ---------- test-print ----------

function testPrintPayload(s: {
  ticket_header: string;
  ticket_footer: string;
  printer_host: string;
  printer_port: number;
  printer_codepage: string;
  printer_codepage_number: number;
  printer_transliterate: boolean;
}): TicketPayload {
  return {
    kind: 'test',
    header: s.ticket_header,
    footer: s.ticket_footer,
    table: 'Tisch 12',
    orderNo: 0,
    round: 1,
    createdAt: new Date().toISOString(),
    waiter: 'CLI',
    note: 'Testdruck',
    settings: {
      host: s.printer_host,
      port: s.printer_port,
      codepage: s.printer_codepage,
      codepageNumber: s.printer_codepage_number,
      transliterate: s.printer_transliterate,
    },
    sampleLine: 'ÄÖÜ äöü ß · Şş Ğğ İı Çç · 0123456789 · #*-+',
    items: [
      {
        qty: 2, code: '05', name: 'Drehspieß Sandwich', isBeverage: false, variant: 'Kalb',
        without: ['Zwiebeln', 'Tomaten'],
        groups: [
          { label: 'Soße', format: 'label_values', values: ['Knoblauch', 'Kräuter'] },
          { label: 'Schärfe', format: 'values_only', values: ['scharf (Chili)'] },
          { label: 'Extras', format: 'plus_each', values: ['Extra Weichkäse'] },
        ],
        note: 'Soße extra',
      },
      {
        qty: 1, code: '59', name: 'Kuzu Şiş', isBeverage: false, variant: null, without: [],
        groups: [{ label: 'Beilage', format: 'values_only', values: ['Reis'] }], note: null,
      },
      { qty: 3, code: null, name: 'Cola 0,33 l', isBeverage: true, variant: null, without: [], groups: [], note: null },
    ],
  };
}

async function cmdTestPrint(): Promise<void> {
  const hostArg = arg('host');
  const portArg = arg('port');
  const cfg = loadConfig();
  const sb = createClient<Database>(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: signInError } = await sb.auth.signInWithPassword({ email: cfg.AGENT_EMAIL, password: cfg.AGENT_PASSWORD });
  if (signInError) throw new Error(`Ajan girişi başarısız: ${signInError.message}`);
  try {
    const { data, error } = await sb
      .from('settings')
      .select('ticket_header, ticket_footer, printer_host, printer_port, printer_codepage, printer_codepage_number, printer_transliterate')
      .eq('id', 1)
      .single();
    if (error) throw new Error(`settings: ${error.message}`);

    const host = hostArg ?? data.printer_host;
    const port = portArg ? Number(portArg) : data.printer_port;
    const payload = testPrintPayload(data);
    const lines = renderTicket(payload, { transliterate: data.printer_transliterate });
    const bytes = encodeLines(lines, { codepage: data.printer_codepage, codepageNumber: data.printer_codepage_number });

    console.log(`Test baskısı gönderiliyor: ${host}:${port}`);
    const result = await printWithChecks(host, port, bytes);
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await sb.auth.signOut();
  }
}

// ---------- dry-run ----------

async function cmdDryRun(): Promise<void> {
  const limit = Number(arg('limit') ?? 5);
  const cfg = loadConfig();
  const sb = createClient<Database>(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { error: signInError } = await sb.auth.signInWithPassword({ email: cfg.AGENT_EMAIL, password: cfg.AGENT_PASSWORD });
  if (signInError) throw new Error(`Ajan girişi başarısız: ${signInError.message}`);
  try {
    const { data, error } = await sb
      .from('print_jobs')
      .select('id, type, status, payload, created_at')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw new Error(`print_jobs: ${error.message}`);

    for (const row of data ?? []) {
      console.log(`--- ${row.id} · ${row.type} · ${row.status} · ${row.created_at} ---`);
      console.log(linesToText(renderTicket(row.payload as unknown as TicketPayload)));
      console.log('');
    }
    if (!data || data.length === 0) console.log('Kuyrukta iş yok.');
  } finally {
    await sb.auth.signOut();
  }
}

// ---------- fake-printer ----------

// Ham baytlardan bilinen ESC/POS komutlarını (init, karakter tablosu, kalın/ters basım,
// karakter boyutu, kesim, durum sorgusu) atar; geri kalan metin baytları CP857 tablosuyla
// çözülüp `\n` ile birleştirilir — yalnızca insanın okuyacağı bir önizleme içindir.
function decodeTicketPreview(bytes: Uint8Array, codepage: string): string {
  const table = CodepageEncoder.getEncoding(codepage as Codepage).codepoints;
  const out: number[] = [];
  let i = 0;
  while (i < bytes.length) {
    const b = bytes[i];
    const b1 = bytes[i + 1];
    if (b === 0x1b && b1 === 0x40) { i += 2; continue; } // ESC @
    if (b === 0x1c && b1 === 0x2e) { i += 2; continue; } // FS .
    if (b === 0x1b && (b1 === 0x74 || b1 === 0x45)) { i += 3; continue; } // ESC t n / ESC E n
    if (b === 0x1d && (b1 === 0x42 || b1 === 0x21)) { i += 3; continue; } // GS B n / GS ! n
    if (b === 0x1d && b1 === 0x56) { i += 4; continue; } // GS V m n
    if (b === 0x10 && b1 === 0x04) { i += 3; continue; } // DLE EOT n
    if ((b === 0x0a && b1 === 0x0d) || (b === 0x0d && b1 === 0x0a)) { out.push(0x0a); i += 2; continue; }
    out.push(b!);
    i += 1;
  }
  return out.map((b) => (b === 0x0a ? '\n' : String.fromCodePoint(table[b] ?? 0xfffd))).join('');
}

async function cmdFakePrinter(): Promise<void> {
  const port = Number(arg('port') ?? 9100);
  const codepage = arg('codepage') ?? 'cp857';
  const outDir = path.resolve('fake-printer-out');
  fs.mkdirSync(outDir, { recursive: true });

  const printer = await startFakePrinter({ port });
  console.log(`Sahte yazıcı dinliyor: 127.0.0.1:${printer.port} (çıktı: ${outDir})`);

  let seen = 0;
  const poll = setInterval(() => {
    while (seen < printer.jobs.length) {
      const bytes = printer.jobs[seen]!;
      seen += 1;
      const ts = Date.now();
      fs.writeFileSync(path.join(outDir, `${ts}.bin`), bytes);
      fs.writeFileSync(path.join(outDir, `${ts}.txt`), decodeTicketPreview(bytes, codepage), 'utf8');
      console.log(`İş alındı: ${ts}.bin (${bytes.length} bayt)`);
    }
  }, 100);

  const shutdown = (): void => {
    clearInterval(poll);
    void printer.stop().then(() => process.exit(0));
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

// ---------- dispatch ----------

async function main(): Promise<void> {
  switch (cmd) {
    case 'run':
      await cmdRun();
      break;
    case 'status':
      await cmdStatus();
      break;
    case 'test-print':
      await cmdTestPrint();
      break;
    case 'dry-run':
      await cmdDryRun();
      break;
    case 'fake-printer':
      await cmdFakePrinter();
      break;
    default:
      console.error(`Bilinmeyen komut: ${cmd}. Kullanım: run | status | test-print | dry-run | fake-printer`);
      process.exit(1);
  }
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : String(e));
  process.exit(1);
});
