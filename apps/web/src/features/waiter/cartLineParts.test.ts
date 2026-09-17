import type { MenuGroup, MenuProduct } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import { cartLineParts } from './cartLineParts';

const sauce: MenuGroup = {
  id: 'g-s', name_de: 'Soße', name_tr: 'Sos', min_select: 1, max_select: 3, ticket_format: 'label_values', sort: 1,
  options: [
    { id: 'kn', name_de: 'Knoblauch', name_tr: 'Sarımsaklı', price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 1 },
    { id: 'kr', name_de: 'Kräuter', name_tr: 'Otlu', price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 2 },
  ],
};
const extras: MenuGroup = {
  id: 'g-e', name_de: 'Extras', name_tr: 'Ekstralar', min_select: 0, max_select: 2, ticket_format: 'plus_each', sort: 2,
  options: [
    { id: 'wk', name_de: 'Weichkäse', name_tr: 'Beyaz peynir', price_delta_cents: 100, is_default: false, is_exclusive: false, sort: 1 },
  ],
};
const doener: MenuProduct = {
  id: 'p05', category_id: 'c', code: '05', name: 'Drehspieß Sandwich', description: null,
  base_price_cents: null, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [
    { id: 'h', name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: 750, is_default: true, sort: 1 },
    { id: 'k', name_de: 'Kalb', name_tr: 'Dana', price_cents: 850, is_default: false, sort: 2 },
  ],
  ingredients: [
    { id: 'zw', name_de: 'Zwiebeln', name_tr: 'Soğan', sort: 1 },
    { id: 'to', name_de: 'Tomaten', name_tr: 'Domates', sort: 2 },
  ],
  // Bilerek `sort` sırasının tersinde: özet grup sırasını `sort`'tan almalı.
  groups: [extras, sauce],
};
const cola: MenuProduct = {
  id: 'p-cola', category_id: 'c2', code: null, name: 'Cola 0,33 l', description: null,
  base_price_cents: 250, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [], ingredients: [], groups: [],
};

const line = (over: Partial<Parameters<typeof cartLineParts>[1]> = {}) => ({
  variantId: null, optionIds: [] as string[], removedIngredientIds: [] as string[], note: '', ...over,
});

describe('cartLineParts', () => {
  it('spec §8.2 sırası: varyant · ÇIKAR · seçimler · not', () => {
    expect(
      cartLineParts(doener, line({ variantId: 'k', optionIds: ['kn', 'kr', 'wk'], removedIngredientIds: ['zw'], note: 'gut durch' }), 'de', 'OHNE'),
    ).toEqual({
      variant: 'Kalb',
      without: 'OHNE Zwiebeln',
      options: ['Knoblauch+Kräuter', '+Weichkäse'],
      note: 'gut durch',
    });
  });

  it('fiş biçiminden ayrıdır: grup etiketi yazılmaz, `plus_each` her seçeneği + ile yazar', () => {
    expect(cartLineParts(doener, line({ variantId: 'h', optionIds: ['kn', 'wk'] }), 'de', 'OHNE')).toEqual({
      variant: 'Hähnchen',
      without: null,
      options: ['Knoblauch', '+Weichkäse'],
      note: null,
    });
  });

  it('çıkarılan malzemeler ürün sırasına göre tek satırda toplanır', () => {
    expect(cartLineParts(doener, line({ variantId: 'h', removedIngredientIds: ['to', 'zw'] }), 'de', 'OHNE').without).toBe(
      'OHNE Zwiebeln, Tomaten',
    );
  });

  it('TR arayüzde yerel adlar ve TR öneki kullanılır', () => {
    expect(cartLineParts(doener, line({ variantId: 'k', optionIds: ['kn'], removedIngredientIds: ['zw'] }), 'tr', 'ÇIKAR')).toEqual({
      variant: 'Dana',
      without: 'ÇIKAR Soğan',
      options: ['Sarımsaklı'],
      note: null,
    });
  });

  it('seçimsiz ürün boş özet verir', () => {
    expect(cartLineParts(cola, line(), 'de', 'OHNE')).toEqual({
      variant: null,
      without: null,
      options: [],
      note: null,
    });
  });

  it('serbest ekstra ücretler seçeneklerden sonra tutarıyla yazılır', () => {
    const parts = cartLineParts(
      doener,
      line({ variantId: 'h', optionIds: ['wk'], extraCharges: [{ label: 'ekstra peynir', cents: 150 }] }),
      'tr',
      'ÇIKAR',
    );
    expect(parts.options).toHaveLength(2);
    expect(parts.options[0]).toBe('+Beyaz peynir');
    expect(parts.options[1]).toMatch(/^\+ekstra peynir \(\+1,50\s€\)$/);
  });

  it('yalnız not varsa yalnız not döner', () => {
    expect(cartLineParts(cola, line({ note: 'ohne Eis' }), 'de', 'OHNE')).toEqual({
      variant: null,
      without: null,
      options: [],
      note: 'ohne Eis',
    });
  });
});

/**
 * Y4 (M3 tasarım kapısı): sepet ve onay ekranında ÇIKAR, "A · B · C" orta-nokta zincirinin
 * ortasında 14 px gri metin olarak duruyordu — oysa gönderimden önceki SON kontrol noktası bu
 * ekran ve alerji/tercih hatası tam burada yakalanmalı. Biçimlendirici artık ÇIKAR'ı **ayrı bir
 * alan** olarak veriyor; arayüz onu masa detayındaki (`ItemLinesView`) gibi kendi satırında ve
 * danger tonunda çiziyor. Fiş biçiminden ayrı olma kuralı korunuyor: grup etiketi hâlâ basılmıyor.
 */
describe('cartLineParts — ÇIKAR ayrı alandır (Y4)', () => {
  it('ÇIKAR seçim satırlarının arasına karışmaz', () => {
    const parts = cartLineParts(
      doener,
      line({ variantId: 'k', optionIds: ['kn', 'wk'], removedIngredientIds: ['zw', 'to'] }),
      'tr',
      'ÇIKAR',
    );
    expect(parts.options).not.toContain('ÇIKAR Soğan, Domates');
    expect(parts.options.join(' ')).not.toMatch(/ÇIKAR/);
    expect(parts.without).toBe('ÇIKAR Soğan, Domates');
  });

  it('hiçbir alan orta-nokta zinciri üretmez (DESIGN.md §1)', () => {
    const parts = cartLineParts(
      doener,
      line({ variantId: 'k', optionIds: ['kn', 'kr', 'wk'], removedIngredientIds: ['zw'], note: 'not' }),
      'tr',
      'ÇIKAR',
    );
    for (const value of [parts.variant, parts.without, parts.note, ...parts.options])
      expect(value ?? '').not.toContain('·');
  });
});
