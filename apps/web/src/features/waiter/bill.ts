import type { Locale } from '@ramos/shared';

export interface BillLine {
  product_code: string | null;
  product_name: string;
  variant_name_de: string | null;
  /** Seçenek ekstraları her zaman Almanca gelir (`get_session_bill` yalnız `name_de` toplar); serbest ekstra ücretler garsonun yazdığı gibi, tutarıyla (0009). */
  variant_name_tr: string | null;
  extras: string[];
  unit_price_cents: number;
  quantity: number;
  line_total_cents: number;
}

export interface BillView {
  session_id: string;
  table: string;
  opened_at: string | null;
  lines: BillLine[];
  total_cents: number;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

/**
 * `get_session_bill` `jsonb` döndürür; `callRpc` bunu `Json` olarak verir. Arayüz `any`'ye
 * düşmesin diye tek bir yerde, biçimi doğrulayarak okunur tipe çevrilir. Beklenen alanlar yoksa
 * `null` döner ve ekran "hesap yok" durumunu gösterir — çökmez.
 */
export function parseBill(data: unknown): BillView | null {
  if (!isRecord(data)) return null;
  const { session_id, table, opened_at, lines, total_cents } = data;
  if (typeof session_id !== 'string' || typeof table !== 'string') return null;
  if (!Array.isArray(lines) || typeof total_cents !== 'number') return null;
  return {
    session_id,
    table,
    opened_at: typeof opened_at === 'string' ? opened_at : null,
    lines: lines.filter(isRecord).map((l) => ({
      product_code: typeof l.product_code === 'string' ? l.product_code : null,
      product_name: String(l.product_name ?? ''),
      variant_name_de: typeof l.variant_name_de === 'string' ? l.variant_name_de : null,
      variant_name_tr: typeof l.variant_name_tr === 'string' ? l.variant_name_tr : null,
      extras: Array.isArray(l.extras) ? l.extras.map(String) : [],
      unit_price_cents: Number(l.unit_price_cents ?? 0),
      quantity: Number(l.quantity ?? 0),
      line_total_cents: Number(l.line_total_cents ?? 0),
    })),
    total_cents,
  };
}

/** Hesap satırının ad kısmı: `05 Drehspieß Sandwich (Kalb) +Extra Weichkäse` (brief Adım 2). */
export function billLineLabel(line: BillLine, locale: Locale): string {
  const variant = (locale === 'tr' && line.variant_name_tr) || line.variant_name_de;
  return [
    line.product_code ? `${line.product_code} ${line.product_name}` : line.product_name,
    variant ? `(${variant})` : null,
    ...line.extras.map((e) => `+${e}`),
  ]
    .filter(Boolean)
    .join(' ');
}
