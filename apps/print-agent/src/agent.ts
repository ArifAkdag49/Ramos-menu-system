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

export class Agent {
  private settings: AgentSettings | null = null;
  private reachable = false;
  private state: PrinterState | null = null;
  private lastError: string | null = null;
  private draining = false;
  private again = false;
  private timers: NodeJS.Timeout[] = [];

  constructor(
    private api: AgentApi,
    private deps: { printer: PrinterPort; log: Logger },
    private opts = { pollMs: 5000, heartbeatMs: 30000, idleCheckMs: 15000 },
  ) {}

  async start() {
    this.settings = await this.api.settings();
    this.api.onSettings((s) => { this.settings = s; this.deps.log.info('settings reloaded', { host: s.host }); void this.checkPrinter(); });
    this.api.onJobs(() => void this.drain());
    await this.checkPrinter();
    await this.sendHeartbeat();
    this.timers.push(setInterval(() => void this.drain(), this.opts.pollMs));
    this.timers.push(setInterval(() => void this.checkPrinter(), this.opts.idleCheckMs));
    this.timers.push(setInterval(() => void this.sendHeartbeat(), this.opts.heartbeatMs));
    void this.drain();
  }

  async stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
    await this.api.close();
  }

  async checkPrinter(): Promise<void> {
    this.settings ??= await this.api.settings();
    if (!this.settings.host) { this.reachable = false; this.lastError = 'printer_host_missing'; return; }
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

  async drain(): Promise<number> {
    if (this.draining) { this.again = true; return 0; }
    this.draining = true;
    let printed = 0;
    try {
      do {
        this.again = false;
        while (this.printerReady()) {
          const job = await this.api.claim();
          if (!job) break;
          const s = this.settings!;
          try {
            const bytes = encodeLines(
              renderTicket(job.payload, { transliterate: s.transliterate }),
              { codepage: s.codepage, codepageNumber: s.codepageNumber },
            );
            const { after } = await this.deps.printer.print(s, bytes);
            this.state = after;
            await this.api.complete(job.id, true, undefined);
            printed++;
            this.deps.log.info('printed', { job: job.id, type: job.type });
          } catch (e) {
            const msg = e instanceof PrinterError ? `${e.code}: ${e.message}` : `encode_error: ${String(e)}`;
            await this.api.complete(job.id, false, msg);
            this.deps.log.error('print failed', { job: job.id, msg });
            await this.checkPrinter();
            return printed;
          }
        }
      } while (this.again);
    } finally {
      this.draining = false;
    }
    return printed;
  }
}
