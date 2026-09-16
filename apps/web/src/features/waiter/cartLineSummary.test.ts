import type { MenuGroup, MenuProduct } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import { cartLineSummary } from './cartLineSummary';

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

const line = (over: Partial<Parameters<typeof cartLineSummary>[1]> = {}) => ({
  variantId: null, optionIds: [] as string[], removedIngredientIds: [] as string[], note: '', ...over,
});

describe('cartLineSummary', () => {
  it('spec §8.2 sırası: varyant · ÇIKAR · seçimler · not', () => {
    expect(
      cartLineSummary(doener, line({ variantId: 'k', optionIds: ['kn', 'kr', 'wk'], removedIngredientIds: ['zw'], note: 'gut durch' }), 'de', 'OHNE'),
    ).toBe('Kalb · OHNE Zwiebeln · Knoblauch+Kräuter · +Weichkäse · gut durch');
  });

  it('fiş biçiminden ayrıdır: grup etiketi yazılmaz, `plus_each` her seçeneği + ile yazar', () => {
    expect(cartLineSummary(doener, line({ variantId: 'h', optionIds: ['kn', 'wk'] }), 'de', 'OHNE')).toBe(
      'Hähnchen · Knoblauch · +Weichkäse',
    );
  });

  it('çıkarılan malzemeler ürün sırasına göre tek satırda toplanır', () => {
    expect(cartLineSummary(doener, line({ variantId: 'h', removedIngredientIds: ['to', 'zw'] }), 'de', 'OHNE')).toBe(
      'Hähnchen · OHNE Zwiebeln, Tomaten',
    );
  });

  it('TR arayüzde yerel adlar ve TR öneki kullanılır', () => {
    expect(cartLineSummary(doener, line({ variantId: 'k', optionIds: ['kn'], removedIngredientIds: ['zw'] }), 'tr', 'ÇIKAR')).toBe(
      'Dana · ÇIKAR Soğan · Sarımsaklı',
    );
  });

  it('seçimsiz ürün boş özet verir', () => {
    expect(cartLineSummary(cola, line(), 'de', 'OHNE')).toBe('');
  });

  it('yalnız not varsa yalnız not döner', () => {
    expect(cartLineSummary(cola, line({ note: 'ohne Eis' }), 'de', 'OHNE')).toBe('ohne Eis');
  });
});
