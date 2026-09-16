import { formatEuro, formatOrderNo } from './money';

export interface TicketPayload {
  kind: 'order' | 'addition' | 'storno' | 'table_move' | 'reprint' | 'test';
  header: string;
  footer?: string;
  table: string;
  orderNo?: number;
  round?: number;
  createdAt: string;
  waiter?: string;
  note?: string | null;
  reason?: string;
  refOrderNo?: number;
  reprintOf?: string;
  fromTable?: string;
  toTable?: string;
  openOrderNos?: number[];
  settings?: { host: string; port: number; codepage: string; codepageNumber: number; transliterate: boolean };
  sampleLine?: string;
  items: {
    qty: number;
    code: string | null;
    name: string;
    isBeverage: boolean;
    variant: string | null;
    without: string[];
    groups: { label: string; format: 'label_values' | 'values_only' | 'plus_each'; values: string[] }[];
    note: string | null;
    /** Satır toplamı (adet × birim fiyat, kuruş). Eski işlerde ve STORNO'da yoktur → fiyat sütunu basılmaz. */
    priceCents?: number;
  }[];
}

export type Line =
  | { kind: 'text'; text: string; align?: 'left' | 'center'; bold?: boolean; invert?: boolean; height?: 1 | 2; width?: 1 | 2 }
  | { kind: 'rule' }
  | { kind: 'feed'; lines: number };

type TicketItem = TicketPayload['items'][number];
type TextLine = Extract<Line, { kind: 'text' }>;
type TextStyle = Omit<TextLine, 'kind' | 'text'>;

const TR_MAP: Record<string, string> = { ş: 's', Ş: 'S', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I' };

export const transliterate = (s: string): string => s.replace(/[şŞğĞıİ]/g, (c) => TR_MAP[c] ?? c);

export const sanitize = (s: string): string =>
  s.replace(/→/g, '->').replace(/…/g, '...').replace(/[„“”]/g, '"').replace(/[‚‘’]/g, "'");

// Word-wraps `text` to `width` columns with a hanging indent of `indent` spaces on
// continuation lines (the first line is always flush-left/unindented — see pushWrapped
// and pushSubLine below for how callers get an indented *first* line when they need one).
// A single word longer than the line it would start on is hard-split across as many
// lines as it needs (R43): no characters are dropped, and an over-long first word never
// produces a blank leading line — the very first hard-split chunk uses the full `width`
// budget, not `width - indent`, exactly like a normal first line would.
export function wrap(text: string, width: number, indent: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  let cur = '';
  for (const w of words) {
    let rest = w;
    while (rest.length > 0) {
      const limit = out.length ? width - indent : width;
      const candidate = cur ? `${cur} ${rest}` : rest;
      if (candidate.length <= limit) {
        cur = candidate;
        break;
      }
      if (cur) {
        out.push(cur);
        cur = '';
        continue;
      }
      // `rest` alone doesn't fit on an empty line: hard-split off as much as fits.
      out.push(rest.slice(0, limit));
      rest = rest.slice(limit);
    }
  }
  if (cur) out.push(cur);
  return out.map((l, i) => (i === 0 ? l : `${' '.repeat(indent)}${l}`));
}

const fmt = (iso: string): string => {
  const d = new Date(iso);
  const date = d.toLocaleDateString('de-DE', { timeZone: 'Europe/Berlin', day: '2-digit', month: '2-digit', year: 'numeric' });
  const time = d.toLocaleTimeString('de-DE', { timeZone: 'Europe/Berlin', hour: '2-digit', minute: '2-digit' });
  return `${date} ${time}`;
};

const BANNER: Record<Exclude<TicketPayload['kind'], 'order'>, string> = {
  addition: 'NACHBESTELLUNG',
  storno: '*** STORNO ***',
  table_move: 'TISCHWECHSEL',
  reprint: 'NACHDRUCK',
  test: 'TESTDRUCK',
};

function bannerFor(p: TicketPayload): string | null {
  if (p.kind === 'order') return (p.round ?? 1) > 1 ? 'NACHBESTELLUNG' : null;
  return BANNER[p.kind];
}

function pushText(lines: Line[], text: string, style: TextStyle = {}): void {
  lines.push({ kind: 'text', text, ...style });
}

// Flush-left first line, hanging `indent` on continuation lines — for top-level lines
// (meta, Hinweis/Grund/Offene Bestellungen/footer).
function pushWrapped(lines: Line[], text: string, columns: number, indent: number, style: TextStyle = {}): void {
  for (const part of wrap(text, columns, indent)) pushText(lines, part, style);
}

// A width:2 (double-width) line only has columns/2 usable print columns (R46).
const DOUBLE_WIDTH_BUDGET = 24;

function pushDoubleWidth(lines: Line[], text: string, style: TextStyle = {}): void {
  for (const part of wrap(text, DOUBLE_WIDTH_BUDGET, 0)) pushText(lines, part, { ...style, width: 2 });
}

// Çift genişlikte ortalı yazı. `linesToText` ve ESC/POS kodlayıcısı width:2 satırı kendiliğinden
// ortalamaz (yarım kolon hesabı yanlış olurdu); boşluk 24 kolonluk bütçeye göre elle eklenir.
const centerWide = (text: string): string =>
  `${' '.repeat(Math.max(0, Math.floor((DOUBLE_WIDTH_BUDGET - text.length) / 2)))}${text}`;

// Fiş düzeni (sahibin onayladığı örnek): "Nr." sütunu 5 kolon, fiyat sağa yaslı tek sütun.
const QTY_COL = 5;
const PRICE_COL = 11; // "1.234,50 €" (10) + bir boşluk
const SUB_INDENT = QTY_COL + 3;

// Intl, "8,50 €" içine bölünmez boşluk (U+00A0) koyar; yazıcının kod sayfasında ayrı bir
// karakterdir ve bazı Xprinter'larda boşluk yerine sembol basar — düz boşluğa çevrilir.
const money = (cents: number): string => formatEuro(cents).replace(/\u00a0/g, ' ');

const hasPrices = (items: TicketItem[]): boolean => items.some((i) => typeof i.priceCents === 'number');

// Satır = sabit genişlikli sütun öneki ("2x   ", "Nr.  ") + metin + sağa yaslı değer. Önek
// `wrap`'e girmez: `wrap` boşlukları tek boşluğa indirir ve sütun hizası kaybolurdu. Metin fiyat
// sütununa taşmadan sarılır, devam satırları önek genişliğinde girintilenir; değer ilk satırda
// kalır. `right === null` → fiyat sütunu yok, metin satırın tamamını kullanır.
function pushColumns(
  lines: Line[],
  prefix: string,
  body: string,
  right: string | null,
  columns: number,
  style: TextStyle = {},
): void {
  const budget = (right === null ? columns : columns - PRICE_COL) - prefix.length;
  wrap(body, budget, 0).forEach((part, i) => {
    const left = `${i === 0 ? prefix : ' '.repeat(prefix.length)}${part}`;
    pushText(lines, i === 0 && right ? `${left.padEnd(columns - right.length)}${right}` : left, style);
  });
}

// Alt satırlar ("ohne …", "Soße: …", "+ Extra …") ürün adının altına hizalanır.
function pushSubLine(lines: Line[], text: string, columns: number, withPrice: boolean): void {
  const budget = columns - SUB_INDENT - (withPrice ? PRICE_COL : 0);
  for (const part of wrap(text, budget, 3)) pushText(lines, `${' '.repeat(SUB_INDENT)}${part}`);
}

// "+--------+ / | TISCH 61 | / +--------+" — kâğıtta çerçeve komutu yok; ASCII çizgi her kod
// sayfasında (cp857, WPC1254) aynı basılır. Uzun masa adı kutunun içinde sarılır (R46).
function pushBoxed(lines: Line[], text: string): void {
  const inner = wrap(text, DOUBLE_WIDTH_BUDGET - 4, 0);
  const w = Math.max(...inner.map((l) => l.length)) + 4;
  const pad = ' '.repeat(Math.max(0, Math.floor((DOUBLE_WIDTH_BUDGET - w) / 2)));
  const edge = `${pad}+${'-'.repeat(w - 2)}+`;
  pushText(lines, edge, { width: 2, bold: true });
  for (const l of inner) pushText(lines, `${pad}| ${l.padEnd(w - 4)} |`, { width: 2, height: 2, bold: true });
  pushText(lines, edge, { width: 2, bold: true });
}

function renderItem(lines: Line[], item: TicketItem, columns: number, clean: (s: string) => string, withPrice: boolean): void {
  const qty = `${item.qty}x`.padEnd(QTY_COL);
  const codePart = item.code ? `${clean(item.code)} ` : '';
  const price = typeof item.priceCents === 'number' ? money(item.priceCents) : '';
  pushColumns(lines, qty, `${codePart}${clean(item.name)}`, withPrice ? price : null, columns, {
    bold: true,
    height: 2,
  });

  if (item.variant) pushSubLine(lines, clean(item.variant), columns, withPrice);
  if (item.without.length > 0) pushSubLine(lines, `ohne ${item.without.map(clean).join(', ')}`, columns, withPrice);
  for (const group of item.groups) {
    if (group.format === 'plus_each') {
      for (const value of group.values) pushSubLine(lines, `+ ${clean(value)}`, columns, withPrice);
    } else if (group.format === 'label_values') {
      pushSubLine(lines, `${clean(group.label)}: ${group.values.map(clean).join(' + ')}`, columns, withPrice);
    } else {
      pushSubLine(lines, group.values.map(clean).join(', '), columns, withPrice);
    }
  }
  if (item.note) pushSubLine(lines, `Hinweis: ${clean(item.note)}`, columns, withPrice);
}

function renderItems(lines: Line[], items: TicketItem[], columns: number, clean: (s: string) => string): void {
  const withPrice = hasPrices(items);
  pushColumns(lines, 'Nr.'.padEnd(QTY_COL), 'Artikel', withPrice ? 'Preis' : null, columns, { bold: true });
  lines.push({ kind: 'feed', lines: 1 });

  const food = items.filter((i) => !i.isBeverage);
  const drinks = items.filter((i) => i.isBeverage);
  food.forEach((item, i) => {
    if (i > 0) lines.push({ kind: 'feed', lines: 1 });
    renderItem(lines, item, columns, clean, withPrice);
  });
  if (drinks.length > 0) {
    if (food.length > 0) lines.push({ kind: 'feed', lines: 1 });
    pushText(lines, 'GETRÄNKE', { bold: true });
    drinks.forEach((item, i) => {
      if (i > 0) lines.push({ kind: 'feed', lines: 1 });
      renderItem(lines, item, columns, clean, withPrice);
    });
  }
}

// "Gesamtbetrag      35,90 €" — çift genişlik ve yükseklik, 24 kolonluk bütçede sağa yaslı.
function pushTotal(lines: Line[], items: TicketItem[]): void {
  if (!hasPrices(items)) return;
  const total = money(items.reduce((sum, i) => sum + (i.priceCents ?? 0), 0));
  const label = 'Gesamtbetrag';
  const gap = DOUBLE_WIDTH_BUDGET - label.length - total.length;
  if (gap >= 1) {
    pushText(lines, `${label}${' '.repeat(gap)}${total}`, { width: 2, height: 2, bold: true });
  } else {
    pushText(lines, label, { width: 2, height: 2, bold: true });
    pushText(lines, total.padStart(DOUBLE_WIDTH_BUDGET), { width: 2, height: 2, bold: true });
  }
}

function closeTicket(lines: Line[], p: TicketPayload, columns: number, clean: (s: string) => string): void {
  if (p.footer) pushWrapped(lines, clean(p.footer), columns, 0, { align: 'center' });
  lines.push({ kind: 'feed', lines: 3 });
}

function renderOrderBody(lines: Line[], p: TicketPayload, columns: number, clean: (s: string) => string): void {
  pushBoxed(lines, clean(p.table).toLocaleUpperCase('de-DE'));

  // Meta tek ortalı satır: mutfak fişi KDS'deki sipariş numarasıyla eşleştirebilsin. STORNO
  // "zu Bestellung #NNN" der; her tür tarih + garson taşır (R47).
  const parts: string[] = [];
  if (p.kind === 'storno') {
    if (p.refOrderNo != null) parts.push(`zu Bestellung ${formatOrderNo(p.refOrderNo)}`);
  } else if (p.orderNo != null) {
    const round = p.round ?? 1;
    parts.push(`Bestellung ${formatOrderNo(p.orderNo)}${round > 1 ? ` · Runde ${round}` : ''}`);
  }
  parts.push(`${fmt(p.createdAt)}${p.waiter ? ` · Kellner: ${clean(p.waiter)}` : ''}`);
  for (const part of parts) pushWrapped(lines, part, columns, 0, { align: 'center' });
  lines.push({ kind: 'feed', lines: 1 });

  renderItems(lines, p.items, columns, clean);

  if (p.kind === 'storno') {
    lines.push({ kind: 'rule' });
    if (p.reason) pushWrapped(lines, `Grund: ${clean(p.reason)}`, columns, 0, { bold: true });
  } else {
    if (p.note) {
      lines.push({ kind: 'feed', lines: 1 });
      pushWrapped(lines, `Hinweis: ${clean(p.note)}`, columns, 0, { bold: true });
    }
    lines.push({ kind: 'rule' });
    pushTotal(lines, p.items);
  }
  closeTicket(lines, p, columns, clean);
}

function renderTableMoveBody(lines: Line[], p: TicketPayload, columns: number, clean: (s: string) => string): void {
  const from = clean(p.fromTable ?? '').toLocaleUpperCase('de-DE');
  const to = clean(p.toTable ?? '').toLocaleUpperCase('de-DE');
  pushDoubleWidth(lines, `${from} -> ${to}`, { height: 2, bold: true });

  const nums = (p.openOrderNos ?? []).map((n) => formatOrderNo(n)).join(', ');
  pushWrapped(lines, `Offene Bestellungen: ${nums}`, columns, 0);

  closeTicket(lines, p, columns, clean);
}

function renderTestBody(lines: Line[], p: TicketPayload, columns: number, clean: (s: string) => string): void {
  // Spec §9.4: TESTDRUCK also prints the date (R45).
  pushWrapped(lines, fmt(p.createdAt), columns, 0);
  const s = p.settings;
  if (s) {
    pushWrapped(lines, `Drucker: ${clean(s.host)}:${s.port}`, columns, 0);
    pushWrapped(lines, `Zeichensatz: ${clean(s.codepage)} (${s.codepageNumber})`, columns, 0);
    pushWrapped(lines, `Transliteration: ${s.transliterate ? 'an' : 'aus'}`, columns, 0);
  }
  if (p.sampleLine) pushWrapped(lines, clean(p.sampleLine), columns, 0);
  lines.push({ kind: 'feed', lines: 1 });
  renderItems(lines, p.items, columns, clean);
  lines.push({ kind: 'rule' });
  pushTotal(lines, p.items);
  closeTicket(lines, p, columns, clean);
}

export function renderTicket(p: TicketPayload, opts: { columns?: number; transliterate?: boolean } = {}): Line[] {
  const columns = opts.columns ?? 48;
  const doTransliterate = opts.transliterate ?? false;
  const clean = (s: string): string => (doTransliterate ? transliterate(sanitize(s)) : sanitize(s));

  const lines: Line[] = [];
  // Başlık ("RAMO'S") büyük basılır; 24 kolonluk çift genişliğe sığmıyorsa normal boyda ortalanır.
  const header = clean(p.header);
  if (header.length <= DOUBLE_WIDTH_BUDGET) pushText(lines, centerWide(header), { width: 2, height: 2, bold: true });
  else pushText(lines, header, { align: 'center', bold: true });

  const banner = bannerFor(p);
  if (banner) pushText(lines, banner, { align: 'center', bold: true, invert: true, height: 2 });
  lines.push({ kind: 'feed', lines: 1 });

  if (p.kind === 'table_move') renderTableMoveBody(lines, p, columns, clean);
  else if (p.kind === 'test') renderTestBody(lines, p, columns, clean);
  else renderOrderBody(lines, p, columns, clean);

  return lines;
}

export function linesToText(lines: Line[], columns = 48): string {
  const out: string[] = [];
  for (const line of lines) {
    if (line.kind === 'rule') {
      out.push('-'.repeat(columns));
    } else if (line.kind === 'feed') {
      for (let i = 0; i < line.lines; i += 1) out.push('');
    } else {
      const shouldCenter = line.align === 'center' && line.width !== 2;
      if (shouldCenter) {
        const pad = Math.max(0, Math.floor((columns - line.text.length) / 2));
        out.push(`${' '.repeat(pad)}${line.text}`);
      } else {
        out.push(line.text);
      }
    }
  }
  return out.join('\n');
}
