import {
  cartTotalCents,
  formatEuro,
  formatOrderNo,
  unitPriceCents,
  type CartLine,
  type Locale,
  type MenuProduct,
} from '@ramos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { AlertTriangle, Pencil, Send, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useSubmitOrder } from '../../data/orders';
import { toast } from '../../lib/toast';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { Sheet } from '../../ui/Sheet';
import { cartLineSummary } from './cartLineSummary';
import { useCart } from './cartStore';
import { MissingProductLine } from './MissingProductLine';
import { submitErrorView, type SubmitErrorView } from './submitError';

/**
 * Gönderim onayı (spec §8.2: "Mutfağa gönder önce bir onay özeti gösterir").
 *
 * Hata durumunda panel kapanmaz: sepet olduğu gibi durur, sunucunun döndürdüğü anahtar
 * `errors.<key>` ile yazılır ve **ilgili satır** kırmızı işaretlenip tek bir eylem önerilir
 * (`submitError.ts`). Kural istemcide yeniden türetilmez — R40/R41/R42 gereği karar sunucunundur.
 *
 * "Tekrar gönder" aynı `order_id` ile dener: `useSubmitOrder` kimliği `ensurePendingId`'den okur
 * ve sepet değişmediği sürece o kimlik sabittir (R36) — bu yüzden çift sipariş oluşmaz.
 */
export function SendConfirm({
  tableId,
  tableName,
  lines,
  byId,
  locale,
  onBack,
  onEditLine,
}: {
  tableId: string;
  tableName: string;
  lines: CartLine[];
  byId: Map<string, MenuProduct>;
  locale: Locale;
  onBack: () => void;
  onEditLine: (line: CartLine) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const remove = useCart((s) => s.remove);
  const { send, isPending } = useSubmitOrder(tableId);
  const [problem, setProblem] = useState<SubmitErrorView | null>(null);

  // M1: "kalem" / "Position" = SATIR. Adetleri toplamak "2× döner + 1 kola" için "3 kalem"
  // derdi; Almancası ("3 Positionen") düpedüz yanlış olurdu.
  const count = lines.length;
  const total = cartTotalCents(lines, byId);
  const bad = new Set(problem?.badLineKeys ?? []);

  const submit = async () => {
    setProblem(null);
    try {
      const result = await send();
      toast(
        t(result.duplicate ? 'waiter.send.duplicate' : 'waiter.send.sent', {
          orderNo: formatOrderNo(result.order_no),
        }),
        result.duplicate ? 'warning' : 'open',
      );
      navigate(`/waiter/table/${tableId}`);
    } catch (e) {
      const view = submitErrorView(e, lines, byId);
      if (view.refreshMenu) void qc.invalidateQueries({ queryKey: ['menu'] });
      setProblem(view);
    }
  };

  return (
    <Sheet
      open
      busy={isPending}
      onClose={onBack}
      title={t('waiter.send.title')}
      closeLabel={t('common.back')}
      footer={
        <div className="flex flex-col gap-3">
          {problem ? (
            <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
              {t(`errors.${problem.key}`)}
              {problem.suggest === 'retry' ? ` — ${t('waiter.send.checkTable')}` : ''}
            </Banner>
          ) : null}
          <Button
            size="lg"
            fullWidth
            loading={isPending}
            icon={<Send aria-hidden size={20} />}
            onClick={() => void submit()}
          >
            {problem ? t('waiter.send.retry') : t('waiter.send.confirm')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-lg font-semibold">{tableName}</p>
          <p className="text-sm text-muted">{t('waiter.send.summary', { n: count })}</p>
        </div>

        <ul className="flex flex-col gap-2">
          {lines.map((line) => {
            const product = byId.get(line.productId);
            // R75: bu satır gönderilecek, o hâlde görünmek zorunda — sunucu `product_*` hatası
            // döndüğünde işaretlenecek satır bu.
            if (!product)
              return (
                <MissingProductLine
                  key={line.key}
                  productId={line.productId}
                  onRemove={() => {
                    remove(tableId, line.key);
                    setProblem(null);
                  }}
                />
              );
            const marked = bad.has(line.key);
            return (
              <li
                key={line.key}
                data-bad={marked || undefined}
                className={clsx(
                  'flex flex-col gap-2 rounded-card border p-3',
                  marked ? 'border-danger bg-danger/10' : 'border-border bg-surface-2',
                )}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-base font-semibold">
                      {line.quantity}× <span lang="de">{product.name}</span>
                    </p>
                    <p className="text-sm text-muted">
                      {cartLineSummary(product, line, locale, t('waiter.order.removedPrefix'))}
                    </p>
                  </div>
                  <span className="tabular shrink-0 text-base font-semibold">
                    {formatEuro(unitPriceCents(product, line) * line.quantity)}
                  </span>
                </div>

                {marked && problem?.suggest === 'edit' ? (
                  <Button
                    variant="secondary"
                    icon={<Pencil aria-hidden size={18} />}
                    onClick={() => onEditLine(line)}
                  >
                    {t('common.edit')}
                  </Button>
                ) : null}
                {marked && problem?.suggest === 'remove' ? (
                  <Button
                    variant="danger"
                    icon={<Trash2 aria-hidden size={18} />}
                    onClick={() => {
                      remove(tableId, line.key);
                      setProblem(null);
                    }}
                  >
                    {t('common.remove')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>

        <div className="flex items-baseline justify-between gap-3 border-t border-border pt-3">
          <span className="text-base font-semibold">{t('waiter.cart.total')}</span>
          <span className="tabular text-2xl font-bold">{formatEuro(total)}</span>
        </div>
      </div>
    </Sheet>
  );
}
