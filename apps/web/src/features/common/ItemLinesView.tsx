import type { Locale } from '@ramos/shared';
import type { OrderItemView } from '../../data/orders';
import { itemLines } from './itemLines';

/**
 * Bir sipariş kaleminin alt satırlarını çizer: varyant, seçimler, OHNE (kırmızı,
 * `data-tone="danger"`) ve not. Garson masa detayı ve KDS (Görev 16) aynı bileşeni kullanır.
 *
 * Karar: dosya adı brief'te `ItemLines.tsx` idi; bu Windows makinede `tsc` aynı klasördeki
 * `itemLines.ts` ile yalnızca büyük/küçük harf farkını (TS1149) reddediyor. Bileşen adı ve
 * dışa aktarım (`ItemLines`) değişmedi, yalnız dosya adı `ItemLinesView.tsx` oldu.
 */
export function ItemLines({
  item,
  locale,
}: {
  item: Pick<OrderItemView, 'variant_name_de' | 'variant_name_tr' | 'note' | 'removed_ingredients' | 'selected_options'>;
  locale: Locale;
}) {
  const lines = itemLines(item, locale);

  return (
    <div className="flex flex-col gap-0.5 text-sm text-muted">
      {lines.variant ? <p className="text-text">{lines.variant}</p> : null}
      {lines.options.map((option, i) => (
        <p key={i}>{option}</p>
      ))}
      {lines.without ? (
        <p data-tone="danger" className="font-medium text-danger-ink">
          {lines.without}
        </p>
      ) : null}
      {lines.note ? <p className="italic">{lines.note}</p> : null}
    </div>
  );
}
