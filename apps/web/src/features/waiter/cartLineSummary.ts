import { localName, type CartLine, type Locale, type MenuProduct } from '@ramos/shared';

/**
 * Sepet satırının **kısa** özeti — spec §8.2'deki sıra ve biçim:
 * `Kalb · OHNE Zwiebeln · Knoblauch+Kräuter · +Weichkäse · not`
 *
 * Bilerek fiş biçiminden (`features/common/itemLines.ts`) ayrıdır: fiş `ticket_format` kurallarıyla
 * grup etiketi basar ("Soße: Knoblauch + Kräuter") ve her zaman Almancadır; sepet ise garsonun
 * telefonunda tek satıra sığmak zorunda olduğu için etiketsiz ve arayüz dilindedir. İkisini tek
 * fonksiyona bağlamak, fiş biçimi değiştiğinde sepeti de bozardı.
 *
 * `removedPrefix` çağırandan gelir (`t('waiter.order.removedPrefix')`) — bu modül saf kalır.
 */
export function cartLineSummary(
  product: MenuProduct,
  line: Pick<CartLine, 'variantId' | 'optionIds' | 'removedIngredientIds' | 'note'>,
  locale: Locale,
  removedPrefix: string,
): string {
  const parts: string[] = [];

  const variant = product.variants.find((v) => v.id === line.variantId);
  if (variant) parts.push(localName(variant, locale));

  const removed = product.ingredients
    .filter((i) => line.removedIngredientIds.includes(i.id))
    .sort((a, b) => a.sort - b.sort)
    .map((i) => localName(i, locale));
  if (removed.length) parts.push(`${removedPrefix} ${removed.join(', ')}`);

  for (const g of [...product.groups].sort((a, b) => a.sort - b.sort)) {
    const chosen = [...g.options]
      .sort((a, b) => a.sort - b.sort)
      .filter((o) => line.optionIds.includes(o.id))
      .map((o) => localName(o, locale));
    if (!chosen.length) continue;
    if (g.ticket_format === 'plus_each') parts.push(...chosen.map((v) => `+${v}`));
    else parts.push(chosen.join('+'));
  }

  if (line.note) parts.push(line.note);
  return parts.join(' · ');
}
