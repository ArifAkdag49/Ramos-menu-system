import { describe, expect, it } from 'vitest';
import { linesToText, renderTicket, sanitize, transliterate, wrap, type Line, type TicketPayload } from './ticket';

type TextLine = Extract<Line, { kind: 'text' }>;
const isText = (l: Line): l is TextLine => l.kind === 'text';

const order: TicketPayload = {
  kind: 'order', header: "RAMO'S · KÜCHE", footer: '', table: 'Tisch 12', orderNo: 47, round: 2,
  createdAt: '2026-09-15T17:42:10Z', waiter: 'Ahmet', note: 'Kinderstuhl',
  items: [
    { qty: 3, code: null, name: 'Cola 0,33 l', isBeverage: true, variant: null, without: [], groups: [], note: null },
    { qty: 2, code: '05', name: 'Drehspieß Sandwich', isBeverage: false, variant: 'Kalb', without: ['Zwiebeln', 'Tomaten'],
      groups: [{ label: 'Soße', format: 'label_values', values: ['Knoblauch', 'Kräuter'] },
               { label: 'Schärfe', format: 'values_only', values: ['scharf (Chili)'] },
               { label: 'Extras', format: 'plus_each', values: ['Extra Weichkäse'] }], note: 'Soße extra' },
  ],
};

describe('renderTicket', () => {
  const lines = renderTicket(order);
  const texts = lines.flatMap((l) => (l.kind === 'text' ? [l.text] : l.kind === 'rule' ? ['---'] : []));

  it('başlık, ek sipariş bandı, masa ve meta', () => {
    expect(lines[0]).toMatchObject({ kind: 'text', text: "RAMO'S · KÜCHE", align: 'center', bold: true });
    expect(lines[1]).toMatchObject({ text: 'NACHBESTELLUNG', invert: true, height: 2 });
    expect(lines[2]).toMatchObject({ text: 'TISCH 12', height: 2, width: 2, bold: true });
    expect(texts).toContain('Bestellung #047 · Runde 2');
    expect(texts).toContain('15.09.2026 19:42 · Kellner: Ahmet');   // 17:42Z = 19:42 Berlin (CEST)
  });

  it('meta ile kalem listesi arasında ayraç (rule) var (spec §9.3)', () => {
    const idx = lines.findIndex((l) => l.kind === 'text' && l.text === '15.09.2026 19:42 · Kellner: Ahmet');
    expect(idx).toBeGreaterThan(0);
    expect(lines[idx + 1]).toEqual({ kind: 'rule' });
  });

  it('yiyecek önce, içecek GETRÄNKE altında; OHNE ters renk', () => {
    const iFood = texts.indexOf('2x 05 Drehspieß Sandwich');
    const iBev = texts.indexOf('GETRÄNKE');
    expect(iFood).toBeGreaterThan(0);
    expect(iBev).toBeGreaterThan(iFood);
    expect(texts[iBev + 1]).toBe('3x Cola 0,33 l');
    expect(lines.find((l) => l.kind === 'text' && l.text === '   OHNE: Zwiebeln, Tomaten'))
      .toMatchObject({ invert: true, bold: true });
    expect(texts).toEqual(expect.arrayContaining([
      '   Kalb', '   Soße: Knoblauch + Kräuter', '   scharf (Chili)', '   + Extra Weichkäse', '   Hinweis: Soße extra',
      'Hinweis: Kinderstuhl']));
    expect(lines.at(-1)).toEqual({ kind: 'feed', lines: 3 });
  });

  it('ilk turda bant yok; STORNO ve TISCHWECHSEL bantları', () => {
    expect(renderTicket({ ...order, round: 1 })[1]).toMatchObject({ text: 'TISCH 12' });
    const st = renderTicket({ ...order, kind: 'storno', refOrderNo: 47, reason: 'Gast hat storniert' });
    expect(st[1]).toMatchObject({ text: '*** STORNO ***' });
    expect(linesToText(st)).toContain('zu Bestellung #047');
    expect(linesToText(st)).toContain('15.09.2026 19:42 · Kellner: Ahmet'); // R47: STORNO da tarih + garson bilgisi taşır
    expect(linesToText(st)).toContain('Grund: Gast hat storniert');
    const mv = renderTicket({ ...order, kind: 'table_move', fromTable: 'Tisch 3', toTable: 'Tisch 5', openOrderNos: [47, 52], items: [] });
    expect(linesToText(mv)).toContain('TISCH 3 -> TISCH 5');
    expect(linesToText(mv)).toContain('Offene Bestellungen: #047, #052');
  });

  it('48 kolonu aşan satır asılı girintiyle kaydırılır', () => {
    expect(wrap('2x 76 Karışık Izgara (3 Personen) mit Pommes oder Reis und extra Salat', 48, 3))
      .toEqual(['2x 76 Karışık Izgara (3 Personen) mit Pommes', '   oder Reis und extra Salat']);
    for (const l of renderTicket(order)) if (l.kind === 'text') expect(l.text.length * (l.width ?? 1)).toBeLessThanOrEqual(48);
  });

  it('transliterasyon Türkçe harfleri ASCII yapar, Almanca harflere dokunmaz', () => {
    expect(transliterate('Kuzu Şiş · İşkembe · Yoğurtlu · Kräuter')).toBe('Kuzu Sis · Iskembe · Yogurtlu · Kräuter');
    expect(linesToText(renderTicket({ ...order, items: [{ ...order.items[1]!, name: 'Kuzu Şiş' }] }, { transliterate: true })))
      .toContain('2x 05 Kuzu Sis');
  });

  it('NACHBESTELLUNG (addition) ve NACHDRUCK (reprint) bantları', () => {
    expect(renderTicket({ ...order, kind: 'addition' })[1]).toMatchObject({ text: 'NACHBESTELLUNG' });
    expect(renderTicket({ ...order, kind: 'reprint' })[1]).toMatchObject({ text: 'NACHDRUCK' });
  });

  it('TESTDRUCK: yazıcı bilgisi, sampleLine ve örnek kalemler', () => {
    const test: TicketPayload = {
      kind: 'test', header: "RAMO'S · KÜCHE", table: 'Test', createdAt: '2026-09-15T17:42:10Z',
      settings: { host: '192.168.123.100', port: 9100, codepage: 'PC857', codepageNumber: 61, transliterate: false },
      sampleLine: 'ABCÇDEFĞĞHIİJKLMNOÖPRSŞTUÜVYZ',
      items: [{ qty: 1, code: null, name: 'Testkalem', isBeverage: false, variant: null, without: [], groups: [], note: null }],
    };
    const t = renderTicket(test);
    expect(t[1]).toMatchObject({ text: 'TESTDRUCK', invert: true, height: 2 });
    const tTexts = linesToText(t);
    expect(tTexts).toContain('15.09.2026 19:42'); // R45: TESTDRUCK tarihi de basar
    expect(tTexts).toContain('Drucker: 192.168.123.100:9100');
    expect(tTexts).toContain('Zeichensatz: PC857 (61)');
    expect(tTexts).toContain('Transliteration: aus');
    expect(tTexts).toContain('1x Testkalem');
    expect(t.at(-1)).toEqual({ kind: 'feed', lines: 3 });
  });

  it('R46: uzun masa adı 24 kolon bütçesinde (width:2) kaydırılır; hiçbir satır 48 kolonu aşmaz', () => {
    const p: TicketPayload = { ...order, table: 'Terrasse Tisch 12 am Fenster ganz hinten' };
    const result = renderTicket(p);
    for (const l of result) if (isText(l)) expect(l.text.length * (l.width ?? 1)).toBeLessThanOrEqual(48);
    const tableLines = result.filter((l): l is TextLine => isText(l) && l.width === 2);
    expect(tableLines.length).toBeGreaterThan(1); // uzun ad gerçekten sarmalanmış
  });

  it('R46: uzun TISCH x -> TISCH y satırı da 24 kolon bütçesinde kaydırılır', () => {
    const mv = renderTicket({
      ...order, kind: 'table_move', items: [], openOrderNos: [47],
      fromTable: 'Terrasse Tisch 12 ganz hinten', toTable: 'Innenraum Tisch 27 am Fenster',
    });
    for (const l of mv) if (isText(l)) expect(l.text.length * (l.width ?? 1)).toBeLessThanOrEqual(48);
  });

  it('renderTicket içinde: uzun kalem adı 3 boşluklu, uzun OHNE listesi 6 boşluklu devamla kaydırılır (48 kolon bütçesi her satırda geçerli)', () => {
    const longName = 'Gegrilltes Schweinefilet mit gerösteten Röstzwiebeln und Kräuterbutter Sauce Extra Scharf Bitte';
    const longWithout = ['Zwiebeln', 'Tomaten', 'Gurken', 'Peperoni', 'Oliven', 'Mais', 'Röstzwiebeln', 'Extra Käse', 'Sauce Hollandaise'];
    const p: TicketPayload = {
      ...order,
      items: [{ qty: 1, code: '99', name: longName, isBeverage: false, variant: null, without: longWithout, groups: [], note: null }],
    };
    const result = renderTicket(p);
    for (const l of result) if (isText(l)) expect(l.text.length * (l.width ?? 1)).toBeLessThanOrEqual(48);

    const mainLines = result.filter((l): l is TextLine => isText(l) && l.height === 2 && l.bold === true && !l.invert && l.width !== 2);
    expect(mainLines.length).toBeGreaterThan(1);
    expect(mainLines[0]!.text.startsWith(' ')).toBe(false); // ilk parça sola dayalı
    expect(mainLines[1]!.text.startsWith('   ')).toBe(true); // devam: tam 3 boşluk
    expect(mainLines[1]!.text.startsWith('    ')).toBe(false);

    const oheLines = result.filter((l): l is TextLine => isText(l) && l.invert === true && l.bold === true && !l.height);
    expect(oheLines.length).toBeGreaterThan(1);
    expect(oheLines[0]!.text.startsWith('   ')).toBe(true); // ilk alt satır: 3 boşluk
    expect(oheLines[0]!.text.startsWith('      ')).toBe(false);
    expect(oheLines[1]!.text.startsWith('      ')).toBe(true); // devam: 3 + 3 = 6 boşluk
    expect(oheLines[1]!.text.startsWith('       ')).toBe(false);
  });
});

describe('wrap — aşırı uzun kelime hiçbir harf kaybetmeden bölünür (R43)', () => {
  const stripSpaces = (s: string) => s.replace(/\s+/g, '');
  const longWord = 'Rindfleischetikettierungsueberwachungsaufgabenuebertragungsgesetz';

  it('tek başına aşırı uzun kelime: boş baş satır yok, harf kaybı yok', () => {
    const result = wrap(longWord, 48, 3);
    expect(result.length).toBeGreaterThan(1);
    expect(result[0]).not.toBe('');
    expect(result.every((l) => l.length > 0)).toBe(true);
    for (const l of result) expect(l.length).toBeLessThanOrEqual(48);
    expect(stripSpaces(result.join(''))).toBe(stripSpaces(longWord));
  });

  it('aşırı uzun kelime dizinin İLK kelimesiyse boş baş satır üretilmez', () => {
    const text = `${longWord} mehr Info`;
    const result = wrap(text, 48, 3);
    expect(result[0]).not.toBe('');
    expect(result.every((l) => l.length > 0)).toBe(true);
    for (const l of result) expect(l.length).toBeLessThanOrEqual(48);
    expect(stripSpaces(result.join(''))).toBe(stripSpaces(text));
  });

  it('aşırı uzun kelime normal kelimelerden SONRA gelirse harf kaybı olmadan bölünür (bulgu 2 örneği)', () => {
    const text = `1x ${longWord}`;
    const result = wrap(text, 48, 3);
    expect(result[0]).toBe('1x'); // önceki normal kelime kendi satırında kalır
    expect(result.every((l) => l.length > 0)).toBe(true);
    for (const l of result) expect(l.length).toBeLessThanOrEqual(48);
    expect(stripSpaces(result.join(''))).toBe(stripSpaces(text));
  });

  it('R16 sabitlenen beklenti değişmeden geçer', () => {
    expect(wrap('2x 76 Karışık Izgara (3 Personen) mit Pommes oder Reis und extra Salat', 48, 3))
      .toEqual(['2x 76 Karışık Izgara (3 Personen) mit Pommes', '   oder Reis und extra Salat']);
  });
});

describe('sanitize', () => {
  it('ok işaretini, üç noktayı ve akıllı tırnakları ASCIIye çevirir; nokta (·) dokunulmaz kalır', () => {
    expect(sanitize('Führung → Küche … „Isot“ Biberi ‚extra‘ · scharf'))
      .toBe('Führung -> Küche ... "Isot" Biberi \'extra\' · scharf');
  });
});

describe('linesToText', () => {
  it('rule 48 tire basar; center metin boşlukla ortalanır; width:2 metin ortalanmadan olduğu gibi yazılır', () => {
    const lines: Line[] = [
      { kind: 'rule' },
      { kind: 'text', text: 'ABC', align: 'center' },
      { kind: 'text', text: 'WIDE', align: 'center', width: 2 },
      { kind: 'feed', lines: 2 },
    ];
    const rows = linesToText(lines).split('\n');
    expect(rows[0]).toBe('-'.repeat(48));
    expect(rows[1]).toBe(`${' '.repeat(Math.floor((48 - 3) / 2))}ABC`);
    expect(rows[2]).toBe('WIDE');
    expect(rows[3]).toBe('');
    expect(rows[4]).toBe('');
    expect(rows.length).toBe(5);
  });
});
