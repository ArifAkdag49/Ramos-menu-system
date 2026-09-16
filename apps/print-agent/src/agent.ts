import { renderTicket, type TicketPayload } from '@ramos/shared';
import { encodeLines } from './escpos';
import { blockingProblem, type PrinterState } from './status';
import { PrinterError } from './transport';

export interface AgentSettings { host: string; port: number; codepage: string; codepageNumber: number; transliterate: boolean }
export interface Job { id: string; type: string; payload: TicketPayload; attempts: number }
export interface Heartbeat { reachable: boolean; state: PrinterState | null; error: string | null }
export interface AgentApi {
  claim(): Promise<Job | null>;
  complete(id: string, ok: boolean, error?: string): Promise<void>;
  heartbeat(h: Heartbeat): Promise<void>;
  settings(): Promise<AgentSettings>;
  onJobs(cb: () => void): void;
  onSettings(cb: (s: AgentSettings) => void): void;
  close(): Promise<void>;
}
export interface PrinterPort {
  status(s: AgentSettings): Promise<PrinterState>;
  print(s: AgentSettings, bytes: Uint8Array): Promise<{ before: PrinterState; after: PrinterState }>;
}
export interface Logger { info(m: string, d?: object): void; warn(m: string, d?: object): void; error(m: string, d?: object): void }

export interface AgentOptions {
  pollMs?: number;
  heartbeatMs?: number;
  idleCheckMs?: number;
  /** C1: bir bilet fiziksel olarak basıldıktan sonra `complete(true)` kaç kez yeniden denenir. */
  completeRetries?: number;
  /** C1: `complete(true)` yeniden deneme aralıklarının tabanı (üstel, 30 sn'de tavanlanır). */
  completeRetryBaseMs?: number;
  /** I4: art arda `claim` hatalarında geri çekilmenin tabanı (üstel, 60 sn'de tavanlanır). */
  claimRetryBaseMs?: number;
  /** I2: `stop()` sürmekte olan bir `drain()` turunu en fazla bu kadar bekler. */
  stopGraceMs?: number;
}

const DEFAULT_OPTS: Required<AgentOptions> = {
  pollMs: 5000,
  heartbeatMs: 30000,
  idleCheckMs: 15000,
  completeRetries: 5,
  completeRetryBaseMs: 1000,
  claimRetryBaseMs: 5000,
  stopGraceMs: 10000,
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export class Agent {
  private opts: Required<AgentOptions>;
  private settings: AgentSettings | null = null;
  private reachable = false;
  private state: PrinterState | null = null;
  private lastError: string | null = null;
  private draining = false;
  private again = false;
  private timers: NodeJS.Timeout[] = [];
  private claimFailures = 0;
  private claimBackoffUntil = 0;

  constructor(
    private api: AgentApi,
    private deps: { printer: PrinterPort; log: Logger; now?: () => Date },
    opts: AgentOptions = {},
  ) {
    this.opts = { ...DEFAULT_OPTS, ...opts };
  }

  private now(): number {
    return (this.deps.now?.() ?? new Date()).getTime();
  }

  // C2: `start()`'ın kurduğu her zamanlayıcı/olay dinleyicisi `void this.drain()` gibi bir
  // ateşle-unut çağrısıdır; drain() (ya da checkPrinter/heartbeat) beklenmedik bir sebeple
  // reddederse bu, yakalanmamış bir Promise reddi olarak Node'u (varsayılan
  // --unhandled-rejections=throw ile) öldürür. Her ateşle-unut çağrısını burada geçirip
  // artık bir zincir çökse bile süreç ayakta kalır.
  private fireAndForget(p: Promise<unknown>, label: string): void {
    p.catch((e: unknown) => this.deps.log.error(`${label} beklenmeyen hata`, { e: String(e) }));
  }

  async start() {
    this.settings = await this.api.settings();
    this.api.onSettings((s) => {
      this.settings = s;
      this.deps.log.info('settings reloaded', { host: s.host });
      // I1: ayar değişikliği de checkPrinter'ı tetikler — baskı sürerken ikinci bir TCP
      // oturumu açmasın diye aynı boşta-mı kapısından geçer.
      this.fireAndForget(this.checkPrinterIfIdle(), 'checkPrinter');
    });
    this.api.onJobs(() => this.fireAndForget(this.drain(), 'drain'));
    await this.checkPrinter();
    await this.sendHeartbeat();
    this.timers.push(setInterval(() => this.fireAndForget(this.drain(), 'drain'), this.opts.pollMs));
    this.timers.push(setInterval(() => this.fireAndForget(this.checkPrinterIfIdle(), 'checkPrinter'), this.opts.idleCheckMs));
    this.timers.push(setInterval(() => this.fireAndForget(this.sendHeartbeat(), 'heartbeat'), this.opts.heartbeatMs));
    this.fireAndForget(this.drain(), 'drain');
  }

  async stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    // I2: Ctrl+C ya da Windows kapanışı gönderim ortasında `process.exit()`e giderse ESC/POS
    // akışı yarıda kesilir, iş `printing`de kalır ve 60 sn sonra yeniden basılır. Sürmekte
    // olan bir turu sınırlı bir süre bekleriz; süre dolarsa yine de kapatırız (spec'in kabul
    // ettiği 60 sn'lik reclaim devreye girer).
    const deadline = this.now() + this.opts.stopGraceMs;
    while (this.draining && this.now() < deadline) {
      await sleep(25);
    }
    if (this.draining) {
      this.deps.log.warn('kapanışta sürmekte olan baskı turu zaman aşımına uğradı', { stopGraceMs: this.opts.stopGraceMs });
    }
    await this.api.close();
  }

  async checkPrinter(): Promise<void> {
    if (!this.settings) {
      try {
        this.settings = await this.api.settings();
      } catch (e) {
        // C2: ayarlar okunamazsa (ör. açılışta ağ henüz hazır değil) bu da fırlamamalı.
        this.reachable = false;
        this.state = null;
        this.lastError = e instanceof Error ? e.message : String(e);
        return;
      }
    }
    if (!this.settings.host) {
      this.reachable = false;
      this.state = null; // M4: eski durum heartbeat'te yanlışlıkla taşınmasın
      this.lastError = 'printer_host_missing';
      return;
    }
    try {
      this.state = await this.deps.printer.status(this.settings);
      this.reachable = true;
      this.lastError = blockingProblem(this.state);
      // Sorun düzelince bekleyenler bir sonraki 5 sn'lik drain turunda basılır; burada drain tetiklenmez (yarış yok).
    } catch (e) {
      this.reachable = false;
      this.state = null;
      this.lastError = e instanceof PrinterError ? e.code : String(e);
    }
  }

  // I1: spec §10.3.3/§6 — yazıcı aynı anda tek TCP oturumu kabul eder. `printWithChecks`
  // ön-kontrol + gönderim + son-kontrolü TEK bağlantıda yürütür; `drain()` sürerken (`this.draining`)
  // otomatik/olay-tetiklemeli bir durum sorgusu İKİNCİ bir bağlantı açıp gerçek yazıcıda
  // reddedilebilir (sahte yazıcı eşzamanlı bağlantı kabul ettiği için bunu ASLA göstermez).
  // Elle çağrılan `checkPrinter()` (testler, CLI `status`) bu kapıdan geçmez — yalnız
  // otomatik tetikleyiciler (boşta zamanlayıcısı, ayar değişikliği) bunu kullanır.
  async checkPrinterIfIdle(): Promise<void> {
    if (this.draining) return;
    await this.checkPrinter();
  }

  async sendHeartbeat() {
    try {
      await this.api.heartbeat({ reachable: this.reachable, state: this.state, error: this.lastError });
    } catch (e) {
      this.deps.log.warn('heartbeat failed', { e: String(e) });
    }
  }

  private printerReady(): boolean {
    return !!this.settings?.host && this.reachable && !!this.state && !blockingProblem(this.state);
  }

  // C1: bir bilet `printer.print()`den başarıyla döndüyse bayt zaten yazıcıya gitmiştir —
  // spec §10.3.4 bu noktadan sonra işin HER ZAMAN `printed` sayılmasını ister (çift baskı
  // riskine girilmez). Bu yüzden buradan sonra tek izinli çağrı `complete(id, true)`dur;
  // ağ sorunuyla başarısız olursa `complete(id, false, ...)`e asla düşülmez, yalnız
  // (üstel, 30 sn'de tavanlı) geri çekilmeyle yeniden denenir. `job_not_printing` zaten
  // `api.ts`de yutulup normal dönüş sayıldığından burada da "başarı" olarak görünür.
  // Tüm denemeler tükenirse iş `printing` durumunda kalır; spec'in kabul ettiği 60 sn'lik
  // `claim_print_job` reclaim'i devralır.
  private async completeSuccessWithRetry(jobId: string): Promise<void> {
    for (let attempt = 0; ; attempt++) {
      try {
        await this.api.complete(jobId, true, undefined);
        return;
      } catch (e) {
        if (attempt >= this.opts.completeRetries) {
          this.deps.log.error('basılan işi kapatma tüm denemelerde başarısız oldu — iş printing kalacak, 60 sn sonra yeniden ele alınacak', {
            job: jobId,
            e: String(e),
          });
          return;
        }
        const backoff = Math.min(this.opts.completeRetryBaseMs * 2 ** attempt, 30000);
        this.deps.log.warn('basılan işi kapatma başarısız, yeniden denenecek', { job: jobId, attempt, backoff, e: String(e) });
        await sleep(backoff);
      }
    }
  }

  // Yalnız BAŞARISIZ bir işi (kodlama hatası ya da gönderim hatası — bayt hiç gitmedi ya da
  // yazıcı sorunu bildirdi) `false` ile kapatmak için kullanılır. Bu çağrı da başarısız
  // olursa (C2) fırlatmaz; iş `printing` kalır ve yine 60 sn'lik reclaim devralır.
  private async completeFailure(jobId: string, msg: string): Promise<void> {
    try {
      await this.api.complete(jobId, false, msg);
    } catch (e) {
      this.deps.log.error('başarısız işi kapatma da başarısız oldu', { job: jobId, e: String(e) });
    }
  }

  async drain(): Promise<number> {
    if (this.draining) { this.again = true; return 0; }
    this.draining = true;
    let printed = 0;
    try {
      do {
        this.again = false;
        while (this.printerReady()) {
          // I4: art arda claim hatalarında sabit 5 sn'lik yoklama yerine üstel geri çekilme —
          // uzun bir kesinti boyunca dakikada 12 başarısız RPC göndermeyelim.
          if (this.now() < this.claimBackoffUntil) break;

          let job: Job | null;
          try {
            job = await this.api.claim();
            this.claimFailures = 0;
          } catch (e) {
            // C2: claim() `try` dışında kalıp reddederse (eski hâl) her `void this.drain()`
            // çağrısı yakalanmamış bir red olurdu — burada yakalanıp geri çekilme uygulanır.
            this.claimFailures += 1;
            const backoff = Math.min(this.opts.claimRetryBaseMs * 2 ** (this.claimFailures - 1), 60000);
            this.claimBackoffUntil = this.now() + backoff;
            this.deps.log.error('claim_print_job başarısız — geri çekiliyor', { e: String(e), backoffMs: backoff });
            break;
          }
          if (!job) break;
          const s = this.settings!;

          // M6: kodlama hatası (ör. ayarlardaki codepage/codepageNumber uyuşmazlığı) bir
          // yazıcı sorunu DEĞİLDİR — checkPrinter() tetiklemez, ve tek bir bozuk iş kuyruktaki
          // diğer işleri bu turda durdurmaz (bir sonraki işe geçilir).
          let bytes: Uint8Array;
          try {
            bytes = encodeLines(
              renderTicket(job.payload, { transliterate: s.transliterate }),
              { codepage: s.codepage, codepageNumber: s.codepageNumber },
            );
          } catch (e) {
            const msg = `encode_error: ${String(e)}`;
            await this.completeFailure(job.id, msg);
            this.deps.log.error('kodlama hatası — yazıcı sorunu değil, sıradaki işe geçiliyor', { job: job.id, msg });
            continue;
          }

          let sent: { after: PrinterState };
          try {
            sent = await this.deps.printer.print(s, bytes);
          } catch (e) {
            // Bayt gitmedi (ya da yazıcı bir sorun bildirdi) — bu iş gerçekten başarısızdır.
            const msg = e instanceof PrinterError ? `${e.code}: ${e.message}` : `print_error: ${String(e)}`;
            await this.completeFailure(job.id, msg);
            this.deps.log.error('print failed', { job: job.id, msg });
            await this.checkPrinter();
            return printed;
          }

          // C1: buradan sonra bayt kesin gitti — tek izinli sonraki çağrı complete(true)'dur.
          this.state = sent.after;
          printed++;
          this.deps.log.info('printed', { job: job.id, type: job.type });
          await this.completeSuccessWithRetry(job.id);
        }
      } while (this.again);
    } catch (e) {
      // C2: burada yakalanmamış herhangi bir hata `void this.drain()` çağıranları için
      // yakalanmamış bir red olurdu; son bir güvenlik ağı olarak loglanır.
      this.deps.log.error('drain() beklenmeyen hata', { e: String(e) });
    } finally {
      this.draining = false;
    }
    return printed;
  }
}
