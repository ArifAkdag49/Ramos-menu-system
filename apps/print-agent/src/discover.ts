import net from 'node:net';
import os from 'node:os';
import type { PrinterState } from './status';
import { queryStatus } from './transport';

// Yazıcı kurulum sihirbazı (`Kurulum.cmd` → `ramos-agent.mjs find-printer`): bu PC'nin bağlı
// olduğu yerel ağları bulur, her adreste TCP 9100'ü dener ve açık olanlara `DLE EOT` durum
// sorusu sorar. Cevap ESC/POS durum baytı biçimindeyse cihaz fiş yazıcısı sayılır.
// Ajan döngüsünden bağımsızdır; yazıcı aynı anda tek bağlantı kabul ettiği için sihirbaz
// taramadan önce bu PC'deki ajanı durdurur.

export const PRINTER_PORT = 9100;

/** Tek ağ arayüzünden taranacak en fazla adres: /22'den geniş ağlarda yalnız PC'nin kendi /24'ü taranır. */
export const MAX_HOSTS_PER_NETWORK = 1022;

export interface LocalNetwork {
  name: string;
  address: string;
  prefix: number;
}

export interface FoundPrinter {
  host: string;
  port: number;
  /** Durum cevabı ESC/POS biçimindeyse true (Xprinter normalde `12 12 12` döner). */
  escpos: boolean;
  state: PrinterState;
}

// Sanal/tünel arayüzleri: yazıcı bunların arkasında olmaz, taramayı yalnız uzatırlar.
const VIRTUAL_ADAPTER = /vEthernet|Hyper-V|VirtualBox|VMware|WSL|Docker|Loopback|Tailscale|ZeroTier|Hamachi|Npcap|TAP-|WireGuard|OpenVPN/i;

export function ipToInt(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some((p) => !Number.isInteger(p) || p < 0 || p > 255)) {
    throw new Error(`geçersiz IPv4: ${ip}`);
  }
  return ((parts[0]! << 24) >>> 0) + (parts[1]! << 16) + (parts[2]! << 8) + parts[3]!;
}

export function intToIp(n: number): string {
  return [(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join('.');
}

export function isPrivateIpv4(ip: string): boolean {
  const n = ipToInt(ip);
  const inRange = (base: string, prefix: number) => {
    const mask = prefix === 0 ? 0 : (0xffffffff << (32 - prefix)) >>> 0;
    return ((n & mask) >>> 0) === ((ipToInt(base) & mask) >>> 0);
  };
  return inRange('10.0.0.0', 8) || inRange('172.16.0.0', 12) || inRange('192.168.0.0', 16);
}

/** `address/prefix` ağındaki taranacak adresler (ağ, yayın ve PC'nin kendi adresi hariç). */
export function scanTargets(address: string, prefix: number, maxHosts = MAX_HOSTS_PER_NETWORK): string[] {
  if (prefix > 30) return [];
  const self = ipToInt(address);
  let effective = prefix;
  if (2 ** (32 - prefix) - 2 > maxHosts) effective = 24; // çok geniş ağ → yalnız kendi /24'ü
  const mask = (0xffffffff << (32 - effective)) >>> 0;
  const network = (self & mask) >>> 0;
  const broadcast = (network | (~mask >>> 0)) >>> 0;
  const out: string[] = [];
  for (let n = network + 1; n < broadcast; n++) {
    if (n !== self) out.push(intToIp(n));
  }
  return out;
}

function prefixFromNetmask(netmask: string): number {
  return ipToInt(netmask).toString(2).replace(/0+$/, '').length;
}

/** Yazıcının bulunabileceği yerel IPv4 ağları (özel adres aralıkları, fiziksel arayüzler). */
export function localNetworks(ifaces: NodeJS.Dict<os.NetworkInterfaceInfo[]> = os.networkInterfaces()): LocalNetwork[] {
  const out: LocalNetwork[] = [];
  for (const [name, infos] of Object.entries(ifaces)) {
    if (!infos || VIRTUAL_ADAPTER.test(name)) continue;
    for (const info of infos) {
      const isV4 = info.family === 'IPv4' || (info.family as unknown) === 4;
      if (!isV4 || info.internal) continue;
      if (info.address.startsWith('169.254.') || !isPrivateIpv4(info.address)) continue;
      const prefix = info.cidr ? Number(info.cidr.split('/')[1]) : prefixFromNetmask(info.netmask);
      out.push({ name, address: info.address, prefix });
    }
  }
  return out;
}

/** ESC/POS `DLE EOT 1` cevabı: bit1 ve bit4 hep 1, bit0 ve bit7 hep 0 (`0x12` normal durum). */
export function looksLikeEscPos(state: PrinterState): boolean {
  if (!state.known) return false;
  const first = Number.parseInt(state.raw.slice(0, 2), 16);
  return (first & 0x93) === 0x12;
}

/** Yalnız TCP bağlantısı kurulabiliyor mu (veri göndermeden). */
export function probePort(host: string, port: number, timeoutMs: number): Promise<boolean> {
  return new Promise((resolve) => {
    const s = net.createConnection({ host, port });
    const done = (ok: boolean) => {
      clearTimeout(t);
      s.destroy();
      resolve(ok);
    };
    const t = setTimeout(() => done(false), timeoutMs);
    s.once('connect', () => done(true));
    s.once('error', () => done(false));
  });
}

export interface DiscoverOptions {
  networks?: LocalNetwork[];
  /** Ağ taramasından önce denenecek adresler (ör. önceki kurulumun adresi). */
  extraHosts?: string[];
  port?: number;
  connectMs?: number;
  concurrency?: number;
  probe?: (host: string, port: number, timeoutMs: number) => Promise<boolean>;
  status?: (host: string, port: number, opts: { connectMs: number; replyMs: number }) => Promise<PrinterState>;
}

const UNKNOWN_STATE: PrinterState = {
  known: false, offline: false, cover_open: false, paper_end: false, paper_near_end: false, error: false, raw: '',
};

export async function discoverPrinters(opts: DiscoverOptions = {}): Promise<FoundPrinter[]> {
  const port = opts.port ?? PRINTER_PORT;
  // Wi-Fi'da ilk ARP + bağlantı 500 ms'yi aşabiliyor (sahada kaçırılan yazıcı riski); tarama
  // birden fazla ağı kapsayabildiği için eşzamanlılık da artırıldı.
  const connectMs = opts.connectMs ?? 800;
  const concurrency = opts.concurrency ?? 128;
  const probe = opts.probe ?? probePort;
  const status = opts.status ?? queryStatus;
  const networks = opts.networks ?? localNetworks();

  const targets = [...new Set([...(opts.extraHosts ?? []), ...networks.flatMap((n) => scanTargets(n.address, n.prefix))])];

  const open: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < targets.length) {
      const host = targets[next++]!;
      if (await probe(host, port, connectMs)) open.push(host);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));

  // Durum soruları sırayla: yazıcı tek bağlantı kabul eder, taramanın bıraktığı soketin
  // kapanmasına kısa bir pay bırakılır.
  const found: FoundPrinter[] = [];
  for (const host of open) {
    let state = UNKNOWN_STATE;
    for (let attempt = 0; attempt < 2 && !state.known; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 300));
      state = await status(host, port, { connectMs: 1500, replyMs: 1200 }).catch(() => UNKNOWN_STATE);
    }
    found.push({ host, port, escpos: looksLikeEscPos(state), state });
  }

  const order = (h: string) => {
    try {
      return ipToInt(h);
    } catch {
      return Number.MAX_SAFE_INTEGER;
    }
  };
  return found.sort((a, b) => Number(b.escpos) - Number(a.escpos) || order(a.host) - order(b.host));
}
