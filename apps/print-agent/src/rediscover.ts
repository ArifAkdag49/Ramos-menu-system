import { execFile } from 'node:child_process';
import type { AgentSettings, Logger, PrinterRediscoveryPort } from './agent';
import { normalizeMac } from './config';
import { EPSON_TLS_PORT } from './transport';
import { discoverPrinters, localNetworks, type DiscoverOptions, type FoundPrinter, type LocalNetwork } from './discover';

// Yazıcının adresi değişince (modem yeniden başladı, yazıcı DHCP'den başka adres aldı) ajan onu
// ağda yeniden bulur. Yanlış cihaza fiş göndermemek için kural:
//   - Yazıcının MAC adresi biliniyorsa YALNIZ MAC'i eşleşen cihaza geçilir (durum sorusuna cevap
//     vermeyen yazıcılar da böyle bulunur). Adayların MAC'i okunabildi ama hiçbiri eşleşmediyse
//     geçilmez: ağdaki yazıcı başka bir cihazdır.
//   - MAC bilinmiyorsa ya da hiçbir adayın MAC'i okunamıyorsa: ağda TEK bir ESC/POS yazıcı varsa
//     ona geçilir; birden fazlaysa hangisi olduğu bilinemez, geçilmez.

export type MacLookup = (ip: string) => Promise<string | null>;

/** `arp -a <ip>` (Windows) ya da `ip neigh show <ip>` (Linux) çıktısından o adresin MAC'i. */
export function parseNeighborOutput(output: string, ip: string): string | null {
  for (const line of output.split(/\r?\n/)) {
    const m = line.match(/(\d{1,3}(?:\.\d{1,3}){3})\s+(?:dev\s+\S+\s+lladdr\s+)?([0-9a-fA-F]{2}(?:[-:][0-9a-fA-F]{2}){5})/);
    if (m && m[1] === ip) return normalizeMac(m[2]!);
  }
  return null;
}

/** İşletim sisteminin ARP tablosundan MAC okur (tarama o adrese bağlandığı için kayıt tazedir). */
export const systemMacLookup: MacLookup = (ip) =>
  new Promise((resolve) => {
    const [cmd, args] = process.platform === 'win32' ? ['arp', ['-a', ip]] : ['ip', ['neigh', 'show', ip]];
    execFile(cmd, args, { timeout: 3000, windowsHide: true }, (err, stdout) => {
      resolve(err ? null : parseNeighborOutput(String(stdout), ip));
    });
  });

export interface RediscoveryDeps {
  log: Logger;
  knownMac?: string | null;
  /** Yeni bir MAC öğrenilince (cli: .env'e PRINTER_MAC yazar). */
  onMacLearned?: (mac: string) => void;
  discover?: (opts: DiscoverOptions) => Promise<FoundPrinter[]>;
  networks?: () => LocalNetwork[];
  macOf?: MacLookup;
}

/** Aynı adres için MAC okuma en fazla bu kadar denenir (ARP okunamayan ortamda her 15 sn'de komut çalıştırmamak için). */
const MAX_LEARN_ATTEMPTS = 3;

export class PrinterRediscovery implements PrinterRediscoveryPort {
  private mac: string | null;
  private learnHost: string | null = null;
  private learnAttempts = 0;

  constructor(private deps: RediscoveryDeps) {
    this.mac = deps.knownMac ?? null;
  }

  get knownMac(): string | null {
    return this.mac;
  }

  private macOf(ip: string): Promise<string | null> {
    return (this.deps.macOf ?? systemMacLookup)(ip)
      .then((mac) => (mac ? normalizeMac(mac) : null))
      .catch(() => null);
  }

  async learn(host: string): Promise<void> {
    if (host !== this.learnHost) {
      this.learnHost = host;
      this.learnAttempts = 0;
    }
    if (this.learnAttempts >= MAX_LEARN_ATTEMPTS) return;
    this.learnAttempts++;
    const mac = await this.macOf(host);
    if (!mac) return;
    this.learnAttempts = MAX_LEARN_ATTEMPTS; // bu adres için öğrenildi, tekrar sorma
    if (mac === this.mac) return;
    this.mac = mac;
    this.deps.log.info('yazıcının donanım (MAC) adresi öğrenildi', { host, mac });
    this.deps.onMacLearned?.(mac);
  }

  async find(s: AgentSettings): Promise<string | null> {
    const discover = this.deps.discover ?? discoverPrinters;
    // Aynı portta aranır: 9143 (Epson şifreli) ile çalışan ajan yalnız TLS portu, 9100 ile çalışan
    // yalnız düz portu tarar — başka porttaki bir cihaza geçmek baskıyı yine bozardı.
    const found = await discover({
      networks: (this.deps.networks ?? localNetworks)(),
      port: s.port,
      securePort: s.port === EPSON_TLS_PORT ? EPSON_TLS_PORT : null,
    });
    const candidates = found.filter((f) => f.host !== s.host);
    if (candidates.length === 0) return null;

    let macsRead = 0;
    if (this.mac) {
      for (const c of candidates) {
        const mac = await this.macOf(c.host);
        if (!mac) continue;
        macsRead++;
        if (mac === this.mac) return c.host;
      }
      if (macsRead > 0) {
        this.deps.log.warn('ağda yazıcı olabilecek cihazlar var ama hiçbirinin MAC adresi kayıtlı yazıcıyla eşleşmiyor — adres değiştirilmedi', {
          mac: this.mac,
          candidates: candidates.map((c) => c.host),
        });
        return null;
      }
    }

    const escpos = candidates.filter((c) => c.escpos);
    if (escpos.length === 1) return escpos[0]!.host;
    if (escpos.length > 1) {
      this.deps.log.warn('ağda birden fazla fiş yazıcısı var, hangisinin bu yazıcı olduğu bilinemiyor — adres değiştirilmedi', {
        candidates: escpos.map((c) => c.host),
      });
    }
    return null;
  }
}
