import { formatEuro, formatOrderNo, localTableName, type Locale } from '@ramos/shared';
import { clsx } from 'clsx';
import { AlertTriangle, Ban, Eye, EyeOff, Printer, RotateCw } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  useAdminOrderDetail,
  type AdminOrderDetail,
  type AdminOrderItem,
  type AdminPrintJob,
} from '../../../data/adminOrders';
import type { PrintJobStatus, PrintJobType } from '../../../data/orderMapper';
import { useReprint, useRetryJob } from '../../../data/orders';
import { useSettings } from '../../../data/settings';
import { useStaffNames } from '../../../data/staff';
import { RpcError } from '../../../lib/rpc';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../ui/Badge';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { Spinner } from '../../../ui/Spinner';
import type { Tone } from '../../../ui/tone';
import { ItemLinesView } from '../../common/ItemLinesView';
import { itemLines } from '../../common/itemLines';
import { localCancelReason, parseCancelReasons } from '../../waiter/cancelReasons';
import { formatBusinessDay } from '../dashboardLogic';
import { Section } from '../menu/fields';
import { TicketPayloadPaper } from '../menu/TicketPreview';
import {
  orderTimeline,
  orderTotalCents,
  parseTicketPayload,
  type TimelineEvent,
} from './ordersQuery';
import { formatDateTime, ORDER_STATUS_ICON, ORDER_STATUS_TONE } from './orderView';

const JOB_TYPE_KEY: Record<PrintJobType, `admin.printer.jobType.${PrintJobType}`> = {
  order: 'admin.printer.jobType.order',
  addition: 'admin.printer.jobType.addition',
  storno: 'admin.printer.jobType.storno',
  table_move: 'admin.printer.jobType.table_move',
  reprint: 'admin.printer.jobType.reprint',
  test: 'admin.printer.jobType.test',
};

/** Garson ekranındaki fiş rozetiyle aynı anlam: bekleyen mavi, basılamayan kırmızı, basılan gri. */
const JOB_TONE: Record<PrintJobStatus, Tone> = {
  pending: 'info',
  printing: 'info',
  printed: 'empty',
  failed: 'danger',
};

const errorText = (t: ReturnType<typeof useTranslation>['t'], e: unknown) =>
  t(`errors.${e instanceof RpcError ? e.key : 'unknown'}`);

/**
 * Sipariş ayrıntısı (sağdan çekmece). Admin'in soruları sırayla: ne sipariş edildi ve ne iptal
 * oldu (kim, neden) → sipariş hangi aşamalardan geçti → fiş kâğıda çıktı mı, çıkmadıysa ne yapılır.
 *
 * Kalem iptali `CancelItemSheet` ile yapılır ama o panel bu çekmecenin **içinde** açılmaz: iki
 * `Sheet` üst üste binince `Esc` ikisini birden kapatır ve arka plan `inert`'i ilk kapanışta
 * kalkar. `onCancelItem` isteği sayfaya iletir; sayfa çekmeceyi gizleyip paneli açar, panel
 * kapanınca çekmece aynı siparişle geri gelir.
 */
export function OrderDrawer({
  orderId,
  open,
  locale,
  onClose,
  onCancelItem,
}: {
  orderId: string;
  open: boolean;
  locale: Locale;
  onClose: () => void;
  onCancelItem: (item: AdminOrderItem) => void;
}) {
  const { t } = useTranslation();
  const { data: order, isPending, isError } = useAdminOrderDetail(orderId);

  const title = order
    ? t('admin.orders.drawer.title', { no: formatOrderNo(order.order_no) })
    : t('admin.orders.title');

  return (
    <Sheet open={open} side="right" onClose={onClose} title={title} closeLabel={t('common.close')}>
      {isPending ? (
        <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
          <Spinner label={t('common.loading')} />
          <span>{t('common.loading')}</span>
        </p>
      ) : isError || !order ? (
        <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
          {isError ? t('admin.orders.loadError') : t('admin.orders.drawer.notFound')}
        </Banner>
      ) : (
        <OrderBody order={order} locale={locale} onCancelItem={onCancelItem} />
      )}
    </Sheet>
  );
}

function OrderBody({
  order,
  locale,
  onCancelItem,
}: {
  order: AdminOrderDetail;
  locale: Locale;
  onCancelItem: (item: AdminOrderItem) => void;
}) {
  const { t } = useTranslation();
  const staffNames = useStaffNames();
  const name = (id: string | null) => (id ? staffNames.get(id) : undefined);
  const sessionOpen = order.table_sessions.status === 'open';
  const StatusIcon = ORDER_STATUS_ICON[order.status];

  return (
    <div className="flex min-w-0 flex-col gap-4 text-sm">
      <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2">
        <dt className="text-muted">{t('admin.orders.columns.table')}</dt>
        <dd className="font-semibold">
          {localTableName(order.table_sessions.dining_tables.name, locale)}
          <span className="font-normal text-muted">
            {' · '}
            {t('admin.orders.drawer.round', { round: order.round_no })}
          </span>
        </dd>
        <dt className="text-muted">{t('admin.orders.columns.waiter')}</dt>
        <dd className="break-words">{name(order.waiter_id) ?? '—'}</dd>
        <dt className="text-muted">{t('admin.orders.columns.time')}</dt>
        <dd className="tabular">
          {formatDateTime(order.created_at)}
          <span className="text-muted"> · {formatBusinessDay(order.business_date)}</span>
        </dd>
        <dt className="text-muted">{t('admin.orders.columns.status')}</dt>
        <dd>
          <Badge tone={ORDER_STATUS_TONE[order.status]} icon={<StatusIcon aria-hidden size={14} />}>
            {t(`status.${order.status}`)}
          </Badge>
        </dd>
        {order.note ? (
          <>
            <dt className="text-muted">{t('admin.orders.drawer.note')}</dt>
            <dd className="break-words italic">{order.note}</dd>
          </>
        ) : null}
      </dl>

      <ItemsSection
        order={order}
        locale={locale}
        canCancel={sessionOpen}
        staffName={name}
        onCancelItem={onCancelItem}
      />
      <TimelineSection events={orderTimeline(order)} staffName={name} />
      <PrintsSection order={order} />
    </div>
  );
}

function ItemsSection({
  order,
  locale,
  canCancel,
  staffName,
  onCancelItem,
}: {
  order: AdminOrderDetail;
  locale: Locale;
  canCancel: boolean;
  staffName: (id: string | null) => string | undefined;
  onCancelItem: (item: AdminOrderItem) => void;
}) {
  const { t } = useTranslation();
  const settings = useSettings();
  const reasons = parseCancelReasons(settings?.cancel_reasons);
  const hasActive = order.order_items.some((i) => i.status === 'active');

  return (
    <Section title={t('admin.orders.drawer.items')}>
      {!canCancel && hasActive ? (
        <p className="text-xs text-muted">{t('admin.orders.drawer.sessionClosed')}</p>
      ) : null}
      <ul className="flex flex-col divide-y divide-border">
        {order.order_items.map((item) => {
          const cancelled = item.status === 'cancelled';
          const reason = item.cancel_reason
            ? localCancelReason(item.cancel_reason, reasons, locale)
            : null;
          return (
            <li key={item.id} className="flex flex-col gap-1.5 py-3 first:pt-0 last:pb-0">
              <div className="flex items-start justify-between gap-3">
                <p
                  className={clsx(
                    'min-w-0 break-words font-semibold',
                    cancelled && 'text-muted line-through',
                  )}
                >
                  <span className="tabular">{item.quantity}×</span>{' '}
                  {item.product_code ? <span className="tabular">{item.product_code} </span> : null}
                  <span lang="de">{item.product_name}</span>
                </p>
                <span
                  className={clsx(
                    'tabular shrink-0',
                    cancelled ? 'text-muted line-through' : 'font-semibold',
                  )}
                >
                  {formatEuro(item.unit_price_cents * item.quantity)}
                </span>
              </div>
              <ItemLinesView lines={itemLines(item, locale)} />
              {cancelled ? (
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-danger-ink">
                  <Badge tone="danger" icon={<Ban aria-hidden size={14} />}>
                    {t('status.cancelled')}
                  </Badge>
                  {reason ? (
                    <span
                      lang={reason.isGerman ? 'de' : undefined}
                      className="break-words font-medium"
                    >
                      {reason.text}
                    </span>
                  ) : null}
                  <span className="tabular text-muted">
                    {t('admin.orders.drawer.cancelledBy', {
                      name: staffName(item.cancelled_by) ?? '—',
                      time: item.cancelled_at ? formatDateTime(item.cancelled_at) : '—',
                    })}
                  </span>
                </div>
              ) : canCancel ? (
                <Button
                  variant="ghost"
                  className="self-start px-2 text-danger-ink!"
                  icon={<Ban aria-hidden size={18} />}
                  onClick={() => onCancelItem(item)}
                >
                  {t('waiter.actions.cancelItem')}
                </Button>
              ) : null}
            </li>
          );
        })}
      </ul>
      <div className="flex items-center justify-between border-t border-border pt-3 text-base font-semibold">
        <span>{t('admin.orders.drawer.total')}</span>
        <span className="tabular">{formatEuro(orderTotalCents(order.order_items))}</span>
      </div>
    </Section>
  );
}

function TimelineSection({
  events,
  staffName,
}: {
  events: TimelineEvent[];
  staffName: (id: string | null) => string | undefined;
}) {
  const { t } = useTranslation();
  return (
    <Section title={t('admin.orders.drawer.timeline')}>
      <ol className="flex flex-col gap-2">
        {events.map((e, i) => {
          const actor = staffName(e.actorId);
          return (
            <li key={i} className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3">
              <time dateTime={e.at} className="tabular text-muted">
                {formatDateTime(e.at)}
              </time>
              <span className="break-words">
                {e.kind === 'item_cancelled'
                  ? t('admin.orders.drawer.events.item_cancelled', { item: e.item })
                  : t(`admin.orders.drawer.events.${e.kind}`)}
                {actor ? <span className="text-muted"> · {actor}</span> : null}
              </span>
            </li>
          );
        })}
      </ol>
    </Section>
  );
}

function PrintsSection({ order }: { order: AdminOrderDetail }) {
  const { t } = useTranslation();
  const reprint = useReprint();
  // `reprint_order` ilk sipariş/ek sipariş fişinin yükünü yineler; o iş yoksa RPC hata verir.
  const canReprint = order.print_jobs.some((j) => j.type === 'order' || j.type === 'addition');

  const onReprint = () =>
    reprint.mutate(order.id, {
      onSuccess: () => toast(t('admin.orders.drawer.reprinted'), 'info'),
      onError: (e) => toast(errorText(t, e), 'danger'),
    });

  return (
    <Section
      title={t('admin.orders.drawer.prints')}
      action={
        canReprint ? (
          <Button
            variant="secondary"
            icon={<Printer aria-hidden size={18} />}
            loading={reprint.isPending}
            onClick={onReprint}
          >
            {t('waiter.actions.reprint')}
          </Button>
        ) : null
      }
    >
      {order.print_jobs.length === 0 ? (
        <p className="text-muted">{t('admin.orders.drawer.noPrints')}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {order.print_jobs.map((job) => (
            <PrintJobRow key={job.id} job={job} />
          ))}
        </ul>
      )}
    </Section>
  );
}

function PrintJobRow({ job }: { job: AdminPrintJob }) {
  const { t } = useTranslation();
  const retry = useRetryJob();
  const [showTicket, setShowTicket] = useState(false);
  const payload = showTicket ? parseTicketPayload(job.payload) : null;

  const onRetry = () =>
    retry.mutate(job.id, {
      onSuccess: () => toast(t('admin.printer.retried'), 'info'),
      onError: (e) => toast(errorText(t, e), 'danger'),
    });

  return (
    <li className="flex min-w-0 flex-col gap-2 rounded-control border border-border bg-surface-2 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-semibold">{t(JOB_TYPE_KEY[job.type])}</span>
        <Badge tone={JOB_TONE[job.status]}>{t(`status.${job.status}`)}</Badge>
      </div>
      <p className="tabular text-muted">
        {formatDateTime(job.created_at)} ·{' '}
        {t('admin.orders.drawer.attempts', { count: job.attempts })}
      </p>
      {job.last_error ? (
        <p className="break-all font-mono text-xs text-danger-ink">{job.last_error}</p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        {job.status === 'failed' ? (
          <Button
            variant="secondary"
            icon={<RotateCw aria-hidden size={18} />}
            loading={retry.isPending}
            onClick={onRetry}
          >
            {t('common.retry')}
          </Button>
        ) : null}
        <Button
          variant="ghost"
          className="px-2"
          aria-expanded={showTicket}
          icon={showTicket ? <EyeOff aria-hidden size={18} /> : <Eye aria-hidden size={18} />}
          onClick={() => setShowTicket((v) => !v)}
        >
          {showTicket ? t('admin.orders.drawer.hideTicket') : t('admin.orders.drawer.showTicket')}
        </Button>
      </div>
      {showTicket ? (
        payload ? (
          <TicketPayloadPaper payload={payload} />
        ) : (
          <p className="text-muted">{t('admin.orders.drawer.ticketUnavailable')}</p>
        )
      ) : null}
    </li>
  );
}
