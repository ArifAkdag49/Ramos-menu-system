import type { Locale } from '@ramos/shared';
import { clsx } from 'clsx';
import type { OrderItemView } from '../../data/orders';
import { itemLines } from './itemLines';

/**
 * Bir kalemin alt satırları: varyant, seçimler, ÇIKAR/OHNE ve not. Hem gönderilmiş bir sipariş
 * kaleminden (`itemLines`) hem de sepetteki bir satırdan (`cartLineParts`) üretilebilir.
 */
export interface LineParts {
  variant?: string | null;
  without?: string | null;
  options: string[];
  note?: string | null;
}

/**
 * M3 tasarım kapısı Y7: garson alt satırları 14 px'ti — BUILD-PROMPT §10.6 "garson gövde ≥ 16 px"
 * ihlali (ÇIKAR satırı dâhil). Boyut bir prop'la ayrıldı ki mutfak (KDS kalem satırı ≥ 22 px)
 * bu bileşeni kullanmaya başladığında garson ölçüsünü miras almasın.
 */
const SIZE: Record<'waiter' | 'kds', string> = { waiter: 'text-base', kds: 'text-kds' };

/**
 * Alt satırları çizer. ÇIKAR satırı ayrı bir satırda ve danger tonundadır (`data-tone="danger"`):
 * mutfaktaki OHNE bloğuyla ve fişle aynı görsel dil, üç garson ekranında da aynı.
 */
export function ItemLinesView({
  lines,
  size = 'waiter',
}: {
  lines: LineParts;
  size?: 'waiter' | 'kds';
}) {
  if (!lines.variant && !lines.without && !lines.note && lines.options.length === 0) return null;

  return (
    <div className={clsx('flex flex-col gap-0.5 text-muted', SIZE[size])}>
      {lines.variant ? <p className="text-text">{lines.variant}</p> : null}
      {lines.options.map((option, i) => (
        <p key={i}>{option}</p>
      ))}
      {lines.without ? (
        <p data-tone="danger" className="font-semibold text-danger-ink">
          {lines.without}
        </p>
      ) : null}
      {lines.note ? <p className="italic">{lines.note}</p> : null}
    </div>
  );
}

/**
 * Gönderilmiş bir sipariş kaleminin alt satırları (fiş biçimi — `ticket_format` kurallarıyla).
 * Garson masa detayı ve KDS (Görev 16) aynı bileşeni kullanır.
 *
 * Karar: dosya adı brief'te `ItemLines.tsx` idi; bu Windows makinede `tsc` aynı klasördeki
 * `itemLines.ts` ile yalnızca büyük/küçük harf farkını (TS1149) reddediyor. Bileşen adı ve
 * dışa aktarım (`ItemLines`) değişmedi, yalnız dosya adı `ItemLinesView.tsx` oldu.
 */
export function ItemLines({
  item,
  locale,
  size,
}: {
  item: Pick<OrderItemView, 'variant_name_de' | 'variant_name_tr' | 'note' | 'removed_ingredients' | 'selected_options'>;
  locale: Locale;
  size?: 'waiter' | 'kds';
}) {
  return <ItemLinesView lines={itemLines(item, locale)} size={size} />;
}
