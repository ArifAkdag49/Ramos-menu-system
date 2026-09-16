import { renderTicket, type TicketPayload } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import { renderTicketForPrinter, toAscii, toAsciiKeepingWidth } from './ascii';

const payload: TicketPayload = {
  kind: 'order',
  header: 'KÜCHE',
  table: 'Tisch 5',
  orderNo: 7,
  round: 1,
  createdAt: '2026-09-16T17:00:00Z',
  waiter: 'Ayşe Yılmaz',
  note: 'soğan az',
  items: [
    {
      qty: 1, code: '05', name: 'Drehspieß Sandwich', isBeverage: false, variant: 'Hähnchen', priceCents: 850,
      without: ['Zwiebeln'], groups: [{ label: 'Soße', format: 'label_values', values: ['Kräuter'] }], note: null,
    },
    { qty: 2, code: '59', name: 'Kuzu Şiş', isBeverage: false, variant: null, without: [], groups: [], note: 'İyi pişmiş', priceCents: 3190 },
    { qty: 1, code: null, name: 'Ayran', isBeverage: true, variant: null, without: [], groups: [], note: null, priceCents: 250 },
  ],
};

const textLines = (lines: ReturnType<typeof renderTicketForPrinter>) => lines.flatMap((l) => (l.kind === 'text' ? [l] : []));
const texts = (lines: ReturnType<typeof renderTicketForPrinter>) => textLines(lines).map((l) => l.text).join('\n');

describe('toAscii', () => {
  it('Almanca harfleri Almanca yazım kuralıyla, Türkçe harfleri düz harfle açar', () => {
    expect(toAscii('Drehspieß · Hähnchen · Käse · Köfte · Gemüse')).toBe('Drehspiess - Haehnchen - Kaese - Koefte - Gemuese');
    expect(toAscii('Kuzu Şiş · Karışık Izgara · Yoğurtlu · Açık · İşkembe Çorbası')).toBe('Kuzu Sis - Karisik Izgara - Yogurtlu - Acik - Iskembe Corbasi');
  });

  it('büyük harfli kelimede açılım da büyük: GETRÄNKE → GETRAENKE, ama Äpfel → Aepfel', () => {
    expect(toAscii('GETRÄNKE')).toBe('GETRAENKE');
    expect(toAscii('ÄÖÜ äöü')).toBe('AEOEUE aeoeue');
    expect(toAscii('Äpfel · Öl · Übersicht')).toBe('Aepfel - Oel - Uebersicht');
    expect(toAscii('KÜCHE')).toBe('KUECHE');
  });

  it('tabloda olmayan aksanlı harfleri aksansız yazar, çevrilemeyeni ? yapar, ASCII metne dokunmaz', () => {
    expect(toAscii('Crème brûlée, Jalapeño')).toBe('Creme brulee, Jalapeno');
    expect(toAscii('辣')).toBe('?');
    expect(toAscii('Tisch 12 #*-+ 0123456789')).toBe('Tisch 12 #*-+ 0123456789');
  });
});

describe('toAsciiKeepingWidth', () => {
  it('uzayan satırda fazlalığı sütun dolgusundan kırpar: fiyat sütunu yerinde kalır', () => {
    const line = `1x   05 Drehspieß Sandwich${' '.repeat(16)}8,50 €`;
    const out = toAsciiKeepingWidth(line);
    expect(out.length).toBe(line.length);
    expect(out.endsWith('8,50 EUR')).toBe(true);
    expect(out).toContain('Drehspiess');
  });

  it('satır başı girintisine dokunmaz', () => {
    expect(toAsciiKeepingWidth('        Soße: Kräuter')).toBe('        Sosse: Kraeuter');
  });
});

describe('renderTicketForPrinter', () => {
  it('ascii kapalıyken önceki davranış: çıktı renderTicket ile birebir aynı', () => {
    expect(renderTicketForPrinter(payload, { transliterate: false })).toEqual(renderTicket(payload, { transliterate: false }));
  });

  it('ascii açıkken fişin HER satırı ASCII ve hiçbir satır normal fişten geniş değil', () => {
    const plain = renderTicket(payload);
    const out = renderTicketForPrinter(payload, { transliterate: false, ascii: true });
    const joined = texts(out);
    expect(joined).toContain('Drehspiess Sandwich');
    expect(joined).toContain('Kuzu Sis');
    expect(joined).toContain('Ayse Yilmaz');
    expect([...joined].every((ch) => ch.charCodeAt(0) < 0x80)).toBe(true);

    const maxWidth = (lines: ReturnType<typeof textLines>, w: 1 | 2) =>
      Math.max(0, ...lines.filter((l) => (l.width ?? 1) === w).map((l) => l.text.length));
    expect(maxWidth(textLines(out), 1)).toBeLessThanOrEqual(Math.max(48, maxWidth(textLines(plain), 1)));
    expect(maxWidth(textLines(out), 2)).toBeLessThanOrEqual(Math.max(24, maxWidth(textLines(plain), 2)));
  });
});
