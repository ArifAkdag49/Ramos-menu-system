import { type TicketPayload } from '@ramos/shared';
import { renderTicketForPrinter } from './ascii';
import { encodeLines } from './escpos';
import { blockingProblem, type PrinterState } from './status';
import { PrinterError } from './transport';

export interface AgentSettings { host: string; port: number; codepage: string; codepageNumber: number; transliterate: boolean; ascii?: boolean }
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
  /**
   * R68 (review fix round 2 — NEW-1): bir bilet fiziksel olarak basıldıktan sonra
   * `complete(true)` yeniden deneme aralıklarının tabanı (üstel, 30 sn'de tavanlanır).
   * Deneme sayısı KASITLI OLARAK sınırsızdır — bkz. `completeSuccessWithRetry`.
   */
  completeRetryBaseMs?: number;
  /** I4: art arda `claim` hatalarında geri çekilmenin tabanı (üstel, 60 sn'de tavanlanır). */
  claimRetryBaseMs?: number;
}

const DEFAULT_OPTS: Required<AgentOptions> = {
  pollMs: 5000,
  heartbeatMs: 30000,
  idleCheckMs: 15000,
  completeRetryBaseMs: 1000,
  claimRetryBaseMs: 5000,
};

// R68: bir bilet basıldıktan sonra onu kapatma denemesi bu süreden (60 sn — `claim_print_job`'ın
// stale-`printing` reclaim eşiği) uzun sürerse tek seferlik bir `error` seviyesinde uyarı basılır
// (görünürlük için); deneme SÜRMEYE DEVAM EDER — asla vazgeçilmez.
const STALE_CONFIRMATION_WARN_MS = 60000;

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
  /** R70(a) (review fix round 3): `stop()` çağrıldığı andan itibaren true — `drain()` bu
   *  bayrak true iken YENİ bir iş sahiplenmez (elindeki işi, varsa, sonuna kadar işler).
   *  Böylece kapanış süresi kuyruğun derinliğine değil, yalnız elindeki tek işe + onun
   *  onayına bağlı kalır (bkz. `stop`). */
  private stopping = false;
  /** Yalnız gerçek `printer.print()` ağ çağrısı sürerken true — `checkPrinterIfIdle`'ın
   *  gereksiz yere atlamaması için `draining`'den AYRI tutulur: `completeSuccessWithRetry`
   *  sürerken (yalnız Supabase'e `complete` RPC'si deneniyor) yazıcı fiilen boştadır, bu
   *  yüzden `draining` yerine bu dar bayrak kullanılır (R70 minor). */
  private printerBusy = false;
  private timers: NodeJS.Timeout[] = [];
  private claimFailures = 0;
  private claimBackoffUntil = 0;
  /** R68/NEW-3: basılmış ama henüz `complete(true)` ile doğrulanmamış iş sayısı — `stop()` bu
   *  sıfıra dönene kadar süresiz bekler (bkz. `completeSuccessWithRetry`, `stop`). */
  private pendingConfirmations = 0;
  /** R69: yazıcıya dokunan İKİ işlem (`checkPrinter`'ın durum sorgusu, `drain`'in gönderimi)
   *  aynı anda ASLA çalışmasın diye tutulan gerçek bir mutex — bkz. `withPrinterLock`. */
  private printerMutex: Promise<unknown> = Promise.resolve();
  /** M3 (review fix round 4): `stop()`'un art arda çağrılmalarını TEK bir çalışmaya indirger —
   *  bkz. `stop`. */
  private stopPromise: Promise<void> | null = null;
  /** M5 (review fix round 4): şu an sürmekte olan bir onay yeniden denemesi
   *  `STALE_CONFIRMATION_WARN_MS`'i aştıysa bu, o denemenin başlangıç zamanıdır (yoksa `null`).
   *  `sendHeartbeat`'in hata alanına yansıtılır — bu yalnız DB'ye yazılan `agent_heartbeat.error`
   *  alanıdır; operatörün bunu bir ekranda GÖRMESİ Görev 21'e bağlıdır (bkz. R79, round-5 notu,
   *  task-19-report.md). M-f (round 5): TEK alanlı ve `completeSuccessWithRetry`'nin `finally`
   *  bloğunda KOŞULSUZ temizlenir — bugün güvenlidir çünkü `drain()` tek-uçuşludur (aynı anda
   *  yalnız BİR `completeSuccessWithRetry` çalışır); ileride birden çok işin PARALEL basılması
   *  eklenirse (bugün YOK) bu alan bir işin işaretini bir diğerininkiyle EZEBİLİR — o zaman
   *  `Map<jobId, number>` gibi iş-başına bir yapıya geçirilmesi gerekir. */
  private stuckConfirmationSince: number | null = null;

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

  // R69 (review fix round 2 — NEW-2): `checkPrinterIfIdle`'ın `this.draining` bayrağı TEK
  // YÖNLÜYDÜ — yalnız "baskı sürerken durum sorgusu başlamasın" durumunu kapatıyordu. Ters yönde
  // bir pencere kalıyordu: `checkPrinter()` `printer.status()`'u beklerken hiçbir bayrak
  // ayarlanmıyordu, `drain()`'in `printerReady()` kontrolü ESKİ (await'ten önceki) durumu
  // okuyup `true` dönebiliyor ve `printWithChecks` İKİNCİ bir TCP bağlantısı açabiliyordu —
  // tam olarak spec §10.3.3/§6'nın yasakladığı şey. Gerçek bir mutex (Promise zinciri) bunu
  // her iki sırada da (durum→baskı, baskı→durum) imkânsız kılar: `fn`, yalnız bir öncekinin
  // TAMAMLANMASINDAN (başarı ya da hata fark etmez) SONRA çalışır.
  private withPrinterLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.printerMutex.then(fn, fn);
    this.printerMutex = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  async start() {
    // M-b (review fix round 5): ÖNCEKİ bir `stop()` hâlâ sürüyorsa (`this.stopPromise` henüz
    // çözülmediyse) burada bayrakları sıfırlayıp devam etmek bir yarış açardı — eski
    // `stopInternal()` sonradan (kendi bekleme döngüsü bitince) `api.close()`'u çağırıp bu
    // `start()`'ın az önce kurduğu YENİ kanalları da siler ve `signOut` yapar: ajan "çalışıyor"
    // görünür ama Realtime ölür, geriye yalnız `pollMs`'lik (5 sn) yoklama kalır. Önce ESKİ
    // kapanışın TAMAMEN bitmesi beklenir, ancak ondan SONRA yeni bir döngü başlatılır.
    if (this.stopPromise) await this.stopPromise;
    // M2 (review fix round 4): `stop()` sonrası aynı `Agent` örneği yeniden `start()` edilebilir
    // olsun diye kapanış bayrakları burada sıfırlanır — aksi hâlde `stopping` kalıcı olarak
    // true kalır ve `drain()` bir daha ASLA iş sahiplenmez (cli.ts her süreçte yeni bir `Agent`
    // kurduğundan üretimde etkisi yok, ama sınıfın kendisi tek-kullanımlık bir tuzak olurdu).
    this.stopping = false;
    this.stopPromise = null;
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

  // R70(b)/M1 (review fix round 3, sabitlendi round 4'te): `api.close()`'u çağırmadan ÖNCE
  // beklemeyi sürdürmemiz gereken TEK koşul. Bilinçli olarak `stop()`'un `while` döngüsünden
  // AYRI, adlandırılmış ve doğrudan test edilebilir bir fonksiyon: eski (round-2) hâl bunu iki
  // AYRI, SIRALI döngüde kontrol ediyordu — ilki yalnız `pendingConfirmations === 0` iken
  // `draining`i bekliyor, `pendingConfirmations > 0`a döner dönmez (hâlâ `draining` olsa bile!)
  // o döngüden çıkıp yalnız `pendingConfirmations`ı izleyen İKİNCİ bir döngüye geçiyordu — o
  // ikinci döngü `draining`i BİR DAHA HİÇ kontrol etmiyordu. Burada iki koşul HER ÇAĞRIDA
  // birlikte değerlendirilir; `stop()`'un döngüsü bu fonksiyonu her pollda yeniden çağırır.
  private shouldKeepWaitingBeforeClose(): boolean {
    return this.draining || this.pendingConfirmations > 0;
  }

  async stop(): Promise<void> {
    // M3 (review fix round 4): `stop()` art arda (ör. ikinci bir SIGINT ile) çağrılırsa
    // `api.close()`'un yalnız BİR kez çalışması için çalışma belleğe alınır — bkz. `cli.ts`'teki
    // `createShutdownHandler` (M4), o da ikinci sinyalde bu memoize edilmiş söze "katılır".
    if (this.stopPromise) return this.stopPromise;
    this.stopPromise = this.stopInternal();
    return this.stopPromise;
  }

  private async stopInternal(): Promise<void> {
    // R70(a) (review fix round 3): bu andan itibaren `drain()` artık YENİ iş sahiplenmez —
    // yalnız elindeki işi (varsa) sonuna kadar işler. Kapanış süresi böylece kuyruğun
    // derinliğine değil, tek bir işe + onun onayına bağlı kalır.
    this.stopping = true;
    this.timers.forEach(clearInterval);
    this.timers = [];
    // R72 (review fix round 4, I-1): round 3, eski `stopGraceMs` uyarılarını sildi ve yerine
    // hiçbir şey koymadı — kapanış beklemesi artık süresiz VE tam olarak çift-fiş riskinin en
    // yüksek olduğu pencerede (basılmış-ama-onaylanmamış iş) log'da tek satır yoktu. Şimdi
    // bekleme başlarken BİR kez, sonra ~10 sn'de bir tekrar loglanır (her 25 ms'de değil —
    // log'u boğmamak için).
    const waitStartedAt = this.now();
    let lastLoggedAt = waitStartedAt;
    this.deps.log.info('kapanış bekleniyor', { draining: this.draining, pendingConfirmations: this.pendingConfirmations });
    while (this.shouldKeepWaitingBeforeClose()) {
      await sleep(25);
      if (this.now() - lastLoggedAt >= 10000) {
        lastLoggedAt = this.now();
        this.deps.log.info('kapanış bekleniyor', { draining: this.draining, pendingConfirmations: this.pendingConfirmations });
      }
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
      const settings = this.settings;
      this.state = await this.withPrinterLock(() => this.deps.printer.status(settings));
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
    // R70 minor (review fix round 3): eskiden `this.draining`e bakılıyordu — bu, bir bilet
    // basıldıktan sonra `completeSuccessWithRetry` Supabase'e `complete` RPC'sini yeniden
    // denerken de (yazıcı fiilen boşta, TCP'ye hiç dokunulmuyor) durum sorgusunu atlıyor,
    // heartbeat'in uzun bir onay kesintisi boyunca bayat durum bildirmesine yol açıyordu. Dar
    // `printerBusy` bayrağı yalnız gerçek `printer.print()` ağ çağrısı sürerken true'dur.
    if (this.printerBusy) return;
    await this.checkPrinter();
  }

  // M5 (review fix round 4), düzeltildi R79 (round 5 — yanlış iddia): `completeSuccessWithRetry`
  // kalıcı bir hatayı (ör. `job_not_found`, bir rol/izin regresyonu) geçici bir ağ kesintisinden
  // AYIRMIYOR — böyle bir durum olursa (olasılığı düşük) yeniden deneme SESSİZCE sonsuza dek
  // sürer ve heartbeat bu süre boyunca (yazıcı sorunsuzsa) sağlıklı durum bildirmeye devam eder:
  // operatör için görünmez bir fiş kaybı riski. Ucuz bir kısmi önlem: 60 sn eşiğini aşan bir onay
  // `stuckConfirmationSince` ile işaretlenir, heartbeat'in hata alanına (yazıcı durumunu
  // EZMEDEN, yanına eklenerek) yansır — YALNIZ `agent_heartbeat.error` DB SÜTUNUNA yazılır.
  // R79 (round-5 re-review düzeltmesi): round-4 raporu bunun "KDS/admin ekranında görünür olur"
  // dediği YANLIŞTI — incelemeci doğruladı: `apps/web`'de `printer_status.last_error`'ı okuyup
  // render eden HİÇBİR yer yok (`derivePrinterProblem()` bu alanı hiç okumuyor). Operatör
  // görünürlüğü Görev 21'e (admin canlı durum, spec §8.4) TAŞINDI — kontrolör bunu o görevin
  // gereksinimlerine ekledi. Bu turda tek görünürlük hâlâ ajan LOG'udur (`STALE_CONFIRMATION_WARN_MS`
  // uyarısı) — DB alanı yazılıyor ama şu an kimse okumuyor. Kalıcı/geçici hata ayrımının kendisi
  // bu turun kapsamı dışında bırakıldı (aşağıdaki `Karar` satırına bkz.).
  private heartbeatError(): string | null {
    if (this.stuckConfirmationSince === null) return this.lastError;
    const stuckSeconds = Math.max(0, Math.round((this.now() - this.stuckConfirmationSince) / 1000));
    return this.lastError ? `complete_stuck_${stuckSeconds}s;${this.lastError}` : `complete_stuck_${stuckSeconds}s`;
  }

  async sendHeartbeat() {
    try {
      await this.api.heartbeat({ reachable: this.reachable, state: this.state, error: this.heartbeatError() });
    } catch (e) {
      this.deps.log.warn('heartbeat failed', { e: String(e) });
    }
  }

  private printerReady(): boolean {
    return !!this.settings?.host && this.reachable && !!this.state && !blockingProblem(this.state);
  }

  // C1/R68 (review fix round 2 — NEW-1): bir bilet `printer.print()`den başarıyla döndüyse
  // bayt zaten yazıcıya gitmiştir — spec §10.3.4 bu noktadan sonra işin HER ZAMAN `printed`
  // sayılmasını ister (çift baskı riskine girilmez). Bu yüzden buradan sonra tek izinli çağrı
  // `complete(id, true)`dur; ağ sorunuyla başarısız olursa `complete(id, false, ...)`e asla
  // düşülmez. R68 ile bu deneme artık SINIRSIZDIR (süreç yaşadığı sürece): eski sınırlı deneme
  // (varsayılan 5 deneme, ~31 sn) `claim_print_job`'ın 60 sn'lik stale-`printing` reclaim
  // penceresinden KISA olduğundan, 31-60 sn arası bir kesinti tam olarak "vazgeçilip iş
  // printing'de bırakılır → 60 sn'de reclaim edilir → İKİNCİ KEZ BASILIR" senaryosunu
  // üretiyordu — bu güvenli, çünkü `job_not_printing` zaten `api.ts`de yutulup normal dönüş
  // sayılıyor: iş gerçekten başka bir ajanca geri alınıp basılmışsa bu geç tamamlama yalnız
  // bir uyarıya mal olur, hataya değil. `pendingConfirmations` sayacı, `stop()`'un bu iş
  // doğrulanmadan asla çıkmamasını sağlar (bkz. `stop`).
  private async completeSuccessWithRetry(jobId: string): Promise<void> {
    this.pendingConfirmations++;
    try {
      const startedAt = this.now();
      let warnedStale = false;
      for (let attempt = 0; ; attempt++) {
        try {
          await this.api.complete(jobId, true, undefined);
          return;
        } catch (e) {
          const elapsedMs = this.now() - startedAt;
          if (!warnedStale && elapsedMs >= STALE_CONFIRMATION_WARN_MS) {
            warnedStale = true;
            this.stuckConfirmationSince = startedAt; // M5: heartbeat'in hata alanına yansısın
            this.deps.log.error(
              'basılan bir iş bir dakikadır kapatılamadı — reclaim penceresine girildi, yeniden denemeye devam ediliyor (asla vazgeçilmez)',
              { job: jobId, elapsedMs, e: String(e) },
            );
          } else {
            this.deps.log.warn('basılan işi kapatma başarısız, yeniden denenecek', { job: jobId, attempt, e: String(e) });
          }
          const backoff = Math.min(this.opts.completeRetryBaseMs * 2 ** attempt, 30000);
          await sleep(backoff);
        }
      }
    } finally {
      this.pendingConfirmations--;
      this.stuckConfirmationSince = null; // M5: doğrulandı (ya da işlem sona erdi) — heartbeat'teki uyarı temizlenir
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
          // R70(a): kapanış başladıysa (`stop()` çağrıldıysa) yeni iş sahiplenilmez — elindeki
          // (bu döngü turuna zaten girmiş) iş işlenmeye devam eder, ama buradan sonra döngü
          // biter.
          if (this.stopping) break;
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
              renderTicketForPrinter(job.payload, s),
              { codepage: s.codepage, codepageNumber: s.codepageNumber },
            );
          } catch (e) {
            const msg = `encode_error: ${String(e)}`;
            await this.completeFailure(job.id, msg);
            this.deps.log.error('kodlama hatası — yazıcı sorunu değil, sıradaki işe geçiliyor', { job: job.id, msg });
            continue;
          }

          let sent: { after: PrinterState };
          this.printerBusy = true;
          try {
            sent = await this.withPrinterLock(() => this.deps.printer.print(s, bytes));
          } catch (e) {
            // Bayt gitmedi (ya da yazıcı bir sorun bildirdi) — bu iş gerçekten başarısızdır.
            const msg = e instanceof PrinterError ? `${e.code}: ${e.message}` : `print_error: ${String(e)}`;
            await this.completeFailure(job.id, msg);
            this.deps.log.error('print failed', { job: job.id, msg });
            await this.checkPrinter();
            return printed;
          } finally {
            this.printerBusy = false;
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
