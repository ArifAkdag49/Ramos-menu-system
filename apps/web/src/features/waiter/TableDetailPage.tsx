import { formatOrderNo, localTableName, type Locale } from '@ramos/shared';
import { clsx } from 'clsx';
import { Check, MoreHorizontal, Plus, RotateCw, UtensilsCrossed } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { useMarkServed, useReprint, useRetryJob, useSessionOrders, type OrderView } from '../../data/orders';
import { useOpenSession, useTableOverview } from '../../data/tables';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { IconButton } from '../../ui/IconButton';
import { Sheet } from '../../ui/Sheet';
import { ItemLines } from '../common/ItemLinesView';
import { formatTime, printBadge } from './waiterLogic';

const STATUS_TONE: Record<OrderView['status'], 'open' | 'ready' | 'empty' | 'danger'> = {
  in_kitchen: 'open',
  ready: 'ready',
  served: 'empty',
  cancelled: 'danger',
};

const PRINT_TONE: Record<'printed' | 'queued' | 'failed', 'empty' | 'info' | 'danger'> = {
  printed: 'empty',
  queued: 'info',
  failed: 'danger',
};

/**
 * Masa detayı: oturum yoksa boş durum + "Sipariş al"; varsa siparişler tur tur listelenir.
 * Alt eylem çubuğu (+ Sipariş ekle · Hesap özeti · Masayı taşı · Masayı kapat) Görev 15'te gelir.
 */
export function TableDetailPage() {
  const { tableId } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';

  const rows = useTableOverview();
  const table = rows.find((r) => r.table_id === tableId);
  const session = useOpenSession(tableId);
  const orders = useSessionOrders(session?.id);

  const markServed = useMarkServed();
  const reprint = useReprint();
  const retryJob = useRetryJob();

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <h1 className="text-xl font-semibold">{table ? localTableName(table.name, locale) : ''}</h1>

      {!session ? (
        <EmptyState
          icon={<UtensilsCrossed aria-hidden size={40} />}
          title={t('waiter.table.empty')}
          action={
            <Button size="lg" icon={<Plus aria-hidden size={20} />} onClick={() => navigate(`/waiter/table/${tableId}/order`)}>
              {t('waiter.order.title')}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-4">
          {orders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              locale={locale}
              onMarkServed={() => markServed.mutate(order.id)}
              onReprint={() => reprint.mutate(order.id)}
              onRetry={
                order.print && printBadge(order.print) === 'failed'
                  ? () => retryJob.mutate(order.print!.job_id)
                  : undefined
              }
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function OrderCard({
  order,
  locale,
  onMarkServed,
  onReprint,
  onRetry,
}: {
  order: OrderView;
  locale: Locale;
  onMarkServed: () => void;
  onReprint: () => void;
  onRetry?: () => void;
}) {
  const { t } = useTranslation();
  const [moreOpen, setMoreOpen] = useState(false);
  const badge = printBadge(order.print);

  return (
    <li className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
        <span className="tabular font-semibold text-text">{formatOrderNo(order.order_no)}</span>
        <span aria-hidden>·</span>
        <span className="tabular">{formatTime(order.created_at)}</span>
        <span aria-hidden>·</span>
        <span>{order.waiter_name}</span>
        <Badge tone={STATUS_TONE[order.status]}>{t(`status.${order.status}`)}</Badge>
        {badge ? (
          <Badge tone={PRINT_TONE[badge]}>{badge === 'queued' ? t('waiter.printBadge.queued') : t(`status.${badge}`)}</Badge>
        ) : null}
        {onRetry ? (
          <Button size="md" variant="ghost" icon={<RotateCw aria-hidden size={18} />} onClick={onRetry}>
            {t('common.retry')}
          </Button>
        ) : null}
      </div>

      <ul className="flex flex-col gap-3">
        {order.items.map((item) => (
          <li key={item.id} className={item.status === 'cancelled' ? 'opacity-60' : undefined}>
            <p className={clsx('text-base font-medium', item.status === 'cancelled' && 'line-through')}>
              {item.quantity}× {item.product_name}
            </p>
            <ItemLines item={item} locale={locale} />
            {item.status === 'cancelled' && item.cancel_reason ? (
              <p className="text-sm text-danger-ink">{t('waiter.table.cancelReason', { reason: item.cancel_reason })}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <div className="flex items-center gap-2">
        {order.status === 'ready' ? (
          <Button fullWidth icon={<Check aria-hidden size={20} />} onClick={onMarkServed}>
            {t('waiter.actions.markServed')}
          </Button>
        ) : null}
        {order.status === 'in_kitchen' ? (
          <IconButton label={t('waiter.actions.more')} icon={<MoreHorizontal aria-hidden size={22} />} onClick={() => setMoreOpen(true)} />
        ) : null}
        <Button variant="ghost" icon={<RotateCw aria-hidden size={18} />} onClick={onReprint}>
          {t('waiter.actions.reprint')}
        </Button>
      </div>

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t('waiter.actions.more')} closeLabel={t('common.close')}>
        <Button
          fullWidth
          icon={<Check aria-hidden size={20} />}
          onClick={() => {
            setMoreOpen(false);
            onMarkServed();
          }}
        >
          {t('waiter.actions.markServedDrink')}
        </Button>
      </Sheet>
    </li>
  );
}
