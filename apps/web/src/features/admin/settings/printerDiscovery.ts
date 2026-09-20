import {
  isNative,
  nativePlugin,
  type DiscoveredNetwork,
  type FoundPrinter,
  type FoundPrinterKind,
  type PrinterDiscoveryError,
} from '../../../native/capacitor';
import { PRINTER_PRESETS, type PrinterPresetId, type SettingsForm } from './settingsLogic';

/**
 * Ayarlar > Yazıcı bağlantısı > "Ağdaki yazıcıyı bul" — saf yardımcılar. Taramayı yerel uygulama yapar
 * (`RamosPrinter.discover`, apps/mobile `PrinterDiscovery`): tablet/telefonun bağlı olduğu Wi-Fi ya da
 * kablolu ağdaki her adreste 9100 / 9143 / 443 / 80 denenir, cevap verenler yazıcı sayılır. Bilgisayar
 * programının kurulum sihirbazının (apps/print-agent discover.ts) bilgisayarsız karşılığı.
 */

export type DiscoverySupport = 'ready' | 'old_app' | 'browser';

/** Tarayıcıda (Chrome/PWA) yok; eski APK'da yöntem yok (`old_app`); v2.3+ APK'da hazır. */
export function discoverySupport(): DiscoverySupport {
  if (!isNative()) return 'browser';
  const p = nativePlugin('RamosPrinter');
  return typeof p?.discover === 'function' ? 'ready' : 'old_app';
}

export type DiscoveryOutcome =
  | {
      ok: true;
      printers: FoundPrinter[];
      networks: DiscoveredNetwork[];
      scanned: number;
      durationMs: number;
    }
  | { ok: false; error: PrinterDiscoveryError | 'unsupported'; message?: string };

const KINDS: readonly FoundPrinterKind[] = ['escpos', 'epson_secure', 'epson_epos', 'open'];

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v !== '' ? v : undefined;
}

function port(v: unknown): number | null {
  return typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 65535 ? v : null;
}

/** Yerel yanıtı doğrular; bozuk satırlar atılır, bozuk zarf `io` sayılır. */
export function normalizeDiscovery(raw: unknown): DiscoveryOutcome {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'io', message: 'no_response' };
  const r = raw as Record<string, unknown>;
  if (r.ok !== true) {
    const error = r.error;
    return {
      ok: false,
      error: error === 'no_network' || error === 'busy' ? error : 'io',
      message: str(r.message),
    };
  }
  const printers: FoundPrinter[] = [];
  for (const x of Array.isArray(r.printers) ? r.printers : []) {
    if (!x || typeof x !== 'object') continue;
    const p = x as Record<string, unknown>;
    const host = str(p.host)?.trim();
    const prt = port(p.port);
    const kind = KINDS.includes(p.kind as FoundPrinterKind) ? (p.kind as FoundPrinterKind) : 'open';
    if (!host || prt === null) continue;
    printers.push({
      host,
      port: prt,
      kind,
      confirmed: p.confirmed === true,
      status: str(p.status),
      message: str(p.message),
    });
  }
  const networks: DiscoveredNetwork[] = [];
  for (const x of Array.isArray(r.networks) ? r.networks : []) {
    if (!x || typeof x !== 'object') continue;
    const n = x as Record<string, unknown>;
    const address = str(n.address);
    if (!address) continue;
    networks.push({
      address,
      prefix: typeof n.prefix === 'number' ? n.prefix : 24,
      transport: str(n.transport) ?? 'wifi',
    });
  }
  return {
    ok: true,
    printers,
    networks,
    scanned: typeof r.scanned === 'number' ? r.scanned : 0,
    durationMs: typeof r.durationMs === 'number' ? r.durationMs : 0,
  };
}

/** Taramayı başlatır ve bitmesini bekler. Asla reddetmez. */
export async function discoverPrinters(knownHost?: string): Promise<DiscoveryOutcome> {
  const p = nativePlugin('RamosPrinter');
  if (typeof p?.discover !== 'function') return { ok: false, error: 'unsupported' };
  try {
    const host = knownHost?.trim();
    return normalizeDiscovery(await p.discover(host ? { host } : {}));
  } catch (e) {
    return { ok: false, error: 'io', message: e instanceof Error ? e.message : String(e) };
  }
}

/**
 * Bulunan yazıcı → "Yazıcı türü" hazır seçimi (port + karakter tablosu). Tür kanıttan gelir: ePOS yanıtı
 * → `epson_epos`, 9143'te ESC/POS → `epson`; cevapsız aday yalnız portundan tahmin edilir.
 */
export function presetForFound(p: Pick<FoundPrinter, 'kind' | 'port'>): PrinterPresetId {
  if (p.kind === 'epson_epos') return 'epson_epos';
  if (p.kind === 'epson_secure') return 'epson';
  if (p.port === PRINTER_PRESETS.xprinter.port) return 'xprinter';
  if (p.port === PRINTER_PRESETS.epson.port) return 'epson';
  if (p.port === PRINTER_PRESETS.epson_epos.port || p.port === 80) return 'epson_epos';
  return 'custom';
}

/** Bulunan yazıcıyı forma yazar: adres, port ve (hazır seçim biliniyorsa) karakter tablosu. */
export function applyFoundPrinter(form: SettingsForm, p: FoundPrinter): SettingsForm {
  const preset = presetForFound(p);
  return {
    ...form,
    printer_host: p.host,
    printer_port: String(p.port),
    codepage: preset === 'custom' ? form.codepage : PRINTER_PRESETS[preset].codepage,
  };
}

/** Ekranda "Wi-Fi 192.168.1.23/24" gibi: ilk (tercihen Wi-Fi) ağ. */
export function primaryNetwork(networks: DiscoveredNetwork[]): DiscoveredNetwork | null {
  return networks.find((n) => n.transport === 'wifi') ?? networks[0] ?? null;
}
