import { markCriticalWork } from '../../lib/busy';
import { bytesToBase64 } from '../../native/base64';
import type { RamosPrinterPlugin, RamosPrinterSendResult } from '../../native/capacitor';
import type { StationSnapshot } from './stationStore';
import {
  isUnreachableError,
  jobToBytes,
  sendErrorText,
  shouldRetryComplete,
  stateFromHex,
  type PrintJobRow,
  type StationPrinterConfig,
} from './stationLogic';

/**
 * Tablet yazıcı istasyonunun iş döngüsü — yazdırma ajanının (`apps/print-agent/src/agent.ts`)
 * tarayıcıdaki karşılığı, aynı güvenlik kurallarıyla:
 *
 * - **Tek uçuş:** aynı anda tek `drain`; yeni sinyal gelirse tur bitince bir kez daha döner.
 * - **Yazıcı kilidi:** baskı ve durum yoklaması aynı anda yazıcıya bağlanmaz (R69). Kilit modül
 *   düzeyindedir: durdurulup yeniden başlatılan (sekme gizlendi/göründü) iki döngü de onu paylaşır.
 * - **Bayt gittiyse** tek izinli sonraki çağrı `complete(ok=true)`'dur ve iş bizim olduğu sürece
 *   yeniden denenir (çift fiş olmasın — R68). Döngü durdurulsa bile bu deneme sürer.
 * - Kodlama hatası yazıcı sorunu değildir: iş başarısız kapatılır, sıradakine geçilir (M6).
 * - Yazıcı hatasında iş başarısız kapatılır (sunucu 5/15/30… sn geri çekilir) ve bu tur biter.
 * - Art arda sahiplenme hatasında üstel geri çekilme (I4).
 */

export interface StationRunnerDeps {
  stationId: string;
  version: string;
  printer: RamosPrinterPlugin;
  rpc: <T>(fn: string, args: Record<string, unknown>) => Promise<T>;
  /** Güncel ayarlardan yazıcı bilgisi (her turda yeniden okunur). */
  getConfig: () => StationPrinterConfig | null;
  /** Realtime `print-jobs` sinyali; döndürdüğü fonksiyon aboneliği kapatır. */
  subscribeJobs?: (onSignal: () => void) => () => void;
  onChange: (patch: Partial<StationSnapshot>) => void;
  now?: () => number;
  log?: (message: string, detail?: unknown) => void;
}

export interface StationRunnerOptions {
  pollMs?: number;
  heartbeatMs?: number;
  sendTimeoutMs?: number;
  statusTimeoutMs?: number;
  completeRetryBaseMs?: number;
  claimRetryBaseMs?: number;
}

const DEFAULTS: Required<StationRunnerOptions> = {
  pollMs: 5_000,
  heartbeatMs: 30_000,
  sendTimeoutMs: 10_000,
  statusTimeoutMs: 3_000,
  completeRetryBaseMs: 1_000,
  claimRetryBaseMs: 5_000,
};

let printerMutex: Promise<unknown> = Promise.resolve();

function withPrinterLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = printerMutex.then(fn, fn);
  printerMutex = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class StationRunner {
  private readonly opts: Required<StationRunnerOptions>;
  private stopped = true;
  private draining = false;
  private again = false;
  private timers: ReturnType<typeof setInterval>[] = [];
  private unsubscribe: (() => void) | null = null;
  private claimFailures = 0;
  private claimBackoffUntil = 0;
  private failures = 0;
  private lastError: string | null = null;

  private readonly deps: StationRunnerDeps;

  constructor(deps: StationRunnerDeps, opts: StationRunnerOptions = {}) {
    this.deps = deps;
    this.opts = { ...DEFAULTS, ...opts };
  }

  get running(): boolean {
    return !this.stopped;
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now();
  }

  private fire(p: Promise<unknown>, label: string): void {
    p.catch((e: unknown) => this.deps.log?.(`${label} beklenmeyen hata`, e));
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this.deps.onChange({ running: true });
    try {
      this.unsubscribe = this.deps.subscribeJobs?.(() => this.fire(this.drain(), 'drain')) ?? null;
    } catch (e) {
      // Realtime açılamazsa yoklama yeterli (5 sn).
      this.deps.log?.('print-jobs aboneliği açılamadı', e);
    }
    this.timers.push(setInterval(() => this.fire(this.drain(), 'drain'), this.opts.pollMs));
    this.timers.push(
      setInterval(() => this.fire(this.heartbeat(), 'heartbeat'), this.opts.heartbeatMs),
    );
    this.fire(this.heartbeat(), 'heartbeat');
    this.fire(this.drain(), 'drain');
  }

  /** Yeni iş sahiplenmeyi bırakır. Elindeki iş (varsa) ve onun onayı sürer. */
  stop(): void {
    if (this.stopped) return;
    this.stopped = true;
    this.timers.forEach(clearInterval);
    this.timers = [];
    try {
      this.unsubscribe?.();
    } catch {
      /* kanal zaten kapalı */
    }
    this.unsubscribe = null;
    this.deps.onChange({ running: false, reachable: null });
  }

  private recordFailure(message: string, patch: Partial<StationSnapshot> = {}): void {
    this.failures += 1;
    this.lastError = message;
    this.deps.onChange({ failures: this.failures, lastError: message, ...patch });
  }

  async drain(): Promise<number> {
    if (this.draining) {
      this.again = true;
      return 0;
    }
    this.draining = true;
    // Baskı sürerken yeni sürüm devreye alınıp sayfa yenilenmesin: sahiplenilmiş iş 60 sn geri
    // alınana kadar basılmamış kalırdı (`pwa/updateGate`).
    const releaseCritical = markCriticalWork();
    let printed = 0;
    try {
      do {
        this.again = false;
        while (!this.stopped) {
          const cfg = this.deps.getConfig();
          if (!cfg) {
            this.deps.onChange({ missingPrinter: true });
            break;
          }
          this.deps.onChange({ missingPrinter: false });
          if (this.now() < this.claimBackoffUntil) break;

          let job: PrintJobRow | undefined;
          try {
            const rows = await this.deps.rpc<PrintJobRow[] | null>('station_claim_print_job', {
              p_station_id: this.deps.stationId,
            });
            job = rows?.[0];
            this.claimFailures = 0;
          } catch (e) {
            this.claimFailures += 1;
            const backoff = Math.min(
              this.opts.claimRetryBaseMs * 2 ** (this.claimFailures - 1),
              60_000,
            );
            this.claimBackoffUntil = this.now() + backoff;
            this.recordFailure(`claim_error: ${e instanceof Error ? e.message : String(e)}`);
            break;
          }
          if (!job) break;

          let bytes: Uint8Array;
          try {
            bytes = jobToBytes(job.payload, cfg);
          } catch (e) {
            const msg = `encode_error: ${e instanceof Error ? e.message : String(e)}`;
            this.recordFailure(msg);
            await this.completeFailure(job.id, msg);
            continue;
          }

          const res = await withPrinterLock(() => this.send(cfg, bytes));
          if (!res.ok) {
            const msg = sendErrorText(res);
            this.recordFailure(msg, { reachable: !isUnreachableError(res.error) });
            await this.completeFailure(job.id, msg);
            break;
          }

          // Bayt gitti: buradan sonra yalnız complete(true).
          printed += 1;
          this.failures = 0;
          this.lastError = null;
          this.deps.onChange({
            reachable: true,
            lastPrintedAt: this.now(),
            failures: 0,
            lastError: null,
          });
          await this.completeSuccessWithRetry(job.id);
        }
      } while (this.again && !this.stopped);
    } catch (e) {
      this.deps.log?.('drain beklenmeyen hata', e);
    } finally {
      this.draining = false;
      releaseCritical();
    }
    return printed;
  }

  /** Sözleşme gereği eklenti reddetmez; yine de reddederse ya da yoksa bağlantı hatası sayılır. */
  private async send(
    cfg: StationPrinterConfig,
    bytes: Uint8Array,
  ): Promise<RamosPrinterSendResult> {
    try {
      const res = await this.deps.printer.send({
        host: cfg.host,
        port: cfg.port,
        data: bytesToBase64(bytes),
        timeoutMs: this.opts.sendTimeoutMs,
        checkStatus: true,
      });
      return res ?? { ok: false, error: 'io', message: 'no_response' };
    } catch (e) {
      return { ok: false, error: 'io', message: e instanceof Error ? e.message : String(e) };
    }
  }

  private async completeFailure(jobId: string, message: string): Promise<void> {
    try {
      await this.deps.rpc('station_complete_print_job', {
        p_job_id: jobId,
        p_ok: false,
        p_error: message,
        p_station_id: this.deps.stationId,
      });
    } catch (e) {
      // Kapatılamadıysa sunucu işi 60 sn sonra geri alır ve yeniden dener.
      this.deps.log?.('station_complete_print_job (hata) yazılamadı', e);
    }
  }

  private async completeSuccessWithRetry(jobId: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.deps.rpc('station_complete_print_job', {
          p_job_id: jobId,
          p_ok: true,
          p_error: null,
          p_station_id: this.deps.stationId,
        });
        return;
      } catch (e) {
        if (!shouldRetryComplete(e)) {
          this.deps.log?.('basılan iş kapatılamadı (artık bu istasyonun değil)', e);
          return;
        }
        await sleep(Math.min(this.opts.completeRetryBaseMs * 2 ** attempt, 30_000));
      }
    }
  }

  /** Yazıcı durumunu yoklar (baskıyla çakışmadan) ve `station_heartbeat` yazar. Asla fırlatmaz. */
  async heartbeat(): Promise<void> {
    if (this.stopped) return;
    const cfg = this.deps.getConfig();
    let reachable = false;
    let state = null;
    let message: string | undefined;
    if (cfg) {
      try {
        const res = await withPrinterLock(() =>
          this.deps.printer.status({
            host: cfg.host,
            port: cfg.port,
            timeoutMs: this.opts.statusTimeoutMs,
          }),
        );
        reachable = res?.reachable === true;
        state = stateFromHex(res?.status);
        message = res?.message;
      } catch (e) {
        message = e instanceof Error ? e.message : String(e);
      }
      if (!this.stopped) this.deps.onChange({ reachable, missingPrinter: false });
    } else {
      this.deps.onChange({ missingPrinter: true });
    }

    const error =
      this.lastError ??
      (!cfg ? 'no_printer_config' : reachable ? null : `offline: ${message?.trim() || 'offline'}`);
    try {
      await this.deps.rpc('station_heartbeat', {
        p_station_id: this.deps.stationId,
        p_version: this.deps.version,
        p_host: cfg ? `${cfg.host}:${cfg.port}` : '',
        p_reachable: reachable,
        p_state: state,
        p_error: error,
      });
    } catch (e) {
      this.deps.log?.('station_heartbeat yazılamadı', e);
    }
  }
}
