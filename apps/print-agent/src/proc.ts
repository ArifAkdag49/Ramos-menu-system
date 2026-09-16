import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

/**
 * Tek örnek kilidindeki PID'in HÂLÂ aynı ajan olup olmadığını anlamak için toplanan bilgi.
 * `null` "bilinmiyor" demektir ve hiçbir zaman "hayır" yerine geçmez.
 */
export interface ProcessProbe {
  /** Süreç başlangıç zamanı (platforma özgü birim — karşılaştırma dışında anlamı yok). */
  startTime: number | null;
  /** Süreç gerçekten yazdırma ajanı mı; anlaşılamıyorsa `null`. */
  isAgent: boolean | null;
}

/** Platform sorgularının test edilebilir olması için dışarıdan verilen G/Ç. */
export interface ProcIo {
  readText(path: string): string | null;
  powershell(command: string): string | null;
}

const AGENT_MARKER = 'ramos-agent';

/**
 * Linux `/proc/<pid>/stat` dosyasının 22. alanını (starttime) çözer.
 * 2. alan (`comm`) parantez içindedir ve BOŞLUK ile PARANTEZ içerebilir ("(ramos agent (x))"),
 * bu yüzden ayrıştırma son `)` karakterinden sonra başlar: oradan sonraki ilk alan 3. alandır.
 */
export function parseProcStatStartTime(stat: string): number | null {
  const close = stat.lastIndexOf(')');
  if (close < 0) return null;
  const rest = stat.slice(close + 1).trim();
  if (rest === '') return null;
  const fields = rest.split(/\s+/); // fields[0] = 3. alan (state) → 22. alan = fields[19]
  const raw = fields[19];
  if (raw === undefined || !/^\d+$/.test(raw)) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** `/proc/<pid>/cmdline` NUL ile ayrılmış argümanlar taşır; ajan paketinin adını arar. */
export function procCmdlineIsAgent(cmdline: string): boolean {
  return cmdline.split('\0').some((arg) => arg.includes(AGENT_MARKER));
}

export const defaultProcIo: ProcIo = {
  readText(path) {
    try {
      return fs.readFileSync(path, 'utf8');
    } catch {
      return null;
    }
  },
  powershell(command) {
    try {
      return execFileSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', command], {
        encoding: 'utf8',
        timeout: 3000,
      });
    } catch {
      return null;
    }
  },
};

/**
 * Bir PID'in kimliğini platforma uygun biçimde yoklar.
 *
 * R85 (Görev 20, inceleme turu 1): Linux'ta eskiden HİÇBİR bilgi toplanmıyordu ve
 * `startTime === null` "aynı süreç" sayıldığı için kilit kalıcı biçimde fail-closed
 * olabiliyordu — SIGKILL/elektrik kesintisinden kalan PID Raspberry Pi'de yeniden açılışta
 * başka bir daemon'a düşerse ajan bir daha ASLA başlamaz (`Restart=always` sonsuz döner,
 * hiç fiş basılmaz, kimse fark etmez). Artık `/proc` okunur.
 */
export function probeProcess(pid: number, platform: NodeJS.Platform, io: ProcIo): ProcessProbe {
  if (platform === 'linux') {
    const stat = io.readText(`/proc/${pid}/stat`);
    const cmdline = io.readText(`/proc/${pid}/cmdline`);
    return {
      startTime: stat === null ? null : parseProcStatStartTime(stat),
      isAgent: cmdline === null ? null : procCmdlineIsAgent(cmdline),
    };
  }
  if (platform === 'win32') {
    // Windows'ta komut satırını okumak ikinci bir WMI sorgusu demek; başlangıç zamanı
    // karşılaştırması tek başına PID yeniden kullanımını zaten ayırt ediyor.
    const out = io.powershell(`(Get-Process -Id ${pid} -ErrorAction Stop).StartTime.ToFileTimeUtc()`);
    const trimmed = out?.trim() ?? '';
    if (trimmed === '' || !/^\d+$/.test(trimmed)) return { startTime: null, isAgent: null };
    return { startTime: Number(trimmed), isAgent: null };
  }
  return { startTime: null, isAgent: null };
}

/**
 * Kilit dosyasındaki süreç hâlâ aynı ajan mı?
 *
 * Sıralama önemli: "bu süreç KESİNLİKLE ajan değil" bilgisi, eksik başlangıç zamanının
 * yarattığı güvenli-taraf varsayımını ezer — aksi hâlde R85'teki kalıcı kilitlenme sürerdi.
 * Hiçbir bilgi yoksa `true` döneriz (başlatmayı reddeder): iki ajanın aynı anda kuyruktan iş
 * kapması, geç başlamaktan çok daha pahalıdır.
 */
export function isSameAgentProcess(lockStartTime: number | null, probe: ProcessProbe): boolean {
  if (probe.isAgent === false) return false;
  if (lockStartTime === null || probe.startTime === null) return true;
  return lockStartTime === probe.startTime;
}
