import {
  encodeLines,
  parseStatus,
  renderTicket,
  type PrinterState,
  type TicketPayload,
} from '@ramos/shared';
import { RpcError } from '../../lib/rpc';
import { hexToBytes } from '../../native/base64';
import type { RamosPrinterErrorCode, RamosPrinterSendResult } from '../../native/capacitor';

/**
 * Tablet yazıcı istasyonu — saf yardımcılar. Yazdırma ajanıyla (apps/print-agent) aynı kurallar:
 * fiş `renderTicket` + paylaşılan `encodeLines` ile üretilir, hata metni `<kod>: <mesaj>` biçimindedir,
 * durum baytları `parseStatus` ile okunur (yanıt yoksa "bilinmiyor", çevrimdışı değil).
 */

export const STATION_ID_KEY = 'ramos-station-id';

/** `print_jobs` satırının istasyonun kullandığı alanları (`station_claim_print_job` dönüşü). */
export interface PrintJobRow {
  id: string;
  type: string;
  payload: unknown;
  attempts: number;
}

export interface StationPrinterConfig {
  host: string;
  port: number;
  codepage: string;
  codepageNumber: number;
  transliterate: boolean;
}

export interface StationSettingsLike {
  printer_host?: string | null;
  printer_port?: number | null;
  printer_codepage?: string | null;
  printer_codepage_number?: number | null;
  printer_transliterate?: boolean | null;
}

type KeyStore = Pick<Storage, 'getItem' | 'setItem'>;

let sessionId: string | null = null;

function randomId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
      return crypto.randomUUID();
  } catch {
    /* güvenli olmayan bağlam */
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function defaultStore(): KeyStore | null {
  try {
    return localStorage;
  } catch {
    return null;
  }
}

/**
 * Cihaza özgü istasyon kimliği (kuyrukta `station:<id>`). İlk açılışta üretilip saklanır; depolama
 * yoksa (özel mod) bu oturum boyunca aynı kimlik kullanılır — asla fırlatmaz.
 */
export function getStationId(
  store: KeyStore | null = defaultStore(),
  uuid: () => string = randomId,
): string {
  try {
    const saved = store?.getItem(STATION_ID_KEY);
    if (saved) return saved;
  } catch {
    /* okunamadı → aşağıda oturum kimliği */
  }
  const id = sessionId ?? uuid();
  sessionId = id;
  try {
    store?.setItem(STATION_ID_KEY, id);
  } catch {
    /* yazılamadı: oturum kimliği yeterli */
  }
  return id;
}

/** Yalnız testler. */
export function __resetStationIdForTests(): void {
  sessionId = null;
}

/** Ayarlardan yazıcı bilgisi; adres boşsa ya da port geçersizse `null` (iş sahiplenilmez). */
export function stationPrinterConfig(
  row: StationSettingsLike | null | undefined,
): StationPrinterConfig | null {
  const host = row?.printer_host?.trim() ?? '';
  const port = row?.printer_port ?? 0;
  if (!host || !Number.isInteger(port) || port < 1 || port > 65535) return null;
  return {
    host,
    port,
    codepage: row?.printer_codepage ?? 'cp857',
    codepageNumber: row?.printer_codepage_number ?? 61,
    transliterate: row?.printer_transliterate ?? false,
  };
}

/** İş yükü → yazıcıya gidecek ESC/POS baytları. Uyuşmayan kod sayfası burada fırlatır. */
export function jobToBytes(payload: unknown, cfg: StationPrinterConfig): Uint8Array {
  const lines = renderTicket(payload as TicketPayload, { transliterate: cfg.transliterate });
  return encodeLines(lines, { codepage: cfg.codepage, codepageNumber: cfg.codepageNumber });
}

/** Eklenti hatası → `station_complete_print_job.p_error` (ajanın `PrinterError` biçimi). */
export function sendErrorText(res: Pick<RamosPrinterSendResult, 'error' | 'message'>): string {
  const code = res.error ?? 'io';
  return `${code}: ${res.message?.trim() || code}`;
}

/** Bağlantı düzeyi hata mı (kapak/kâğıt değil): rozet "Yazıcıya ulaşılamıyor" gösterir. */
export function isUnreachableError(code: RamosPrinterErrorCode | undefined): boolean {
  return code === undefined || code === 'offline' || code === 'timeout' || code === 'io';
}

/** Eklentinin onaltılık durum yanıtı → `PrinterState`; yanıt yoksa `null`. */
export function stateFromHex(hex: string | null | undefined): PrinterState | null {
  if (!hex) return null;
  return parseStatus(hexToBytes(hex));
}

/**
 * Basılmış bir işin `complete(ok)` çağrısı yeniden denensin mi. İş artık bizim değilse (sunucu
 * 60 sn sonra geri aldı, silindi) ya da yetki yoksa denemek boşuna; ağ/bilinmeyen hatada dene.
 */
export function shouldRetryComplete(e: unknown): boolean {
  if (!(e instanceof RpcError)) return true;
  return e.key === 'network' || e.key === 'unknown';
}
