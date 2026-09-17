import type { CartLine, MenuProduct, Selection, SubmitItem } from './domain';
import { unitPriceCents } from './pricing';

// Ekstra ücretler anahtara yalnız varsa eklenir: ekstrasız satırların anahtarı değişmez (kalıcı sepetler birleşmeye devam eder).
export const lineKey = (productId: string, s: Selection, note: string): string =>
  [productId, s.variantId ?? '-', [...s.optionIds].sort().join(','),
   [...s.removedIngredientIds].sort().join(','), note.trim(),
   ...(s.extraCharges?.length ? [s.extraCharges.map((e) => `${e.label}:${e.cents}`).join(';')] : [])].join('|');

export function addLine(lines: CartLine[], line: Omit<CartLine, 'key'>): CartLine[] {
  const key = lineKey(line.productId, line, line.note);
  const hit = lines.find((l) => l.key === key);
  if (hit) return lines.map((l) => (l.key === key ? { ...l, quantity: Math.min(99, l.quantity + line.quantity) } : l));
  return [...lines, { ...line, note: line.note.trim(), key }];
}

export function cartTotalCents(lines: CartLine[], productsById: Map<string, MenuProduct>): number {
  return lines.reduce((sum, l) => {
    const p = productsById.get(l.productId);
    return p ? sum + unitPriceCents(p, l) * l.quantity : sum;
  }, 0);
}

export const toSubmitItems = (lines: CartLine[]): SubmitItem[] =>
  lines.map((l) => ({
    product_id: l.productId, variant_id: l.variantId, quantity: l.quantity,
    option_ids: l.optionIds, removed_ingredient_ids: l.removedIngredientIds, note: l.note.trim() || null,
    extra_charges: l.extraCharges ?? [],
  }));
