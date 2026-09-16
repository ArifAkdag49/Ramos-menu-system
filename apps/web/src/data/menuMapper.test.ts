import { describe, expect, it } from 'vitest';
import { mapProducts } from './menuMapper';

const row = {
  id: 'p', category_id: 'c', code: '08', name: 'Drehspieß Teller', description: null, base_price_cents: null,
  allergens: null, is_sold_out: false, sort: 1,
  product_variants: [
    { id: 'k', name_de: 'Kalb', name_tr: 'Dana', price_cents: 1350, is_default: false, sort: 2, is_active: true },
    { id: 'h', name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: 1250, is_default: true, sort: 1, is_active: true },
    { id: 'x', name_de: 'Alt', name_tr: null, price_cents: 1, is_default: false, sort: 3, is_active: false }],
  product_ingredients: [{ sort: 2, ingredients: { id: 'z', name_de: 'Zwiebeln', name_tr: 'Soğan', is_active: true } },
                        { sort: 1, ingredients: { id: 't', name_de: 'Tomaten', name_tr: 'Domates', is_active: true } }],
  product_option_groups: [
    { sort: 2, option_groups: { id: 's', name_de: 'Soße', name_tr: 'Sos', min_select: 1, max_select: 3, ticket_format: 'label_values',
        sort: 9, is_active: true, options: [
          { id: 'b', name_de: 'Kräuter', name_tr: 'Otlu', price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 2, is_active: true },
          { id: 'a', name_de: 'Knoblauch', name_tr: 'Sarımsaklı', price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 1, is_active: true }] } },
    { sort: 1, option_groups: { id: 'g', name_de: 'Beilage', name_tr: 'Garnitür', min_select: 1, max_select: 1,
        ticket_format: 'values_only', sort: 1, is_active: false, options: [] } }],
};

describe('mapProducts', () => {
  it('pasifleri eler, her şeyi sort alanına göre dizer, grup sırasını ürün bağlantısından alır', () => {
    const [p] = mapProducts([row as never]);
    expect(p!.variants.map((v) => v.id)).toEqual(['h', 'k']);
    expect(p!.ingredients.map((i) => i.id)).toEqual(['t', 'z']);
    expect(p!.groups.map((g) => g.id)).toEqual(['s']);
    expect(p!.groups[0]!.options.map((o) => o.id)).toEqual(['a', 'b']);
  });
});
