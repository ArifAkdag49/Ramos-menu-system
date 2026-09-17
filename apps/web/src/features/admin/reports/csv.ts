import { formatOrderNo } from '@ramos/shared';
import type { OrderStatus, OrderView } from '../../../data/orderMapper';
import { itemLines } from '../../common/itemLines';
import { orderTotalCents } from '../orders/ordersQuery';
import { formatClock } from '../orders/orderView';

export type CsvCell = string | number | null;

/** UTF-8 BOM: Excel dosyayı onsuz ANSI sanır ve "Soße", "Şiş" bozuk görünür. */
const BOM = String.fromCharCode(0xfeff);
const SEPARATOR = ';';
const EOL = '\r\n';

/**
 * Formül gibi başlayan metin (OWASP "CSV injection"). Excel `=`, `+`, `-`, `@` (ve sekme/CR) ile
 * başlayan hücreyi formül olarak çalıştırır: seçenek satırındaki "+ Extra Käse" #NAME? olur,
 * garsonun not alanına yazılan `=HYPERLINK(…)` ise gerçekten çalışırdı. Başa konan tek tırnak
 * hücreyi düz metne çevirir. Sayı tipindeki değerler (adet, tur) buna girmez.
 */
const FORMULA_START = /^[=+\-@\t\r]/;

function cell(value: CsvCell): string {
  if (value === null) return '';
  if (typeof value === 'number') return String(value);
  const text = FORMULA_START.test(value) ? `'${value}` : value;
  return /[;"\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * Excel (Almanca bölge ayarı) ile doğrudan açılan CSV: başta BOM, ayırıcı `;` (virgül ondalık
 * işaretidir), her satır CRLF ile biter. `;`, `"` ya da satır sonu içeren alan tırnaklanır ve
 * içteki `"` ikilenir.
 */
export function toCsv(headers: string[], rows: CsvCell[][]): string {
  const line = (cells: CsvCell[]) => cells.map(cell).join(SEPARATOR) + EOL;
  return BOM + line(headers) + rows.map(line).join('');
}

/** "8,50" — Almanca ondalık, € işareti ve binlik ayırıcı yok: Excel sayıyı sayı olarak okur. */
export function csvMoney(cents: number): string {
  return (cents / 100).toFixed(2).replace('.', ',');
}

export const csvFileName = (from: string, to: string): string =>
  `ramos-bestellungen-${from}_${to}.csv`;

export const CSV_HEADERS = [
  'Datum',
  'Uhrzeit',
  'Bestellung',
  'Runde',
  'Tisch',
  'Kellner',
  'Status',
  'Menge',
  'Nr',
  'Artikel',
  'Variante',
  'Einzelpreis',
  'Summe',
  'OHNE',
  'Optionen',
  'Hinweis',
  'Storno-Grund',
];

/** Dosya muhasebeye gider; arayüz dili ne olursa olsun Almancadır (fiş gibi). */
const STATUS_DE: Record<OrderStatus, string> = {
  in_kitchen: 'in der Küche',
  ready: 'fertig',
  served: 'serviert',
  cancelled: 'storniert',
};

const DATE = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const orEmpty = (text: string | null | undefined): string | null => (text ? text : null);

/**
 * Sipariş geçmişini kalem başına bir satıra açar. Kurallar ekranla aynı yerden gelir:
 * - Satır tutarı `orderTotalCents([kalem])`: iptal edilen kalem 0'dır, ekstra ücretler (0009) birim
 *   fiyatın içindedir. Böylece "Summe" sütununun toplamı rapordaki ciroya eşit çıkar.
 * - "Optionen" `itemLines(kalem, 'de').options`: seçim grupları fiş biçimiyle, ekstra ücretler
 *   "+ Extra Käse (+4,00 €)" olarak — KDS ve garson ekranında görünen metnin aynısı.
 * - Tarih ve saat Europe/Berlin; iptal edilen kalemin durumu, siparişin durumundan bağımsız
 *   olarak `storniert`dir.
 */
export function orderRowsForCsv(orders: OrderView[]): CsvCell[][] {
  const sorted = [...orders].sort(
    (a, b) => a.created_at.localeCompare(b.created_at) || a.order_no - b.order_no,
  );
  return sorted.flatMap((o) => {
    const created = new Date(o.created_at);
    const orderNote = o.note ? `Bestellung: ${o.note}` : null;
    return o.items.map((item): CsvCell[] => {
      const lines = itemLines(item, 'de');
      const cancelled = item.status === 'cancelled';
      const hint = [item.note, orderNote].filter(Boolean).join(' | ');
      return [
        DATE.format(created),
        formatClock(o.created_at),
        formatOrderNo(o.order_no),
        o.round_no,
        o.table_name,
        orEmpty(o.waiter_name),
        cancelled ? STATUS_DE.cancelled : STATUS_DE[o.status],
        item.quantity,
        orEmpty(item.product_code),
        item.product_name,
        orEmpty(item.variant_name_de),
        csvMoney(item.unit_price_cents),
        csvMoney(orderTotalCents([item])),
        orEmpty(item.removed_ingredients.map((r) => r.name_de).join(', ')),
        orEmpty(lines.options.join(' | ')),
        orEmpty(hint),
        cancelled ? orEmpty(item.cancel_reason) : null,
      ];
    });
  });
}

/**
 * Metni dosya olarak indirir (`Blob` + geçici `a[download]`). Nesne adresi bir tur sonra
 * bırakılır: tıklamayla aynı anda bırakılırsa bazı tarayıcılar indirmeyi başlatmadan iptal eder.
 */
export function downloadTextFile(fileName: string, text: string, type: string): void {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}
