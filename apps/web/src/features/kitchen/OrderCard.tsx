import { formatOrderNo, type Locale } from '@ramos/shared';
import { clsx } from 'clsx';
import { Check, MoreHorizontal, Printer, RotateCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OrderItemView, OrderView } from '../../data/orders';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { IconButton } from '../../ui/IconButton';
import { Sheet } from '../../ui/Sheet';
import { canUndo, elapsedTone, itemLines } from './kitchenLogic';

const TONE_TEXT: Record<'ok' | 'warn' | 'late', string> = {
  ok: 'text-lime',
  warn: 'text-warning',
  late: 'text-danger-ink',
};

/** Bileşen dakikada bir yeniden çizilsin diye kullanılan hafif tetikleyici (iş mantığı taşımaz). */
function useTick(ms: number) {
  const [, force] = useState(0);
  useEffect(() => {
    const id = setInterval(() => force((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [ms]);
}

/**
 * Mutfak sipariş kartı. 1–2 m'den okunabilirlik için büyük harf masa adı, ≥ 22 px kalem satırı
 * ve tek ana eylem (HAZIR / Geri al). Masa adı `localTableName` ile çevrilmez — KDS'de fiziksel
 * masa adı (Almanca) olduğu gibi gösterilir (spec §15: KDS hesabının dili ayrı ayarlanır, ama
 * fiziksel tabela/masa adı sabittir); yalnız kalem/seçim metinleri kullanıcı `locale`'ına göre.
 */
export function OrderCard({
  order,
  locale,
  onReady,
  onUndo,
  onReprint,
  onRetry,
  compact = false,
}: {
  order: OrderView;
  locale: Locale;
  onReady: (id: string) => void;
  onUndo: (id: string) => void;
  onReprint: () => void;
  onRetry?: () => void;
  /** "Hazır" sütunundaki küçük kart görünümü (brief Adım 4): daha az yer kaplar, ayrıntı azalır. */
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  useTick(15_000);

  const now = new Date();
  const tone = elapsedTone(order.created_at, now);
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(order.created_at)) / 60_000));
  const undoable = canUndo(order, now);

  return (
    <li
      className={clsx(
        'flex flex-col gap-3 rounded-card border border-border bg-surface',
        compact ? 'gap-2 p-3' : 'p-4',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span
            lang="de"
            className={clsx(
              'font-extrabold uppercase tracking-tight text-text',
              compact ? 'text-xl' : 'text-3xl',
            )}
          >
            {order.table_name.toUpperCase()}
          </span>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <span className="tabular font-semibold text-text">{formatOrderNo(order.order_no)}</span>
            <span aria-hidden>·</span>
            <span>{order.waiter_name}</span>
            <span aria-hidden>·</span>
            <span className={clsx('tabular font-semibold', TONE_TEXT[tone])}>
              {t('common.elapsedMinutes', { count: minutes })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {order.round_no > 1 ? <Badge tone="warning">{t('kitchen.badge.nachbestellung')}</Badge> : null}
          {compact ? null : (
            <IconButton
              label={t('kitchen.actions.more')}
              icon={<MoreHorizontal aria-hidden size={22} />}
              onClick={() => setMoreOpen(true)}
            />
          )}
        </div>
      </div>

      {compact ? null : <PrintBadge order={order} onRetry={onRetry} />}

      <ul className="flex flex-col gap-3">
        {order.items.map((item) => (
          <OrderCardItem key={item.id} item={item} locale={locale} compact={compact} />
        ))}
      </ul>

      <div className="flex items-center gap-2">
        {order.status === 'in_kitchen' ? (
          <Button
            fullWidth
            size="lg"
            style={compact ? undefined : { minHeight: 64 }}
            className={compact ? undefined : 'text-xl'}
            icon={<Check aria-hidden size={compact ? 20 : 24} />}
            onClick={() => onReady(order.id)}
          >
            {t('kitchen.actions.ready')}
          </Button>
        ) : undoable ? (
          <Button
            fullWidth
            size="lg"
            variant="secondary"
            style={compact ? undefined : { minHeight: 64 }}
            className={compact ? undefined : 'text-xl'}
            icon={<RotateCw aria-hidden size={compact ? 20 : 24} />}
            onClick={() => onUndo(order.id)}
          >
            {t('kitchen.actions.undo')}
          </Button>
        ) : (
          <Badge tone="ready" className={clsx('flex-1 justify-center', compact ? 'min-h-12' : 'min-h-16 text-xl')}>
            {t('kitchen.actions.readyDone')}
          </Badge>
        )}
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('kitchen.actions.more')} closeLabel={t('common.close')}>
        <Button
          fullWidth
          icon={<Printer aria-hidden size={20} />}
          onClick={() => {
            setMoreOpen(false);
            onReprint();
          }}
        >
          {t('kitchen.actions.reprint')}
        </Button>
      </Sheet>
    </li>
  );
}

function OrderCardItem({ item, locale, compact = false }: { item: OrderItemView; locale: Locale; compact?: boolean }) {
  const { t } = useTranslation();
  const lines = itemLines(item, locale);
  const cancelled = item.status === 'cancelled';

  return (
    <li className={cancelled ? 'opacity-70' : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <p
          className={clsx(
            'font-bold leading-snug',
            compact ? 'text-base' : 'text-[22px]',
            cancelled && 'line-through',
          )}
        >
          {item.quantity}× {item.product_code ? `${item.product_code} ` : ''}
          {item.product_name}
        </p>
        {cancelled ? <Badge tone="danger">{t('kitchen.badge.storno')}</Badge> : null}
      </div>
      {lines.variant ? <p className={clsx('text-muted', compact ? 'text-sm' : 'text-lg')}>{lines.variant}</p> : null}
      {compact
        ? null
        : lines.options.map((option, i) => (
            <p key={i} className="text-lg text-muted">
              {option}
            </p>
          ))}
      {lines.without ? (
        <p
          data-tone="danger"
          className={clsx(
            'mt-1 inline-block rounded-md bg-danger font-bold text-bg',
            compact ? 'px-1.5 py-0.5 text-sm' : 'px-2 py-1 text-lg',
          )}
        >
          {lines.without}
        </p>
      ) : null}
      {compact || !lines.note ? null : <p className="text-lg font-medium text-warning">{lines.note}</p>}
    </li>
  );
}

function PrintBadge({ order, onRetry }: { order: OrderView; onRetry?: () => void }) {
  const { t } = useTranslation();
  if (!order.print) return null;
  if (order.print.status === 'failed') {
    return (
      <div className="flex items-center gap-2">
        <Badge tone="danger" icon={<Printer aria-hidden size={16} />}>
          {t('status.failed')}
        </Badge>
        {onRetry ? (
          <Button size="md" variant="ghost" icon={<RotateCw aria-hidden size={18} />} onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : null}
      </div>
    );
  }
  if (order.print.status === 'pending' || order.print.status === 'printing') {
    return (
      <Badge tone="info" icon={<Printer aria-hidden size={16} />}>
        {t('kitchen.printBadge.queued')}
      </Badge>
    );
  }
  return null;
}
