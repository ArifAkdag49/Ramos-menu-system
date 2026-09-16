import { formatEuro, type Locale } from '@ramos/shared';
import { Receipt } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useBill } from '../../data/orders';
import { EmptyState } from '../../ui/EmptyState';
import { Sheet } from '../../ui/Sheet';
import { Spinner } from '../../ui/Spinner';
import { billLineLabel, parseBill } from './bill';

/**
 * Hesap özeti (spec §8.2): aktif kalemler `get_session_bill` tarafından gruplanır, burada yalnız
 * gösterilir — gruplama ve toplam istemcide yeniden hesaplanmaz. Fiş basılmaz, bu bir kasa notudur.
 */
export function BillSheet({
  sessionId,
  locale,
  open,
  onClose,
}: {
  sessionId: string;
  locale: Locale;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { data, isPending } = useBill(open ? sessionId : null);
  const bill = parseBill(data);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('waiter.bill.title')}
      closeLabel={t('common.close')}
      footer={
        bill && bill.lines.length > 0 ? (
          <div className="flex flex-col gap-1 border-t border-border pt-3">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-lg font-semibold">{t('waiter.bill.total')}</span>
              <span className="tabular text-3xl font-bold">{formatEuro(bill.total_cents)}</span>
            </div>
            <p className="text-sm text-muted">{t('waiter.bill.note')}</p>
          </div>
        ) : undefined
      }
    >
      {isPending && !bill ? (
        <div className="flex justify-center py-8">
          <Spinner className="text-muted" label={t('common.loading')} />
        </div>
      ) : !bill || bill.lines.length === 0 ? (
        <EmptyState icon={<Receipt aria-hidden size={40} />} title={t('waiter.bill.empty')} />
      ) : (
        <ul className="flex flex-col gap-3">
          {bill.lines.map((line, i) => (
            <li key={i} className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div className="min-w-0">
                <p className="text-base font-medium">
                  <span className="tabular">{line.quantity}×</span> <span lang="de">{billLineLabel(line, locale)}</span>
                </p>
                <p className="tabular text-sm text-muted">{formatEuro(line.unit_price_cents)}</p>
              </div>
              <span className="tabular shrink-0 text-base font-semibold">{formatEuro(line.line_total_cents)}</span>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
