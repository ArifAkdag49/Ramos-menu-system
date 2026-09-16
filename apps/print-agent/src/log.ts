import fs from 'node:fs';
import path from 'node:path';

export interface Logger {
  info(m: string, d?: object): void;
  warn(m: string, d?: object): void;
  error(m: string, d?: object): void;
}

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_AGE_DAYS = 7;
const FILE_RE = /^agent-\d{4}-\d{2}-\d{2}\.log$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function fileNameFor(d: Date): string {
  return `agent-${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}.log`;
}

// 7 günden eski günlük dosyalarını siler (dosya adının tarihi, üretildiği günü zaten taşıyor —
// mtime'a bakılması, döndürülmüş `.1` uzantılı dosyaların da süpürülmesini sağlar).
function cleanupOldLogs(dir: string, now: Date): void {
  let entries: string[];
  try {
    entries = fs.readdirSync(dir);
  } catch {
    return;
  }
  const cutoffMs = now.getTime() - MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  for (const name of entries) {
    if (!FILE_RE.test(name) && !FILE_RE.test(name.replace(/\.\d+$/, ''))) continue;
    const full = path.join(dir, name);
    try {
      const stat = fs.statSync(full);
      if (stat.mtimeMs < cutoffMs) fs.unlinkSync(full);
    } catch {
      // Dosya bu sırada başka bir süreçte silinmiş olabilir — yok sayılır.
    }
  }
}

// Dosya 5 MB'ı aşmışsa `<ad>.1`, `<ad>.2` ... adıyla kenara çekilir; yeni satır boş bir
// dosyaya yazılmaya devam eder (appendFileSync dosyayı gerekirse yeniden oluşturur).
function rotateIfNeeded(filePath: string): void {
  let stat: fs.Stats;
  try {
    stat = fs.statSync(filePath);
  } catch {
    return;
  }
  if (stat.size < MAX_BYTES) return;
  let n = 1;
  while (fs.existsSync(`${filePath}.${n}`)) n += 1;
  fs.renameSync(filePath, `${filePath}.${n}`);
}

/**
 * `dir` verilmişse JSON satırları `agent-YYYY-MM-DD.log` dosyasına yazılır (7 günden eski
 * dosyalar kurulumda silinir, 5 MB'ta döndürülür); `dir = null` ise yalnızca konsola yazılır
 * ve hiçbir dosya sistemi hatası fırlatmaz — ajan diske yazamasa bile çalışmaya devam eder.
 */
export function createLogger(dir: string | null, now: () => Date = () => new Date()): Logger {
  if (dir) {
    fs.mkdirSync(dir, { recursive: true });
    cleanupOldLogs(dir, now());
  }

  const write = (level: 'info' | 'warn' | 'error', msg: string, data?: object): void => {
    const line = JSON.stringify({ t: now().toISOString(), level, msg, ...data });
    if (!dir) {
      if (level === 'error') console.error(line);
      else console.log(line);
      return;
    }
    try {
      const filePath = path.join(dir, fileNameFor(now()));
      rotateIfNeeded(filePath);
      fs.appendFileSync(filePath, `${line}\n`);
    } catch {
      // Diske yazılamıyorsa (disk dolu, izin yok…) ajan bunun yüzünden çökmez.
    }
  };

  return {
    info: (m, d) => write('info', m, d),
    warn: (m, d) => write('warn', m, d),
    error: (m, d) => write('error', m, d),
  };
}
