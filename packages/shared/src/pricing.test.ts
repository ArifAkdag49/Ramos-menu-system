import { describe, expect, it } from 'vitest';
import type { MenuGroup, MenuProduct } from './domain';
import { defaultSelection, needsSheet, toggleOption, unitPriceCents, validateSelection } from './pricing';

const sauce: MenuGroup = { id: 'g-s', name_de: 'Soße', name_tr: 'Sos', min_select: 1, max_select: 3,
  ticket_format: 'label_values', sort: 1, options: [
    { id: 'kn', name_de: 'Knoblauch', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 1 },
    { id: 'kr', name_de: 'Kräuter', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 2 },
    { id: 'sc', name_de: 'Scharfe Soße', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 3 },
    { id: 'oh', name_de: 'ohne Soße', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: true, sort: 4 }] };
const beilage: MenuGroup = { id: 'g-b', name_de: 'Beilage', name_tr: null, min_select: 1, max_select: 1,
  ticket_format: 'values_only', sort: 0, options: [
    { id: 'po', name_de: 'Pommes', name_tr: null, price_delta_cents: 0, is_default: true, is_exclusive: false, sort: 1 },
    { id: 're', name_de: 'Reis', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 2 }] };
const extras: MenuGroup = { id: 'g-e', name_de: 'Extras', name_tr: null, min_select: 0, max_select: 2,
  ticket_format: 'plus_each', sort: 2, options: [
    { id: 'wk', name_de: 'Extra Weichkäse', name_tr: null, price_delta_cents: 100, is_default: false, is_exclusive: false, sort: 1 },
    { id: 'fl', name_de: 'Extra Fleisch', name_tr: null, price_delta_cents: 200, is_default: false, is_exclusive: false, sort: 2 }] };
const teller: MenuProduct = { id: 'p08', category_id: 'c', code: '08', name: 'Drehspieß Teller', description: null,
  base_price_cents: null, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [
    { id: 'h', name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: 1250, is_default: true, sort: 1 },
    { id: 'k', name_de: 'Kalb', name_tr: 'Dana', price_cents: 1350, is_default: false, sort: 2 }],
  ingredients: [{ id: 'zw', name_de: 'Zwiebeln', name_tr: 'Soğan', sort: 1 }],
  groups: [beilage, sauce, extras] };
const cola: MenuProduct = { ...teller, id: 'cola', code: null, name: 'Cola 0,33 l', base_price_cents: 250,
  variants: [], ingredients: [], groups: [] };

describe('pricing', () => {
  it('varsayılan seçim: varsayılan varyant + varsayılan seçenekler', () => {
    expect(defaultSelection(teller)).toEqual({ variantId: 'h', optionIds: ['po'], removedIngredientIds: [] });
  });
  it('birim fiyat = varyant + seçenek farkları; varyantsızda taban fiyat', () => {
    expect(unitPriceCents(teller, { variantId: 'k', optionIds: ['po', 'kn', 'wk', 'fl'], removedIngredientIds: ['zw'] }))
      .toBe(1350 + 100 + 200);
    expect(unitPriceCents(cola, { variantId: null, optionIds: [], removedIngredientIds: [] })).toBe(250);
  });
  it('doğrulama sunucu anahtarlarını üretir', () => {
    expect(validateSelection(teller, { variantId: null, optionIds: ['po', 'kn'], removedIngredientIds: [] }))
      .toEqual([{ key: 'variant_required' }]);
    expect(validateSelection(teller, { variantId: 'h', optionIds: ['po'], removedIngredientIds: [] }))
      .toEqual([{ key: 'option_group_min', groupId: 'g-s' }]);
    expect(validateSelection(teller, { variantId: 'h', optionIds: ['po', 'kn', 'oh'], removedIngredientIds: [] }))
      .toEqual([{ key: 'option_exclusive_conflict', groupId: 'g-s' }]);
    expect(validateSelection(teller, { variantId: 'h', optionIds: ['po', 'kn'], removedIngredientIds: [] })).toEqual([]);
  });
  it('toggleOption: radyo, exclusive, max sınırı', () => {
    expect(toggleOption(beilage, ['po'], 're')).toEqual(['re']);            // tekli grup → değiştirir
    expect(toggleOption(beilage, ['po'], 'po')).toEqual(['po']);            // min=max=1 → seçili kalır
    expect(toggleOption(sauce, ['kn', 'kr'], 'oh')).toEqual(['oh']);        // exclusive → diğerlerini siler
    expect(toggleOption(sauce, ['oh'], 'kn')).toEqual(['kn']);              // normal seçim exclusive'i siler
    expect(toggleOption(sauce, ['kn', 'kr', 'sc'], 'kn')).toEqual(['kr', 'sc']);
    expect(toggleOption(extras, ['wk', 'fl'], 'wk')).toEqual(['fl']);
    expect(toggleOption({ ...extras, max_select: 1 }, ['wk'], 'fl')).toEqual(['fl']);
    expect(toggleOption({ ...sauce, max_select: 2 }, ['kn', 'kr'], 'sc')).toEqual(['kn', 'kr']); // max dolu → değişmez
  });
  it('panel gerekmeyen ürün tek dokunuşla eklenir', () => {
    expect(needsSheet(cola)).toBe(false);
    expect(needsSheet(teller)).toBe(true);
  });
});
