import { formatEuro, localTableName, type Locale } from '@ramos/shared';
import { AlertTriangle, Eraser } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useResetTableSession, type AdminTableState } from '../../../data/adminTables';
import { useSettings } from '../../../data/settings';
import { toast } from '../../../lib/toast';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { Chip } from '../../../ui/Chip';
import { Sheet } from '../../../ui/Sheet';
import { parseCancelReasons, type CancelReason } from '../../waiter/cancelReasons';
import { errorKey } from '../../waiter/submitError';

/**
 * Admin > Masalar: masayı **sıfırlama** onayı (`admin_reset_table_session`). Hesabı kapatmaktan
 * farkı: masadaki aktif kalemlerin hepsi iptal edilir, ciroya girmez ve mutfakta/hazır bekleyen
 * her sipariş için STORNO fişi basılır.
 *
 * Sebep zorunludur ve `CancelItemSheet` ile aynı karara uyar: sunucuya **Almanca** yazılır, çünkü
 * sebep doğrudan STORNO fişinin gövdesine giriyor ve fiş her zaman Almancadır. Seçenekler
 * ayarlardaki iptal sebepleridir (`settings.cancel_reasons`); "diğer" serbest metin açar.
 */
export function ResetTableSheet({
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
  const settings = useSettings();
  const reset = useResetTableSession();
  const reasons: CancelReason[] = parseCancelReasons(settings?.cancel_reasons);

  const [picked, setPicked] = useState<number | null>(null);
  const [freeText, setFreeText] = useState('');
  const [problem, setProblem] = useState<string | null>(null);
  const name = localTableName(row.name, locale);

  const chosen = picked === null ? undefined : reasons[picked];
  const needsText = chosen?.freeText === true;
  const reason = needsText ? freeText.trim() : (chosen?.de ?? '');

  const confirm = async () => {
    setProblem(null);
    if (!row.session_id) return;
    try {
      const r = await reset.mutateAsync({ sessionId: row.session_id, reason });
      toast(t('admin.tables.state.resetDone', { table: name, count: r.items }), 'ready');
      onClose();
    } catch (e) {
      setProblem(t(`errors.${errorKey(e)}`));
    }
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('admin.tables.state.resetTitle', { table: name })}
      closeLabel={t('common.close')}
      busy={reset.isPending}
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
            variant="danger"
            disabled={reason.length === 0}
            loading={reset.isPending}
            icon={<Eraser aria-hidden size={20} />}
            onClick={() => void confirm()}
          >
            {t('admin.tables.state.reset')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
          {t('admin.tables.state.resetWarn', {
            count: row.items,
            total: formatEuro(row.total_cents),
          })}
        </Banner>
        {row.orders_in_kitchen + row.orders_ready > 0 ? (
          <p className="text-base">
            {t('admin.tables.state.resetStorno', {
              count: row.orders_in_kitchen + row.orders_ready,
            })}
          </p>
        ) : null}

        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-base font-semibold">
            {t('waiter.cancelItem.reasonLabel')}
          </legend>
          <div className="flex flex-wrap gap-2">
            {reasons.map((r, i) => (
              <Chip key={r.de} selected={picked === i} onClick={() => setPicked(i)}>
                <span lang={locale === 'tr' && r.tr ? undefined : 'de'}>
                  {(locale === 'tr' && r.tr) || r.de}
                </span>
              </Chip>
            ))}
          </div>
        </fieldset>

        {needsText ? (
          <div className="flex flex-col gap-2">
            <label htmlFor="reset-reason-text" className="text-base font-semibold">
              {t('waiter.cancelItem.otherLabel')}
            </label>
            <input
              id="reset-reason-text"
              type="text"
              value={freeText}
              maxLength={200}
              autoComplete="off"
              placeholder={t('waiter.cancelItem.otherPlaceholder')}
              onChange={(e) => setFreeText(e.target.value)}
              className="w-full rounded-control border border-border bg-surface-2 px-3 py-3 text-base text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
            />
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
