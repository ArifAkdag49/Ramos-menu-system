import { formatOrderNo, localTableName, type Locale } from '@ramos/shared';
import { Check, ClipboardCheck } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useMarkServed, useReadyOrders } from '../../data/orders';
import { useAuth } from '../../lib/auth';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { sortReady } from './waiterLogic';

/** Hazır sekmesi: önce garsonun kendi siparişleri, sonra hazır olma sırası (Görev 12 `useReadyOrders`). */
export function ReadyPage() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';
  const me = useAuth((s) => s.profile);
  const markServed = useMarkServed();
  const orders = sortReady(useReadyOrders(), me?.id ?? '');

  if (orders.length === 0) {
    return <EmptyState icon={<ClipboardCheck aria-hidden size={40} />} title={t('waiter.ready.empty')} />;
  }

  return (
    <ul className="flex flex-col gap-3 px-4 py-4">
      {orders.map((order) => (
        <li key={order.id} className="flex flex-col gap-3 rounded-card border border-gold/40 bg-gold/15 p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="text-base font-semibold">{localTableName(order.table_name, locale)}</span>
            <span className="tabular text-sm text-muted">{formatOrderNo(order.order_no)}</span>
          </div>
          <ul className="flex flex-col gap-1 text-sm">
            {order.items.slice(0, 3).map((item) => (
              <li key={item.id}>
                {item.quantity}× {item.product_name}
              </li>
            ))}
          </ul>
          <Button icon={<Check aria-hidden size={20} />} onClick={() => markServed.mutate(order.id)}>
            {t('waiter.actions.markServed')}
          </Button>
        </li>
      ))}
    </ul>
  );
}
