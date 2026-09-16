import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { linesToText, renderTicket, type TicketPayload, type Database } from '@ramos/shared';
import { createClient } from '@supabase/supabase-js';
import CodepageEncoder, { type Codepage } from '@point-of-sale/codepage-encoder';
import { Agent, type AgentApi, type PrinterPort } from './agent';
import { AGENT_VERSION, createSupabaseApi } from './api';
import { loadConfig, type AgentEnv } from './config';
import { startFakePrinter } from './fake-printer';
import { encodeLines } from './escpos';
import { createLogger, type Logger } from './log';
import { createShutdownHandler } from './shutdown';
import { printWithChecks, queryStatus } from './transport';

const [cmd = 'run', ...rest] = process.argv.slice(2);
const arg = (name: string): string | undefined => {
  const i = rest.indexOf(`--${name}`);
  return i >= 0 ? rest[i + 1] : undefined;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const tcpPrinter: PrinterPort = {
  status: (s) => queryStatus(s.host, s.port),
  print: (s, bytes) => printWithChecks(s.host, s.port, bytes),
};

// M8: `status`/`test-print`/`fake-printer` ajan sürecinden BAĞIMSIZ kendi TCP bağlantısını
// açar (I1 ile aynı kısıt — spec §10.3.3/§6: yazıcı aynı anda tek oturum kabul eder). `run`
// hâlde bir bilet basılırken bu komutlardan biri gerçek yazıcıya (XP-Q80A) bağlanmaya
// çalışırsa ikinci bağlantı reddedilebilir. Yalnız kurulum/tanı içindirler — Görev 20'de
// ajan çalışırken bunları elle çalıştırmamak gerektiği unutulmamalı (bkz. task-19-report.md).
// Bu diagnostik komutlar tek-örnek kilidine girmez; ajanı durdurmadan bilinçli kullanılmalı.

// ---------- tek örnek çalıştırma kilidi ----------

interface LockInfo { pid: number; startTime: number | null }

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

// I3(c): yalnız PID varlığı güvenilir değil — temiz olmayan bir kapanışın ardından (özellikle
// reboot sonrası) Windows aynı PID'i tamamen başka bir sürece verebilir. Süreç başlangıç
// zamanını da karşılaştırarak "aynı ajan mı, yoksa PID yeniden mi kullanılmış" ayrımını
// yaparız; sorgu başarısız olursa (ör. Windows dışı platform, powershell yok) `null` döner ve
// eski (yalnız PID) davranışına düşülür — asla başlatmayı riskli biçimde kolaylaştırmaz.
function processStartTime(pid: number): number | null {
  if (process.platform !== 'win32') return null;
  try {
    const out = execFileSync(
      'powershell',
      ['-NoProfile', '-NonInteractive', '-Command', `(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc()`],
      { encoding: 'utf8', timeout: 3000 },
    ).trim();
    return out ? Number(out) : null;
  } catch {
    return null;
  }
}

function readLockInfo(lockPath: string): LockInfo | null {
  try {
    const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as Partial<LockInfo>;
    if (typeof raw.pid !== 'number') return null;
    return { pid: raw.pid, startTime: typeof raw.startTime === 'number' ? raw.startTime : null };
  } catch {
    return null;
  }
}

/**
 * Ajan aynı PC'de yalnız tek örnek çalışsın diye bir PID kilit dosyası tutar.
 * I3: (a) çağıran reddi loglayabilsin diye `log` parametre olarak alınır — Zamanlanmış
 * Görev `-Hidden` çalıştığından yalnız stderr'e yazmak görünmez olurdu; (b) kilit
 * `fs.openSync(path, 'wx')` ile atomik oluşturulur (`existsSync` + `writeFileSync` arasındaki
 * yarışı önler); (c) PID'in yanına başlangıç zamanı da yazılır, reboot sonrası PID yeniden
 * kullanımını ayırt eder — yoksa Zamanlanmış Görev sessizce 999 kez başarısız olur, hiçbir
 * bilet basılmaz ve nedeni hiçbir yerde görünmez.
 */
function acquireLock(dir: string, log: Logger): () => void {
  fs.mkdirSync(dir, { recursive: true });
  const lockPath = path.join(dir, 'agent.lock');
  const existing = readLockInfo(lockPath);
  if (existing && isRunning(existing.pid)) {
    const currentStart = processStartTime(existing.pid);
    const samePid = existing.startTime === null || currentStart === null || existing.startTime === currentStart;
    if (samePid) {
      throw new Error(`Ajan zaten çalışıyor (pid ${existing.pid}). Kilit dosyası: ${lockPath}`);
    }
    log.warn('kilit dosyasındaki pid yeniden kullanılmış görünüyor (reboot sonrası) — kilit devralınıyor', { pid: existing.pid });
  }
  if (existing) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Kilit dosyası bu sırada başka bir sebeple silinmiş olabilir.
    }
  }
  let fd: number;
  try {
    fd = fs.openSync(lockPath, 'wx'); // I3(b): atomik oluşturma — var olan dosyanın üstüne race'siz yazılmaz
  } catch (e) {
    throw new Error(`Ajan kilidi alınamadı: ${lockPath} (${e instanceof Error ? e.message : String(e)})`, { cause: e });
  }
  const startTime = processStartTime(process.pid);
  if (startTime === null) {
    // NEW-5 (review fix round 2): sessizce geçmez — bir sonraki başlatmada PID yeniden
    // kullanılırsa (reboot sonrası) bu ajan kilidi hep "hâlâ çalışıyor" sayıp kalıcı olarak
    // başlamayı reddedebilir (fail-closed, doğru ama teşhis edilemez kalırdı).
    log.warn('süreç başlangıç zamanı okunamadı — pid yeniden kullanımı algılanamayabilir (kilit yine de güvenli tarafta kalır)', {
      pid: process.pid,
    });
  }
  const info: LockInfo = { pid: process.pid, startTime };
  fs.writeSync(fd, JSON.stringify(info));
  fs.closeSync(fd);
  return () => {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // Kilit dosyası başka bir sebeple zaten silinmiş olabilir.
    }
  };
}

// ---------- run ----------

// I4: restoran PC'si router'dan önce açılabilir — açılışta Supabase'e ulaşılamazsa hemen
// exit(1) yerine üstel geri çekilmeyle (60 sn'de tavanlı) sınırsız yeniden dener; kurtarma
// Zamanlanmış Görev'in kendi yeniden başlatma sayacına (999) bağımlı kalmaz.
const STARTUP_BACKOFF_MS = [1000, 2000, 5000, 10000, 30000, 60000];

async function startAgentWithRetry(cfg: AgentEnv, log: Logger): Promise<{ api: AgentApi; agent: Agent }> {
  for (let attempt = 0; ; attempt++) {
    let api: AgentApi | undefined;
    try {
      api = await createSupabaseApi(cfg, log);
      const agent = new Agent(api, { printer: tcpPrinter, log });
      await agent.start();
      return { api, agent };
    } catch (e) {
      // NEW-4 (review fix round 2): bu deneme kısmen ilerleyip (ör. girişi başarıyla yapıp)
      // sonra başarısız olduysa, yeniden denemeden önce o oturum kapatılır — aksi hâlde her
      // başarısız deneme açık bir Supabase oturumu bırakırdı.
      if (api) await api.close().catch(() => {});
      const wait = STARTUP_BACKOFF_MS[Math.min(attempt, STARTUP_BACKOFF_MS.length - 1)]!;
      log.warn('ajan başlatılamadı, yeniden denenecek', { attempt, waitMs: wait, e: e instanceof Error ? e.message : String(e) });
      await sleep(wait);
    }
  }
}

async function cmdRun(): Promise<void> {
  const cfg = loadConfig();
  // I3(a): kilit denemesinden ÖNCE logger kurulur — kilit reddi dosya log'una da yazılsın.
  const log = createLogger(cfg.LOG_DIR);
  let releaseLock: () => void;
  try {
    releaseLock = acquireLock(cfg.LOG_DIR, log);
  } catch (e) {
    log.error('başlatılamadı: kilit alınamadı', { e: e instanceof Error ? e.message : String(e) });
    throw e;
  }

  // NEW-4 (review fix round 2): `startAgentWithRetry` Supabase'e ulaşılana kadar İÇERİDE
  // döner, hiçbir zaman reddetmez; ondan sonraki her satır da (settings okuma `.catch`'li,
  // `process.on` fırlatmaz) artık fırlatamaz. Eski dış `try { … } catch { releaseLock();
  // throw e; }` bu yüzden hiçbir zaman tetiklenmeyen, yanıltıcı ölü kod hâline gelmişti —
  // kaldırıldı. Kilit yalnız `shutdown()`'da (SIGINT/SIGTERM) serbest bırakılır.
  log.info('ajan başlıyor', { version: AGENT_VERSION, agentId: cfg.AGENT_ID });
  const { api, agent } = await startAgentWithRetry(cfg, log);
  const settings = await api.settings().catch(() => null);
  log.info('ajan çalışıyor', { host: settings?.host ?? null, port: settings?.port ?? null });

  const shutdown = createShutdownHandler(agent, log, () => {
    releaseLock();
    process.exit(0);
  });
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

// ---------- status ----------

const DEFAULT_PRINTER_PORT = 9100; // spec: ajan yalnızca TCP 9100 kullanır

async function resolveHostPort(log: Logger): Promise<{ host: string; port: number }> {
  const hostArg = arg('host');
  const portArg = arg('port');
  // M7: yalnız `--host` verilmişse bile DB'ye gitmeye gerek yok — port zaten standart 9100.
  if (hostArg) return { host: hostArg, port: portArg ? Number(portArg) : DEFAULT_PRINTER_PORT };
  const cfg = loadConfig();
  const api = await createSupabaseApi(cfg, log);
  try {
    const s = await api.settings();
    return { host: s.host, port: portArg ? Number(portArg) : s.port };
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
    // M5: önizleme, gerçek baskıyla aynı `transliterate` ayarını kullanmazsa ekranda görünen
    // ile basılan bilet farklılaşabilir (ör. Türkçe karakterler önizlemede görünür, fişte
    // dönüştürülür) — bu yüzden `settings.printer_transliterate` de okunur.
    const [{ data: settingsRow, error: settingsError }, { data, error }] = await Promise.all([
      sb.from('settings').select('printer_transliterate').eq('id', 1).single(),
      sb.from('print_jobs').select('id, type, status, payload, created_at').order('created_at', { ascending: false }).limit(limit),
    ]);
    if (settingsError) throw new Error(`settings: ${settingsError.message}`);
    if (error) throw new Error(`print_jobs: ${error.message}`);

    for (const row of data ?? []) {
      console.log(`--- ${row.id} · ${row.type} · ${row.status} · ${row.created_at} ---`);
      console.log(linesToText(renderTicket(row.payload as unknown as TicketPayload, { transliterate: settingsRow.printer_transliterate })));
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
