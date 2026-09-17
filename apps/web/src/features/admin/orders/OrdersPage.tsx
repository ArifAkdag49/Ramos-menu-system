import { formatEuro, formatOrderNo, localTableName, type Locale } from '@ramos/shared';
import { AlertTriangle, CalendarDays, ChevronDown, ClipboardList, Printer } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminOrders, type AdminOrderItem, type OrderView } from '../../../data/adminOrders';
import { useAdminTables } from '../../../data/adminTables';
import type { OrderStatus } from '../../../data/orderMapper';
import { useAdminStaffList } from '../../../data/staff';
import { Badge } from '../../../ui/Badge';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { EmptyState } from '../../../ui/EmptyState';
import { Spinner } from '../../../ui/Spinner';
import { CancelItemSheet } from '../../waiter/CancelItemSheet';
import { businessDate } from '../dashboardLogic';
import { SelectField, TextField } from '../menu/fields';
import { OrderDrawer } from './OrderDrawer';
import {
  buildOrdersFilter,
  orderQuantity,
  orderTotalCents,
  OrdersFilterError,
  ORDERS_PAGE_SIZE,
  type OrdersFilter,
  type OrdersFilterInput,
} from './ordersQuery';
import { formatClock, formatDateTime, ORDER_STATUS_ICON, ORDER_STATUS_TONE } from './orderView';

const STATUSES: OrderStatus[] = ['in_kitchen', 'ready', 'served', 'cancelled'];

/**
 * Admin > Siparişler (spec §8.4). Varsayılan bugünün iş günüdür; filtre değişince sayfa sayısı
 * başa döner. Masaüstünde tablo, telefonda kart listesi (BUILD-PROMPT §10.7: telefonda tablo yok) —
 * iki görünüm aynı veriden çizilir, satıra/karta dokununca sağdan ayrıntı çekmecesi açılır.
 */
export function OrdersPage() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';
  const [today] = useState(() => businessDate(new Date()));
  const [form, setForm] = useState<OrdersFilterInput>({
    from: today,
    to: today,
    tableId: '',
    waiterId: '',
    status: '',
  });
  const [pages, setPages] = useState(1);
  const [openId, setOpenId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<AdminOrderItem | null>(null);

  // Geçersiz aralıkta sorgu gitmez; son geçerli liste yerine hata metni görünür.
  let filter: OrdersFilter | null = null;
  let rangeError: OrdersFilterError['key'] | null = null;
  try {
    filter = buildOrdersFilter(form);
  } catch (e) {
    if (!(e instanceof OrdersFilterError)) throw e;
    rangeError = e.key;
  }

  const limit = pages * ORDERS_PAGE_SIZE;
  const { orders, hasMore, isPending, isFetching, isError } = useAdminOrders(filter, limit);
  const singleDay = form.from === form.to;

  const update = (patch: Partial<OrdersFilterInput>) => {
    setForm((f) => ({ ...f, ...patch }));
    setPages(1);
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('admin.orders.title')}</h1>

      <Filters
        form={form}
        today={today}
        locale={locale}
        rangeError={rangeError}
        onChange={update}
      />

      {rangeError ? null : isPending ? (
        <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
          <Spinner label={t('common.loading')} />
          <span>{t('common.loading')}</span>
        </p>
      ) : isError ? (
        <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
          {t('admin.orders.loadError')}
        </Banner>
      ) : orders.length === 0 ? (
        <EmptyState
          icon={<ClipboardList aria-hidden size={32} />}
          title={t('admin.orders.empty')}
        />
      ) : (
        <section
          aria-labelledby="orders-list-title"
          className="rounded-card border border-border bg-surface"
        >
          <div className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
            <h2 id="orders-list-title" className="text-base font-semibold">
              {t('admin.orders.shown', { count: orders.length })}
            </h2>
            {isFetching ? <Spinner label={t('common.loading')} /> : null}
          </div>

          <OrderCards orders={orders} locale={locale} singleDay={singleDay} onOpen={setOpenId} />
          <OrderTable orders={orders} locale={locale} singleDay={singleDay} onOpen={setOpenId} />

          {hasMore ? (
            <div className="border-t border-border p-3">
              <Button
                variant="secondary"
                fullWidth
                loading={isFetching}
                icon={<ChevronDown aria-hidden size={18} />}
                onClick={() => setPages((p) => p + 1)}
              >
                {t('admin.orders.more')}
              </Button>
            </div>
          ) : null}
        </section>
      )}

      {openId ? (
        <OrderDrawer
          orderId={openId}
          open={!cancelTarget}
          locale={locale}
          onClose={() => setOpenId(null)}
          onCancelItem={setCancelTarget}
        />
      ) : null}
      {cancelTarget ? (
        <CancelItemSheet
          item={cancelTarget}
          locale={locale}
          open
          onClose={() => setCancelTarget(null)}
        />
      ) : null}
    </div>
  );
}

function Filters({
  form,
  today,
  locale,
  rangeError,
  onChange,
}: {
  form: OrdersFilterInput;
  today: string;
  locale: Locale;
  rangeError: OrdersFilterError['key'] | null;
  onChange: (patch: Partial<OrdersFilterInput>) => void;
}) {
  const { t } = useTranslation();
  const tables = useAdminTables().data ?? [];
  const staff = (useAdminStaffList().data ?? []).filter((p) => p.role !== 'kitchen');

  return (
    <section
      aria-label={t('admin.orders.filters.label')}
      className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
    >
      {/* Telefonda tarih çifti ve masa/garson yan yana: beş alan alt alta dizilince liste ekranın altına düşüyordu. */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <TextField
          type="date"
          label={t('admin.range.from')}
          value={form.from}
          onChange={(from) => onChange({ from })}
        />
        <TextField
          type="date"
          label={t('admin.range.to')}
          value={form.to}
          onChange={(to) => onChange({ to })}
        />
        <SelectField
          label={t('admin.orders.filters.table')}
          value={form.tableId ?? ''}
          onChange={(tableId) => onChange({ tableId })}
          options={[
            { value: '', label: t('admin.orders.filters.allTables') },
            ...tables.map((r) => ({ value: r.id, label: localTableName(r.name, locale) })),
          ]}
        />
        <SelectField
          label={t('admin.orders.filters.waiter')}
          value={form.waiterId ?? ''}
          onChange={(waiterId) => onChange({ waiterId })}
          options={[
            { value: '', label: t('admin.orders.filters.allWaiters') },
            ...staff.map((p) => ({ value: p.id, label: p.display_name })),
          ]}
        />
        <SelectField<OrderStatus | ''>
          className="col-span-2 lg:col-span-1"
          label={t('admin.orders.filters.status')}
          value={form.status ?? ''}
          onChange={(status) => onChange({ status })}
          options={[
            { value: '', label: t('admin.orders.filters.allStatuses') },
            ...STATUSES.map((s) => ({ value: s, label: t(`status.${s}`) })),
          ]}
        />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        {rangeError ? (
          <p role="alert" className="text-sm text-danger-ink">
            {t(`admin.range.errors.${rangeError}`)}
          </p>
        ) : (
          <p className="text-xs text-muted">{t('admin.range.note')}</p>
        )}
        {form.from !== today || form.to !== today ? (
          <Button
            variant="ghost"
            className="px-3"
            icon={<CalendarDays aria-hidden size={18} />}
            onClick={() => onChange({ from: today, to: today })}
          >
            {t('admin.range.today')}
          </Button>
        ) : null}
      </div>
    </section>
  );
}

interface ListProps {
  orders: OrderView[];
  locale: Locale;
  singleDay: boolean;
  onOpen: (id: string) => void;
}

function StatusBadges({ order }: { order: OrderView }) {
  const { t } = useTranslation();
  const Icon = ORDER_STATUS_ICON[order.status];
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge tone={ORDER_STATUS_TONE[order.status]} icon={<Icon aria-hidden size={14} />}>
        {t(`status.${order.status}`)}
      </Badge>
      {order.print?.status === 'failed' ? (
        <Badge tone="danger" icon={<Printer aria-hidden size={14} />}>
          {t('status.failed')}
        </Badge>
      ) : null}
    </span>
  );
}

/** Telefon: her sipariş tek bir düğme-kart. Bilgi üç satıra bölünür, yatay kayma olmaz. */
function OrderCards({ orders, locale, singleDay, onOpen }: ListProps) {
  const { t } = useTranslation();
  return (
    <ul className="flex flex-col divide-y divide-border md:hidden">
      {orders.map((o) => (
        <li key={o.id}>
          <button
            type="button"
            onClick={() => onOpen(o.id)}
            aria-label={t('admin.orders.open', { no: formatOrderNo(o.order_no) })}
            className="flex min-h-12 w-full cursor-pointer flex-col gap-1.5 px-4 py-3 text-left transition-colors duration-150 ease-out hover:bg-surface-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-lime"
          >
            <span className="flex w-full items-center justify-between gap-3">
              <span className="min-w-0 truncate font-semibold">
                <span className="tabular">{formatOrderNo(o.order_no)}</span>
                {' · '}
                {localTableName(o.table_name, locale)}
              </span>
              <span className="tabular shrink-0 font-semibold">
                {formatEuro(orderTotalCents(o.items))}
              </span>
            </span>
            <span className="flex w-full flex-wrap items-center justify-between gap-2">
              <span className="min-w-0 break-words text-muted">
                <span className="tabular">
                  {singleDay ? formatClock(o.created_at) : formatDateTime(o.created_at)}
                </span>
                {' · '}
                {o.waiter_name || '—'}
                {' · '}
                {t('admin.orders.itemsCount', { count: orderQuantity(o.items) })}
              </span>
              <StatusBadges order={o} />
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Masaüstü: tablo. Satırın tamamı tıklanır; klavye için numara hücresinde gerçek bir düğme var. */
function OrderTable({ orders, locale, singleDay, onOpen }: ListProps) {
  const { t } = useTranslation();
  return (
    <table className="hidden w-full md:table">
      <thead>
        <tr className="border-b border-border text-left text-xs text-muted">
          <th scope="col" className="px-4 py-2 font-medium">
            {t('admin.orders.columns.no')}
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            {t('admin.orders.columns.time')}
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            {t('admin.orders.columns.table')}
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            {t('admin.orders.columns.waiter')}
          </th>
          <th scope="col" className="px-4 py-2 font-medium">
            {t('admin.orders.columns.status')}
          </th>
          <th scope="col" className="px-4 py-2 text-right font-medium">
            {t('admin.orders.columns.items')}
          </th>
          <th scope="col" className="px-4 py-2 text-right font-medium">
            {t('admin.orders.columns.total')}
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {orders.map((o) => (
          <tr
            key={o.id}
            onClick={() => onOpen(o.id)}
            className="cursor-pointer transition-colors duration-150 ease-out hover:bg-surface-2"
          >
            <th scope="row" className="px-2 py-1 text-left">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpen(o.id);
                }}
                aria-label={t('admin.orders.open', { no: formatOrderNo(o.order_no) })}
                className="tabular min-h-12 cursor-pointer rounded-control px-2 font-semibold text-lime focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
              >
                {formatOrderNo(o.order_no)}
              </button>
            </th>
            <td className="tabular px-4 py-2 text-muted">
              {singleDay ? formatClock(o.created_at) : formatDateTime(o.created_at)}
            </td>
            <td className="px-4 py-2 font-semibold">{localTableName(o.table_name, locale)}</td>
            <td className="px-4 py-2 text-muted">{o.waiter_name || '—'}</td>
            <td className="px-4 py-2">
              <StatusBadges order={o} />
            </td>
            <td className="tabular px-4 py-2 text-right">{orderQuantity(o.items)}</td>
            <td className="tabular px-4 py-2 text-right font-semibold">
              {formatEuro(orderTotalCents(o.items))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
