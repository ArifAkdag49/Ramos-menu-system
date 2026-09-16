import { describe, expect, it } from 'vitest';
import { addLine, cartTotalCents, lineKey, toSubmitItems } from './cart';
import type { CartLine, MenuProduct } from './domain';

const base = { productId: 'p05', variantId: 'k', optionIds: ['kr', 'kn'], removedIngredientIds: ['zw'], note: '', quantity: 1 };

describe('cart', () => {
  it('anahtar sıradan bağımsızdır, notu kırpar', () => {
    expect(lineKey('p05', { variantId: 'k', optionIds: ['kr', 'kn'], removedIngredientIds: [] }, ' x '))
      .toBe(lineKey('p05', { variantId: 'k', optionIds: ['kn', 'kr'], removedIngredientIds: [] }, 'x'));
  });
  it('aynı kombinasyon adet artırır (en fazla 99); farklı kombinasyon yeni satır', () => {
    let lines: CartLine[] = addLine([], base);
    lines = addLine(lines, { ...base, quantity: 2 });
    expect(lines).toHaveLength(1);
    expect(lines[0]!.quantity).toBe(3);
    lines = addLine(lines, { ...base, removedIngredientIds: [] });
    expect(lines).toHaveLength(2);
    expect(addLine([{ ...lines[0]!, quantity: 98 }], { ...base, quantity: 5 })[0]!.quantity).toBe(99);
  });
  it('toplam ve gönderim biçimi', () => {
    const p = { id: 'p05', base_price_cents: null, variants: [{ id: 'k', price_cents: 850 }],
      groups: [{ options: [{ id: 'kn', price_delta_cents: 0 }, { id: 'kr', price_delta_cents: 100 }] }] } as unknown as MenuProduct;
    const lines = addLine([], { ...base, quantity: 2 });
    expect(cartTotalCents(lines, new Map([['p05', p]]))).toBe(2 * 950);
    expect(toSubmitItems(lines)).toEqual([{ product_id: 'p05', variant_id: 'k', quantity: 2,
      option_ids: ['kr', 'kn'], removed_ingredient_ids: ['zw'], note: null }]);
  });
});
