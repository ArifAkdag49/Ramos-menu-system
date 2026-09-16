import { localName, type CartLine, type Locale, type MenuProduct } from '@ramos/shared';
import type { LineParts } from '../common/ItemLinesView';

/**
 * Sepet satırının alt satırları — spec §8.2'deki sıra: varyant · ÇIKAR · seçimler · not.
 *
 * Bilerek fiş biçiminden (`features/common/itemLines.ts`) ayrıdır: fiş `ticket_format`
 * kurallarıyla grup etiketi basar ("Soße: Knoblauch + Kräuter") ve her zaman Almancadır; sepet
 * ise garsonun telefonunda etiketsiz ve arayüz dilindedir. İkisini tek fonksiyona bağlamak, fiş
 * biçimi değiştiğinde sepeti de bozardı.
 *
 * M3 tasarım kapısı Y4: çıktı artık tek bir "A · B · C" dizesi değil, `itemLines()` ile **aynı
 * şekilli** parça kümesi. Böylece sepet, onay ve masa detayı aynı bileşeni (`ItemLinesView`)
 * kullanır: ÇIKAR üç ekranda da kendi satırında ve danger tonunda durur. Gönderimden önceki son
 * kontrol noktası sepet olduğu için alerji/tercih hatası orada yakalanmalı. Orta-nokta zinciri
 * ayrıca DESIGN.md §1'in bilinçle kaçındığı şablon işaretiydi.
 *
 * `removedPrefix` çağırandan gelir (`t('waiter.order.removedPrefix')`) — bu modül saf kalır.
 */
export function cartLineParts(
  product: MenuProduct,
  line: Pick<CartLine, 'variantId' | 'optionIds' | 'removedIngredientIds' | 'note'>,
  locale: Locale,
  removedPrefix: string,
): LineParts {
  const variant = product.variants.find((v) => v.id === line.variantId);

  const removed = product.ingredients
    .filter((i) => line.removedIngredientIds.includes(i.id))
    .sort((a, b) => a.sort - b.sort)
    .map((i) => localName(i, locale));

  const options: string[] = [];
  for (const g of [...product.groups].sort((a, b) => a.sort - b.sort)) {
    const chosen = [...g.options]
      .sort((a, b) => a.sort - b.sort)
      .filter((o) => line.optionIds.includes(o.id))
      .map((o) => localName(o, locale));
    if (!chosen.length) continue;
    if (g.ticket_format === 'plus_each') options.push(...chosen.map((v) => `+${v}`));
    else options.push(chosen.join('+'));
  }

  return {
    variant: variant ? localName(variant, locale) : null,
    without: removed.length ? `${removedPrefix} ${removed.join(', ')}` : null,
    options,
    note: line.note || null,
  };
}
