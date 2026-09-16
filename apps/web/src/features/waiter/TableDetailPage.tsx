import { formatOrderNo, localTableName, type Locale } from '@ramos/shared';
import { clsx } from 'clsx';
import {
  AlertTriangle,
  ArrowRightLeft,
  Ban,
  Check,
  DoorClosed,
  MoreHorizontal,
  Plus,
  Receipt,
  RotateCw,
  UtensilsCrossed,
} from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import {
  useCloseSession,
  useMarkServed,
  useReprint,
  useRetryJob,
  useSessionOrders,
  type OrderItemView,
  type OrderView,
} from '../../data/orders';
import { useSettings } from '../../data/settings';
import { useOpenSessionQuery, useTableOverview } from '../../data/tables';
import { toast } from '../../lib/toast';
import { Badge } from '../../ui/Badge';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Sheet } from '../../ui/Sheet';
import { Spinner } from '../../ui/Spinner';
import { ItemLines } from '../common/ItemLinesView';
import { BillSheet } from './BillSheet';
import { CancelItemSheet } from './CancelItemSheet';
import { MoveTableSheet } from './MoveTableSheet';
import { localCancelReason, parseCancelReasons, type CancelReason } from './cancelReasons';
import { errorKey } from './submitError';
import { formatTime, printBadge, sortOrderItems, tableBody } from './waiterLogic';

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

type Panel = 'bill' | 'move' | 'close' | null;

/**
 * Masa detayı: oturum yoksa boş durum + "Sipariş al"; varsa siparişler tur tur listelenir ve
 * altta masa işlemleri çubuğu durur (+ Sipariş ekle · Hesap · Taşı · Kapat — spec §8.2).
 *
 * Masa kilidi, teslim edilmiş siparişte iptal koruması ve "mutfakta açık sipariş var" kuralı
 * sunucudadır (R40/R41/R42): bu ekran kuralı yeniden türetmez, yalnız dönen hata anahtarını
 * `errors.<key>` ile (masa kapatmada ayrıca ne yapılacağını söyleyen açıklamayla) gösterir.
 */
export function TableDetailPage() {
  const { tableId } = useParams();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';

  const rows = useTableOverview();
  const table = rows.find((r) => r.table_id === tableId);
  const sessionQuery = useOpenSessionQuery(tableId);
  const session = sessionQuery.data ?? null;
  const orders = useSessionOrders(session?.id);
  const cancelReasons = parseCancelReasons(useSettings()?.cancel_reasons);

  // R76: spinner yalnız ilk yüklemede; arka plan tazelemesinde boş durum korunur.
  const body = tableBody(!!session, sessionQuery.isLoading);

  const markServed = useMarkServed();
  const reprint = useReprint();
  const retryJob = useRetryJob();
  const closeSession = useCloseSession();

  const [panel, setPanel] = useState<Panel>(null);
  const [cancelItem, setCancelItem] = useState<OrderItemView | null>(null);
  const [closeProblem, setCloseProblem] = useState<string | null>(null);

  const tableName = table ? localTableName(table.name, locale) : '';

  const confirmClose = async () => {
    if (!session) return;
    setCloseProblem(null);
    try {
      await closeSession.mutateAsync(session.id);
      setPanel(null);
      toast(t('waiter.close.done'), 'empty');
      navigate('/waiter');
    } catch (e) {
      const key = errorKey(e);
      setCloseProblem(key === 'open_orders_in_kitchen' ? t('waiter.close.blocked') : t(`errors.${key}`));
    }
  };

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <h1 className="text-xl font-semibold">{tableName}</h1>

      {body === 'loading' ? (
        <div className="flex justify-center py-12">
          <Spinner className="text-muted" label={t('common.loading')} />
        </div>
      ) : body === 'empty' || !session ? (
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
        <>
          <ul className="flex flex-col gap-4">
            {orders.map((order) => (
              <OrderCard
                key={order.id}
                order={order}
                locale={locale}
                cancelReasons={cancelReasons}
                onMarkServed={() => markServed.mutate(order.id)}
                onReprint={() => reprint.mutate(order.id)}
                onCancelItem={setCancelItem}
                onRetry={
                  order.print && printBadge(order.print) === 'failed'
                    ? () => retryJob.mutate(order.print!.job_id)
                    : undefined
                }
              />
            ))}
          </ul>

          <div
            aria-label={t('waiter.actions.tableActions')}
            role="group"
            className="sticky bottom-[calc(4rem+env(safe-area-inset-bottom))] z-10 -mx-4 flex flex-col gap-2 border-t border-border bg-surface px-4 py-3"
          >
            <Button
              size="lg"
              fullWidth
              icon={<Plus aria-hidden size={20} />}
              onClick={() => navigate(`/waiter/table/${tableId}/order`)}
            >
              {t('waiter.actions.addOrder')}
            </Button>
            {/*
              M3 tasarım kapısı, devredilen bulgu (c): üç eşit sütunda TR'de yalnız "Masayı kapat",
              DE'de ayrıca "Tisch wechseln" iki satıra sarılıyordu — üç sütunun ikisi çift satır
              olunca çubuk sayfanın dörtte birini yiyordu. 2+1 düzen: kısa iki eylem yan yana,
              en uzun ad (ve en yıkıcı eylem) kendi tam genişlikli satırında.
            */}
            <div data-testid="table-actions-pair" className="flex gap-2">
              <Button
                variant="secondary"
                className="min-w-0 flex-1"
                icon={<Receipt aria-hidden size={18} />}
                onClick={() => setPanel('bill')}
              >
                {t('waiter.actions.bill')}
              </Button>
              <Button
                variant="secondary"
                className="min-w-0 flex-1"
                icon={<ArrowRightLeft aria-hidden size={18} />}
                onClick={() => setPanel('move')}
              >
                {t('waiter.actions.move')}
              </Button>
            </div>
            <Button
              variant="secondary"
              fullWidth
              // M10: adı "Kapat" değil — paneldeki kapat düğmesiyle aynı erişilebilir adı
              // taşıyordu.
              icon={<DoorClosed aria-hidden size={18} />}
              onClick={() => {
                setCloseProblem(null);
                setPanel('close');
              }}
            >
              {t('waiter.actions.close')}
            </Button>
          </div>

          <BillSheet sessionId={session.id} locale={locale} open={panel === 'bill'} onClose={() => setPanel(null)} />
          <MoveTableSheet
            sessionId={session.id}
            currentTableId={session.table_id}
            locale={locale}
            open={panel === 'move'}
            onClose={() => setPanel(null)}
          />

          <Sheet
            open={panel === 'close'}
            onClose={() => setPanel(null)}
            title={t('waiter.close.title')}
            closeLabel={t('common.close')}
            footer={
              <div className="flex flex-col gap-3">
                {closeProblem ? (
                  <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
                    {closeProblem}
                  </Banner>
                ) : null}
                <Button
                  size="lg"
                  fullWidth
                  variant="danger"
                  loading={closeSession.isPending}
                  icon={<DoorClosed aria-hidden size={20} />}
                  onClick={() => void confirmClose()}
                >
                  {t('waiter.close.confirm')}
                </Button>
              </div>
            }
          >
            <p className="text-base">{t('waiter.close.question', { table: tableName })}</p>
          </Sheet>
        </>
      )}

      {cancelItem ? (
        <CancelItemSheet item={cancelItem} locale={locale} open onClose={() => setCancelItem(null)} />
      ) : null}
    </div>
  );
}

function OrderCard({
  order,
  locale,
  cancelReasons,
  onMarkServed,
  onReprint,
  onCancelItem,
  onRetry,
}: {
  order: OrderView;
  locale: Locale;
  cancelReasons: CancelReason[];
  onMarkServed: () => void;
  onReprint: () => void;
  onCancelItem: (item: OrderItemView) => void;
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

      <ul data-testid="order-items" className="flex flex-col gap-3">
        {/*
          Y8: iptal edilmiş kalemler görünümde sona iner; veri (fiş) sırası değişmez.
          Y2: kapsayıcıdaki blok `opacity-60` kaldırıldı — altındaki `--color-danger-ink`'i de
          söndürüp iptal sebebini 3,38:1'e düşürüyordu (axe: serious). "Yapma" sinyali mutfakta
          1–2 m'den en zor okunan şey oluyordu. Soluk görünüm artık üstü çizili ad + `text-muted`
          ile geliyor; sebep satırı tam opaklıkta danger-ink (7,4:1).
          Y7: ürün adı `product` rolüne (17 px), sebep satırı gövde ölçüsüne (16 px) çıktı — §10.6.
        */}
        {sortOrderItems(order.items).map((item) => {
          // M3: sebep sunucuda Almanca durur (STORNO fişi Almanca); arayüzde yerel etikete eşlenir,
          // eşleşmeyen serbest metin Almanca kalır ve `lang="de"` ile sarılır.
          const reason = item.cancel_reason ? localCancelReason(item.cancel_reason, cancelReasons, locale) : null;
          const cancelled = item.status === 'cancelled';
          return (
          <li key={item.id}>
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className={clsx('text-product font-medium', cancelled && 'line-through text-muted')}>
                  {item.quantity}× <span lang="de">{item.product_name}</span>
                </p>
                <ItemLines item={item} locale={locale} />
              </div>
              {item.status === 'active' ? (
                <Button
                  size="md"
                  variant="ghost"
                  className="shrink-0 text-danger-ink"
                  icon={<Ban aria-hidden size={18} />}
                  onClick={() => onCancelItem(item)}
                >
                  {t('waiter.actions.cancelItem')}
                </Button>
              ) : null}
            </div>
            {cancelled && reason ? (
              <p className="text-base font-medium text-danger-ink">
                {t('waiter.table.cancelReasonLabel')}{' '}
                <span lang={reason.isGerman ? 'de' : undefined}>{reason.text}</span>
              </p>
            ) : null}
          </li>
          );
        })}
      </ul>

      <div className="flex items-center gap-2">
        {order.status === 'ready' ? (
          <Button fullWidth icon={<Check aria-hidden size={20} />} onClick={onMarkServed}>
            {t('waiter.actions.markServed')}
          </Button>
        ) : null}
        {order.status === 'in_kitchen' ? (
          // O3: yalnız ikonlu düğme BUILD-PROMPT §10.3'te yalnız geri ve kapat için serbest.
          // "Teslim edildi (içecek)" üç noktanın arkasındaydı; yeni bir garson 5 dakikada bulamaz.
          <Button
            variant="ghost"
            icon={<MoreHorizontal aria-hidden size={20} />}
            onClick={() => setMoreOpen(true)}
          >
            {t('waiter.actions.more')}
          </Button>
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
