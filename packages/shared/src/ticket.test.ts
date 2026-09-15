import { describe, expect, it } from 'vitest';
import { linesToText, renderTicket, transliterate, wrap, type TicketPayload } from './ticket';

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
    expect(tTexts).toContain('Drucker: 192.168.123.100:9100');
    expect(tTexts).toContain('Zeichensatz: PC857 (61)');
    expect(tTexts).toContain('Transliteration: aus');
    expect(tTexts).toContain('1x Testkalem');
    expect(t.at(-1)).toEqual({ kind: 'feed', lines: 3 });
  });
});
