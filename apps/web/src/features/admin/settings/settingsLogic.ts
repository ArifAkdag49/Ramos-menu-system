import type { TicketPayload } from '@ramos/shared';
import type { SettingsRow, SettingsUpdate } from '../../../data/settings';
import { parseCancelReasons } from '../../waiter/cancelReasons';
import { readAllergenLegend } from '../menu/menuAdminLogic';

// --- Doğrulama -----------------------------------------------------------------------------------

export type SettingsErrorKey =
  | 'host_invalid'
  | 'port_invalid'
  | 'header_empty'
  | 'header_too_long'
  | 'time_invalid'
  | 'name_empty'
  | 'text_empty'
  | 'code_empty'
  | 'code_invalid'
  | 'code_duplicate';

/** Doğrulanan alanlar. Listeler isteğe bağlıdır: plan testleri yalnız dört temel alanla çağırır. */
export interface SettingsDraft {
  printer_host: string;
  /** Formda metin, kayıtta sayı — ikisi de kabul edilir. */
  printer_port: number | string;
  ticket_header: string;
  business_day_start: string;
  restaurant_name?: string;
  quick_notes?: readonly { de: string; tr?: string }[];
  cancel_reasons?: readonly { de: string; tr?: string; freeText?: boolean }[];
  allergen_legend?: readonly { code: string; de: string; tr?: string }[];
}

/** Fiş 48 kolondur (BUILD-PROMPT §5); başlık tek satırda basılır, sarılmaz. */
export const TICKET_HEADER_MAX = 48;

const IPV4_SHAPE = /^[\d.]+$/;
const OCTET = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)$/;
const LABEL = /^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Yazıcı adresi: IPv4 (her oktet 0–255) ya da ağ adı (RFC 1123: harf/rakam/tire, noktalı parçalar,
 * toplam ≤ 253). Yalnız rakam ve noktadan oluşan bir değer **mutlaka** IPv4 olmalıdır — "192.168.1"
 * geçerli bir ağ adı gibi görünür ama yazıcıya asla ulaşmaz. Boş değer "henüz kurulmadı" demektir.
 */
function hostValid(raw: string): boolean {
  const host = raw.trim();
  if (host === '') return true;
  if (IPV4_SHAPE.test(host)) {
    const parts = host.split('.');
    return parts.length === 4 && parts.every((p) => OCTET.test(p));
  }
  return host.length <= 253 && host.split('.').every((label) => LABEL.test(label));
}

function portValid(raw: number | string): boolean {
  if (typeof raw === 'string') {
    const text = raw.trim();
    return /^\d{1,5}$/.test(text) && portValid(Number(text));
  }
  return Number.isInteger(raw) && raw >= 1 && raw <= 65535;
}

/**
 * Alan → hata anahtarı (`admin.settings.errors.<anahtar>`). Boş nesne "kaydedilebilir" demektir.
 * Liste hatalarının anahtarı satırı gösterir: `quick_notes.1.de`, `allergen_legend.3.code`.
 */
export function validateSettings(s: SettingsDraft): Record<string, SettingsErrorKey> {
  const errors: Record<string, SettingsErrorKey> = {};
  if (s.restaurant_name !== undefined && s.restaurant_name.trim() === '')
    errors.restaurant_name = 'name_empty';
  if (!TIME.test(s.business_day_start)) errors.business_day_start = 'time_invalid';
  const header = s.ticket_header.trim();
  if (header === '') errors.ticket_header = 'header_empty';
  else if (header.length > TICKET_HEADER_MAX) errors.ticket_header = 'header_too_long';
  if (!hostValid(s.printer_host)) errors.printer_host = 'host_invalid';
  if (!portValid(s.printer_port)) errors.printer_port = 'port_invalid';

  s.quick_notes?.forEach((n, i) => {
    if (n.de.trim() === '') errors[`quick_notes.${i}.de`] = 'text_empty';
  });
  s.cancel_reasons?.forEach((r, i) => {
    if (r.de.trim() === '') errors[`cancel_reasons.${i}.de`] = 'text_empty';
  });
  const seen = new Set<string>();
  s.allergen_legend?.forEach((a, i) => {
    const code = a.code.trim();
    // Ürünlerde kodlar virgülle birleştirilir (`products.allergens = 'a,g,10'`): virgül ya da
    // boşluk içeren bir kod ürün kaydını bozar.
    if (code === '') errors[`allergen_legend.${i}.code`] = 'code_empty';
    else if (/[\s,]/.test(code)) errors[`allergen_legend.${i}.code`] = 'code_invalid';
    else if (seen.has(code)) errors[`allergen_legend.${i}.code`] = 'code_duplicate';
    if (code) seen.add(code);
    if (a.de.trim() === '') errors[`allergen_legend.${i}.de`] = 'text_empty';
  });
  return errors;
}

// --- Karakter tablosu ----------------------------------------------------------------------------

/**
 * Yazıcı kod sayfaları. Ad ve `ESC t` numarası **birlikte** kaydedilir: ajan baytları addan üretir,
 * numarayı yazıcıya gönderir; ikisi ayrışırsa Türkçe harfler bozuk basılır (BUILD-DECISIONS,
 * Görev 18). İlk satır varsayılandır.
 */
export const CODEPAGES = [
  { codepage: 'cp857', number: 61 },
  { codepage: 'windows1254', number: 91 },
  // Epson TM (ör. TM-m30III): aynı bayt tabloları başka `ESC t` numarasıyla seçilir. Ajan
  // (apps/print-agent/src/escpos.ts CODEPAGE_TABLE) iki numarayı da aynı tabloya bağlar.
  { codepage: 'windows1254', number: 48 },
  { codepage: 'cp857', number: 13 },
  { codepage: 'cp858', number: 19 },
  { codepage: 'cp437', number: 0 },
] as const;

export const codepageValue = (codepage: string, number: number): string => `${codepage}/${number}`;

export function parseCodepageValue(value: string): { codepage: string; number: number } | null {
  const m = /^([a-z0-9]+)\/(\d{1,3})$/i.exec(value);
  if (!m?.[1]) return null;
  const number = Number(m[2]);
  return number <= 255 ? { codepage: m[1], number } : null;
}

/** Seçim listesi. Kayıtlı değer listede yoksa (elle yazılmış) sona eklenir; sessizce değişmez. */
export function codepageChoices(current: string): string[] {
  const known = CODEPAGES.map((c) => codepageValue(c.codepage, c.number));
  return known.includes(current) || !parseCodepageValue(current) ? known : [...known, current];
}

// --- Yazıcı türü (hazır seçim) -------------------------------------------------------------------

/**
 * "Yazıcı türü" hazır seçimleri: port ve karakter tablosunu birlikte doldurur. Epson TM'de
 * (Avrupa modelleri) "Secure Printing" fabrikadan açıktır: şifresiz 9100 baskıyı reddeder, ajan
 * 9143'e TLS ile bağlanır; Epson'un WPC1254 numarası 48'dir (Türkçe + Almanca + €).
 */
export const PRINTER_PRESETS = {
  xprinter: { port: 9100, codepage: 'cp857/61' },
  epson: { port: 9143, codepage: 'windows1254/48' },
} as const;

export type PrinterPresetId = keyof typeof PRINTER_PRESETS | 'custom';

/** Formdaki port + karakter tablosu bir hazır seçime birebir uyuyorsa onun adı, yoksa `custom`. */
export function detectPrinterPreset(
  form: Pick<SettingsForm, 'printer_port' | 'codepage'>,
): PrinterPresetId {
  const port = form.printer_port.trim();
  for (const id of Object.keys(PRINTER_PRESETS) as (keyof typeof PRINTER_PRESETS)[]) {
    const preset = PRINTER_PRESETS[id];
    if (port === String(preset.port) && form.codepage === preset.codepage) return id;
  }
  return 'custom';
}

/** Hazır seçimi forma uygular (port + karakter tablosu); `custom` alanlara dokunmaz. */
export function applyPrinterPreset(form: SettingsForm, id: PrinterPresetId): SettingsForm {
  if (id === 'custom') return form;
  const preset = PRINTER_PRESETS[id];
  return { ...form, printer_port: String(preset.port), codepage: preset.codepage };
}

// --- JSON listeleri ------------------------------------------------------------------------------

export interface QuickNote {
  de: string;
  tr: string;
}

/** `settings.quick_notes` (`jsonb`): `{ de, tr? }` dizisi. Bozuk girdi atılır, eksik TR boş kalır. */
export function parseQuickNotes(value: unknown): QuickNote[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((x) => {
    if (!x || typeof x !== 'object') return [];
    const n = x as Record<string, unknown>;
    return typeof n.de === 'string' ? [{ de: n.de, tr: typeof n.tr === 'string' ? n.tr : '' }] : [];
  });
}

export const addRow = <T>(list: readonly T[], item: T): T[] => [...list, item];

export function removeRow<T>(list: T[], index: number): T[] {
  if (index < 0 || index >= list.length) return list;
  return list.filter((_, i) => i !== index);
}

/** `delta` −1 yukarı, +1 aşağı. Uçta ya da sınır dışında aynı dizi döner (yeniden çizim yok). */
export function moveRow<T>(list: T[], index: number, delta: number): T[] {
  const target = index + delta;
  if (index < 0 || index >= list.length || target < 0 || target >= list.length) return list;
  const next = [...list];
  const [moved] = next.splice(index, 1);
  next.splice(target, 0, moved as T);
  return next;
}

export function updateRow<T extends object>(list: T[], index: number, patch: Partial<T>): T[] {
  if (index < 0 || index >= list.length) return list;
  return list.map((x, i) => (i === index ? { ...x, ...patch } : x));
}

// --- Form ----------------------------------------------------------------------------------------

/** Liste satırlarının React anahtarı: sıralama/silme sırasında odak ve giriş doğru satırda kalır. */
type Keyed<T> = T & { key: string };

export interface SettingsForm {
  restaurant_name: string;
  /** `HH:MM`. Veritabanı `time` sütunu saniyeyle döner ("05:00:00"); form saniyesiz tutar. */
  business_day_start: string;
  ticket_header: string;
  ticket_footer: string;
  printer_host: string;
  /** Metin: yazılırken "91" gibi ara değerler de geçerli durum olmalı. */
  printer_port: string;
  /** `cp857/61` biçiminde tek değer (`codepageValue`). */
  codepage: string;
  printer_transliterate: boolean;
  quick_notes: Keyed<QuickNote>[];
  cancel_reasons: Keyed<{ de: string; tr: string; freeText: boolean }>[];
  allergen_legend: Keyed<{ code: string; de: string; tr: string }>[];
}

let keySeq = 0;
export const newRowKey = (): string => `row-${++keySeq}`;

export function formFromSettings(row: SettingsRow): SettingsForm {
  return {
    restaurant_name: row.restaurant_name,
    business_day_start: row.business_day_start.slice(0, 5),
    ticket_header: row.ticket_header,
    ticket_footer: row.ticket_footer,
    printer_host: row.printer_host,
    printer_port: String(row.printer_port),
    codepage: codepageValue(row.printer_codepage, row.printer_codepage_number),
    printer_transliterate: row.printer_transliterate,
    quick_notes: parseQuickNotes(row.quick_notes).map((n) => ({ ...n, key: newRowKey() })),
    cancel_reasons: parseCancelReasons(row.cancel_reasons).map((r) => ({
      de: r.de,
      tr: r.tr ?? '',
      freeText: r.freeText === true,
      key: newRowKey(),
    })),
    allergen_legend: readAllergenLegend(row.allergen_legend).map((a) => ({
      ...a,
      key: newRowKey(),
    })),
  };
}

export type SettingsPatch = Required<
  Pick<
    SettingsUpdate,
    | 'restaurant_name'
    | 'business_day_start'
    | 'ticket_header'
    | 'ticket_footer'
    | 'printer_host'
    | 'printer_port'
    | 'printer_codepage'
    | 'printer_codepage_number'
    | 'printer_transliterate'
  >
> & {
  quick_notes: { de: string; tr?: string }[];
  cancel_reasons: { de: string; tr?: string; freeText?: true }[];
  allergen_legend: { code: string; de: string; tr?: string }[];
};

/** Boş TR yazılmaz: okuyan her yer (garson çipleri, iptal paneli, alerjen çipleri) DE'ye düşer. */
const withTr = (tr: string) => (tr.trim() ? { tr: tr.trim() } : {});

/**
 * Formu kayıt biçimine çevirir: metinler kırpılır, port sayıya döner, kod sayfası adı ve numarası
 * ayrılır, liste satırlarının React anahtarları atılır. Kayıttan önce `validateSettings` geçmiş
 * olmalıdır (bozuk kod sayfası değeri kayıtlı değere düşmez, varsayılana döner).
 */
export function settingsPatch(form: SettingsForm): SettingsPatch {
  const cp = parseCodepageValue(form.codepage) ?? CODEPAGES[0];
  return {
    restaurant_name: form.restaurant_name.trim(),
    business_day_start: form.business_day_start,
    ticket_header: form.ticket_header.trim(),
    ticket_footer: form.ticket_footer.trim(),
    printer_host: form.printer_host.trim(),
    printer_port: Number(form.printer_port.trim()),
    printer_codepage: cp.codepage,
    printer_codepage_number: cp.number,
    printer_transliterate: form.printer_transliterate,
    quick_notes: form.quick_notes.map((n) => ({ de: n.de.trim(), ...withTr(n.tr) })),
    cancel_reasons: form.cancel_reasons.map((r) => ({
      de: r.de.trim(),
      ...withTr(r.tr),
      ...(r.freeText ? { freeText: true as const } : {}),
    })),
    allergen_legend: form.allergen_legend.map((a) => ({
      code: a.code.trim(),
      de: a.de.trim(),
      ...withTr(a.tr),
    })),
  };
}

/**
 * Kaydedilecek bir şey var mı? Karşılaştırma kayıt biçiminde yapılır: yalnız boşluk eklemek ya da
 * saniyeli saat gibi biçim farkları "değişiklik" sayılmaz, "Kaydet" pasif kalır.
 */
export function isSettingsDirty(form: SettingsForm, row: SettingsRow): boolean {
  return (
    JSON.stringify(settingsPatch(form)) !== JSON.stringify(settingsPatch(formFromSettings(row)))
  );
}

// --- Fiş önizlemesi ------------------------------------------------------------------------------

/**
 * Ayarlar ekranındaki canlı önizlemenin örnek siparişi. Fiş her zaman Almancadır; Türkçe harfli
 * bir ürün ("Kuzu Şiş") transliterasyon anahtarının etkisini görünür kılar.
 */
export function settingsPreviewPayload(header: string, footer: string, now: Date): TicketPayload {
  const trimmedFooter = footer.trim();
  return {
    kind: 'order',
    header: header.trim(),
    ...(trimmedFooter ? { footer: trimmedFooter } : {}),
    table: 'Tisch 12',
    orderNo: 47,
    round: 1,
    createdAt: now.toISOString(),
    waiter: 'Vorschau',
    items: [
      {
        qty: 2,
        code: '05',
        name: 'Drehspieß Sandwich',
        isBeverage: false,
        variant: 'Kalb',
        without: ['Zwiebeln'],
        groups: [{ label: 'Soße', format: 'label_values', values: ['Knoblauch'] }],
        note: null,
        priceCents: 1700,
      },
      {
        qty: 1,
        code: '59',
        name: 'Kuzu Şiş',
        isBeverage: false,
        variant: null,
        without: [],
        groups: [{ label: 'Beilage', format: 'values_only', values: ['Reis'] }],
        note: null,
        priceCents: 1590,
      },
      {
        qty: 1,
        code: null,
        name: 'Cola 0,33 l',
        isBeverage: true,
        variant: null,
        without: [],
        groups: [],
        note: null,
        priceCents: 350,
      },
    ],
  };
}
