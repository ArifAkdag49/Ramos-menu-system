import { formatOrderNo } from './money';

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

// Flush-left first line, hanging `indent` on continuation lines — for item main lines
// and top-level closing lines (Hinweis/Grund/Offene Bestellungen/footer).
function pushWrapped(lines: Line[], text: string, columns: number, indent: number, style: TextStyle = {}): void {
  for (const part of wrap(text, columns, indent)) pushText(lines, part, style);
}

// Sub-lines under an item sit at a base indent of 3 spaces; a wrapped continuation
// hangs at 6. wrap() itself never indents its first line, so the budget is reserved
// up front (columns - 3) and the 3-space base is prepended to every returned part —
// wrap's own (hang - base) indent then lands the continuation at 3 + 3 = 6 total.
function pushSubLine(lines: Line[], text: string, columns: number, style: TextStyle = {}): void {
  const base = 3;
  const hang = 6;
  for (const part of wrap(text, columns - base, hang - base)) {
    pushText(lines, `${' '.repeat(base)}${part}`, style);
  }
}

// A width:2 (double-width) line only has columns/2 usable print columns (R46).
const DOUBLE_WIDTH_BUDGET = 24;

function pushDoubleWidth(lines: Line[], text: string, style: TextStyle = {}): void {
  for (const part of wrap(text, DOUBLE_WIDTH_BUDGET, 0)) pushText(lines, part, { ...style, width: 2 });
}

function renderItem(lines: Line[], item: TicketItem, columns: number, clean: (s: string) => string): void {
  const codePart = item.code ? `${clean(item.code)} ` : '';
  const mainText = `${item.qty}x ${codePart}${clean(item.name)}`;
  pushWrapped(lines, mainText, columns, 3, { bold: true, height: 2 });

  if (item.variant) pushSubLine(lines, clean(item.variant), columns);
  if (item.without.length > 0) {
    pushSubLine(lines, `OHNE: ${item.without.map(clean).join(', ')}`, columns, { invert: true, bold: true });
  }
  for (const group of item.groups) {
    if (group.format === 'plus_each') {
      for (const value of group.values) pushSubLine(lines, `+ ${clean(value)}`, columns);
    } else if (group.format === 'label_values') {
      pushSubLine(lines, `${clean(group.label)}: ${group.values.map(clean).join(' + ')}`, columns);
    } else {
      pushSubLine(lines, group.values.map(clean).join(', '), columns);
    }
  }
  if (item.note) pushSubLine(lines, `Hinweis: ${clean(item.note)}`, columns);
}

function renderItems(lines: Line[], items: TicketItem[], columns: number, clean: (s: string) => string): void {
  const food = items.filter((i) => !i.isBeverage);
  const drinks = items.filter((i) => i.isBeverage);
  for (const item of food) renderItem(lines, item, columns, clean);
  if (drinks.length > 0) {
    lines.push({ kind: 'rule' });
    pushText(lines, 'GETRÄNKE', { bold: true });
    for (const item of drinks) renderItem(lines, item, columns, clean);
  }
}

function closeTicket(lines: Line[], p: TicketPayload, columns: number, clean: (s: string) => string): void {
  if (p.footer) pushWrapped(lines, clean(p.footer), columns, 0, { align: 'center' });
  lines.push({ kind: 'feed', lines: 3 });
}

function renderOrderBody(lines: Line[], p: TicketPayload, columns: number, clean: (s: string) => string): void {
  pushDoubleWidth(lines, clean(p.table).toLocaleUpperCase('de-DE'), { height: 2, bold: true });

  // Meta: STORNO gets "zu Bestellung #NNN" instead of "Bestellung #NNN · Runde N", but
  // every kind on this path (order/addition/storno/reprint) still gets the date + waiter
  // line (R47) — the kitchen benefits from knowing when a cancellation was issued too.
  if (p.kind === 'storno') {
    if (p.refOrderNo != null) pushWrapped(lines, `zu Bestellung ${formatOrderNo(p.refOrderNo)}`, columns, 0);
  } else if (p.orderNo != null) {
    const round = p.round ?? 1;
    pushWrapped(lines, `Bestellung ${formatOrderNo(p.orderNo)}${round > 1 ? ` · Runde ${round}` : ''}`, columns, 0);
  }
  const kellner = p.waiter ? ` · Kellner: ${clean(p.waiter)}` : '';
  pushWrapped(lines, `${fmt(p.createdAt)}${kellner}`, columns, 0);

  // Spec §9.3: a rule separates the meta block from the item list.
  lines.push({ kind: 'rule' });
  renderItems(lines, p.items, columns, clean);

  lines.push({ kind: 'rule' });
  if (p.kind === 'storno') {
    if (p.reason) pushWrapped(lines, `Grund: ${clean(p.reason)}`, columns, 0, { bold: true });
  } else if (p.note) {
    pushWrapped(lines, `Hinweis: ${clean(p.note)}`, columns, 0, { bold: true });
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
  renderItems(lines, p.items, columns, clean);
  closeTicket(lines, p, columns, clean);
}

export function renderTicket(p: TicketPayload, opts: { columns?: number; transliterate?: boolean } = {}): Line[] {
  const columns = opts.columns ?? 48;
  const doTransliterate = opts.transliterate ?? false;
  const clean = (s: string): string => (doTransliterate ? transliterate(sanitize(s)) : sanitize(s));

  const lines: Line[] = [];
  pushText(lines, clean(p.header), { align: 'center', bold: true });

  const banner = bannerFor(p);
  if (banner) pushText(lines, banner, { align: 'center', bold: true, invert: true, height: 2 });

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
