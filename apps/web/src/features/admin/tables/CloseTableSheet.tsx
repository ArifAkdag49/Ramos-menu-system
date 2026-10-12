import { formatEuro, localTableName, type Locale } from '@ramos/shared';
import { AlertTriangle, Receipt } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminTableState } from '../../../data/adminTables';
import { useCloseSession } from '../../../data/orders';
import { toast } from '../../../lib/toast';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { Sheet } from '../../../ui/Sheet';
import { errorKey } from '../../waiter/submitError';

/**
 * Admin > Masalar: açık hesabı kapatma onayı. Garsonun masa detayından yaptığı işin aynısını
 * çağırır (`close_table_session`) — ayrı bir kural yok: hazır siparişler teslim sayılır,
 * kalemler ciroda kalır, mutfaktaki sipariş mutfakta kalır (0008).
 *
 * Kalem dökümü yok, onay ekranıdır: tutar ve kalem sayısı `admin_table_states`'ten gelir, hesabın
 * kalem kalem dökümü Admin > Siparişler'de durur. Mutfakta iş varsa bu açıkça söylenir —
 * "kapattım, mutfak da durdu" sanılmasın.
 */
export function CloseTableSheet({
  row,
  locale,
  open,
  onClose,
}: {
  row: AdminTableState;
  locale: Locale;
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const close = useCloseSession();
  const [problem, setProblem] = useState<string | null>(null);
  const name = localTableName(row.name, locale);

  const confirm = async () => {
    setProblem(null);
    if (!row.session_id) return;
    try {
      await close.mutateAsync(row.session_id);
      toast(t('admin.tables.state.closed', { table: name }), 'ready');
      onClose();
    } catch (e) {
      setProblem(t(`errors.${errorKey(e)}`));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('admin.tables.state.closeTitle', { table: name })}
      closeLabel={t('common.close')}
      busy={close.isPending}
      footer={
        <div className="flex flex-col gap-3">
          {problem ? (
            <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
              {problem}
            </Banner>
          ) : null}
          <Button
            size="lg"
            fullWidth
            loading={close.isPending}
            icon={<Receipt aria-hidden size={20} />}
            onClick={() => void confirm()}
          >
            {t('admin.tables.state.close')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-lg font-semibold">{t('admin.tables.state.total')}</span>
          <span className="tabular text-3xl font-bold">{formatEuro(row.total_cents)}</span>
        </div>
        <p className="text-sm text-muted">
          {t('admin.tables.state.items')}: <span className="tabular">{row.items}</span>
        </p>
        <p className="text-base">{t('admin.tables.state.closeExplain')}</p>
        {row.orders_in_kitchen > 0 ? (
          <Banner tone="warning" icon={<AlertTriangle aria-hidden size={20} />}>
            {t('admin.tables.state.closeKitchenWarn', { count: row.orders_in_kitchen })}
          </Banner>
        ) : null}
      </div>
    </Sheet>
  );
}
