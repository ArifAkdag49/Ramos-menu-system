import { describe, expect, it } from 'vitest';
import { billLineLabel, parseBill, type BillLine } from './bill';

const line = (over: Partial<BillLine> = {}): BillLine => ({
  product_code: '05', product_name: 'Drehspieß Sandwich', variant_name_de: 'Kalb', variant_name_tr: 'Dana',
  extras: ['Extra Weichkäse'], unit_price_cents: 950, quantity: 2, line_total_cents: 1900, ...over,
});

describe('parseBill', () => {
  it('RPC yanıtını okunur bir hesaba çevirir', () => {
    const bill = parseBill({
      session_id: 's1', table: 'Tisch 12', opened_at: '2026-09-15T17:00:00Z',
      lines: [line()], total_cents: 1900,
    });
    expect(bill?.table).toBe('Tisch 12');
    expect(bill?.total_cents).toBe(1900);
    expect(bill?.lines).toHaveLength(1);
    expect(bill?.lines[0]?.extras).toEqual(['Extra Weichkäse']);
  });

  it('veri yoksa ya da beklenen biçimde değilse null döner', () => {
    expect(parseBill(undefined)).toBeNull();
    expect(parseBill(null)).toBeNull();
    expect(parseBill('bozuk')).toBeNull();
    expect(parseBill({ total_cents: 5 })).toBeNull();
  });

  it('boş hesabı kabul eder', () => {
    expect(parseBill({ session_id: 's', table: 'Tisch 1', opened_at: null, lines: [], total_cents: 0 })?.lines).toEqual([]);
  });
});

describe('billLineLabel', () => {
  it('kod · ad · (varyant) · +ekstralar', () => {
    expect(billLineLabel(line(), 'de')).toBe('05 Drehspieß Sandwich (Kalb) +Extra Weichkäse');
  });

  it('kodu olmayan ürün doğrudan adıyla başlar', () => {
    expect(billLineLabel(line({ product_code: null, product_name: 'Cola 0,33 l', variant_name_de: null, variant_name_tr: null, extras: [] }), 'de')).toBe(
      'Cola 0,33 l',
    );
  });

  it('TR arayüzde varyantın Türkçe adı kullanılır', () => {
    expect(billLineLabel(line(), 'tr')).toBe('05 Drehspieß Sandwich (Dana) +Extra Weichkäse');
  });

  it('birden çok ekstra ayrı ayrı + ile yazılır', () => {
    expect(billLineLabel(line({ extras: ['Extra Weichkäse', 'Extra Fleisch'] }), 'de')).toBe(
      '05 Drehspieß Sandwich (Kalb) +Extra Weichkäse +Extra Fleisch',
    );
  });
});
