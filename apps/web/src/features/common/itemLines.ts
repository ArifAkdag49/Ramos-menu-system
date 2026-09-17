import { formatEuro, type Locale } from '@ramos/shared';
import type { OrderItemView } from '../../data/orders';

/**
 * Bir sipariş kaleminin alt satırlarını üretir: varyant, OHNE (çıkarılan malzeme), seçim
 * grupları (fiş biçimine göre) ve not. Garson ekranı ve KDS (Görev 16) aynı fonksiyonu kullanır
 * — kalem gösterimi tek yerde tanımlıdır.
 */
export function itemLines(
  item: Pick<
    OrderItemView,
    'variant_name_de' | 'variant_name_tr' | 'note' | 'removed_ingredients' | 'selected_options'
  > &
    Partial<Pick<OrderItemView, 'extra_charges'>>,
  locale: Locale,
) {
  const n = (de: string, tr: string | null) => (locale === 'tr' && tr ? tr : de);
  const groups = new Map<string, { label: string; format: string; values: string[]; sort: number }>();
  for (const o of item.selected_options) {
    const g = groups.get(o.group_id) ?? {
      label: n(o.group_name_de, o.group_name_tr),
      format: o.ticket_format,
      values: [],
      sort: o.group_sort,
    };
    g.values.push(n(o.name_de, o.name_tr));
    groups.set(o.group_id, g);
  }
  const options = [...groups.values()]
    .sort((a, b) => a.sort - b.sort)
    .flatMap((g) =>
      g.format === 'plus_each'
        ? g.values.map((v) => `+ ${v}`)
        : g.format === 'values_only'
          ? [g.values.join(', ')]
          : [`${g.label}: ${g.values.join(' + ')}`],
    );
  // Serbest ekstra ücretler (0009) seçeneklerin ardından, tutarıyla — garsonun yazdığı dilde.
  for (const e of item.extra_charges ?? []) options.push(`+ ${e.label} (+${formatEuro(e.cents)})`);
  const removed = item.removed_ingredients.map((r) => n(r.name_de, r.name_tr));
  return {
    ...(item.variant_name_de ? { variant: n(item.variant_name_de, item.variant_name_tr) } : {}),
    ...(removed.length ? { without: `${locale === 'tr' ? 'ÇIKAR' : 'OHNE'}: ${removed.join(', ')}` } : {}),
    options,
    ...(item.note ? { note: item.note } : {}),
  };
}
