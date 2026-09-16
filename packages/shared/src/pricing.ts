import type { MenuGroup, MenuProduct, Selection } from './domain';

export type SelectionError =
  | { key: 'variant_required' }
  | { key: 'option_group_min' | 'option_group_max' | 'option_exclusive_conflict'; groupId: string };

export function unitPriceCents(p: MenuProduct, s: Selection): number {
  const base = p.variants.length
    ? (p.variants.find((v) => v.id === s.variantId)?.price_cents ?? 0)
    : (p.base_price_cents ?? 0);
  const deltas = p.groups
    .flatMap((g) => g.options)
    .filter((o) => s.optionIds.includes(o.id))
    .reduce((sum, o) => sum + o.price_delta_cents, 0);
  return base + deltas;
}

export function validateSelection(p: MenuProduct, s: Selection): SelectionError[] {
  const errors: SelectionError[] = [];
  if (p.variants.length && !p.variants.some((v) => v.id === s.variantId)) errors.push({ key: 'variant_required' });
  for (const g of p.groups) {
    const chosen = g.options.filter((o) => s.optionIds.includes(o.id));
    if (chosen.length < g.min_select) errors.push({ key: 'option_group_min', groupId: g.id });
    else if (chosen.length > g.max_select) errors.push({ key: 'option_group_max', groupId: g.id });
    else if (chosen.length > 1 && chosen.some((o) => o.is_exclusive))
      errors.push({ key: 'option_exclusive_conflict', groupId: g.id });
  }
  return errors;
}

export function defaultSelection(p: MenuProduct): Selection {
  return {
    variantId: p.variants.find((v) => v.is_default)?.id ?? p.variants[0]?.id ?? null,
    optionIds: p.groups.flatMap((g) => g.options.filter((o) => o.is_default).map((o) => o.id)),
    removedIngredientIds: [],
  };
}

/** Bir grubun seçimini değiştirir; diğer grupların id'lerine dokunmaz. */
export function toggleOption(group: MenuGroup, current: string[], optionId: string): string[] {
  const inGroup = new Set(group.options.map((o) => o.id));
  const others = current.filter((id) => !inGroup.has(id));
  const mine = current.filter((id) => inGroup.has(id));
  const option = group.options.find((o) => o.id === optionId);
  if (!option) return current;
  if (mine.includes(optionId)) {
    if (group.min_select === 1 && group.max_select === 1) return current;
    return [...others, ...mine.filter((id) => id !== optionId)];
  }
  if (option.is_exclusive) return [...others, optionId];
  const exclusive = new Set(group.options.filter((o) => o.is_exclusive).map((o) => o.id));
  const kept = mine.filter((id) => !exclusive.has(id));
  if (group.max_select === 1) return [...others, optionId];
  if (kept.length >= group.max_select) return current;
  return [...others, ...kept, optionId];
}

export const needsSheet = (p: MenuProduct): boolean =>
  p.variants.length > 0 || p.groups.length > 0 || p.ingredients.length > 0;
