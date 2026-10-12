import { formatEuro, localTableName, type Locale } from '@ramos/shared';
import { clsx } from 'clsx';
import { ChefHat, CircleOff, DoorOpen, Eraser, Receipt, Utensils } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useOpenTableSession, type AdminTableState } from '../../../data/adminTables';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { Spinner } from '../../../ui/Spinner';
import { Elapsed } from '../../common/Elapsed';
import { errorKey } from '../../waiter/submitError';
import { CloseTableSheet } from './CloseTableSheet';
import { ResetTableSheet } from './ResetTableSheet';
import { summarizeTableStates, tableLiveState, type TableLiveState } from './tablesLogic';

const CARD_TONE: Record<TableLiveState, string> = {
  open: 'border-lime/40 bg-lime/10',
  free: 'border-border bg-surface',
  inactive: 'border-border bg-surface-2',
};

/**
 * Admin > Masalar > **Masa durumu** (0017). Alttaki düzenleme listesi masanın adını, sırasını ve
 * kullanımda olup olmadığını **Kaydet** ile yazar; burası ise masanın o anki hâlini ANINDA
 * değiştirir: boş masayı açar, açık hesabı kapatır, dolu kalmış masayı sıfırlar.
 *
 * Neden iki ayrı kapatma var:
 * - **Hesabı kapat** garsonun yaptığının aynısıdır (`close_table_session`): hazır siparişler
 *   teslim sayılır, kalemler ciroda kalır. Normal "müşteri ödedi, kalktı" durumu.
 * - **Sıfırla** (`admin_reset_table_session`) kalemleri iptal eder, ciroya girmez ve mutfağa
 *   STORNO fişi basar. Yanlışlıkla dolu kalmış ya da hiç servis edilmemiş masa için.
 *
 * Masa satırı sunucudaki sırada durur (düzenleme listesiyle aynı sıra): kart açılıp kapandıkça
 * yer değiştirmesin, admin tıklamak üzere olduğu düğmeyi kaybetmesin.
 */
export function TableStatesSection({
  rows,
  locale,
  loading,
  refreshing,
}: {
  rows: AdminTableState[];
  locale: Locale;
  loading: boolean;
  refreshing: boolean;
}) {
  const { t } = useTranslation();
  const openSession = useOpenTableSession();
  const [closing, setClosing] = useState<AdminTableState | null>(null);
  const [resetting, setResetting] = useState<AdminTableState | null>(null);
  const [pending, setPending] = useState<string | null>(null);
  const counts = summarizeTableStates(rows);

  const open = async (row: AdminTableState) => {
    setPending(row.table_id);
    try {
      await openSession.mutateAsync(row.table_id);
      toast(t('admin.tables.state.opened', { table: localTableName(row.name, locale) }), 'open');
    } catch (e) {
      toast(t(`errors.${errorKey(e)}`), 'danger');
    } finally {
      setPending(null);
    }
  };

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">{t('admin.tables.state.title')}</h2>
        <p className="text-sm text-muted">
          {t('admin.tables.state.summary', { busy: counts.open, free: counts.free })} ·{' '}
          {t('admin.tables.state.hint')}
        </p>
      </div>

      {refreshing ? (
        <p className="flex items-center gap-2 text-xs text-muted">
          <Spinner className="size-4" />
          {t('common.refreshing')}
        </p>
      ) : null}

      {loading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              aria-hidden
              className="h-36 animate-pulse rounded-card border border-border bg-surface-2"
            />
          ))}
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((row) => {
            const state = tableLiveState(row);
            const name = localTableName(row.name, locale);
            return (
              <li
                key={row.table_id}
                data-state={state}
                className={clsx('flex flex-col gap-3 rounded-card border p-3', CARD_TONE[state])}
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-base font-semibold">{name}</span>
                  {state === 'open' ? (
                    <Badge tone="open" icon={<Receipt aria-hidden size={14} />}>
                      {t('admin.tables.state.busy')}
                    </Badge>
                  ) : state === 'inactive' ? (
                    <Badge tone="empty" icon={<CircleOff aria-hidden size={14} />}>
                      {t('admin.tables.inactive')}
                    </Badge>
                  ) : (
                    <Badge tone="empty">{t('admin.tables.state.free')}</Badge>
                  )}
                </div>

                {state === 'open' ? (
                  <dl className="flex flex-col gap-1 text-sm">
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted">{t('admin.tables.state.total')}</dt>
                      <dd className="tabular text-lg font-bold">{formatEuro(row.total_cents)}</dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <dt className="text-muted">{t('admin.tables.state.items')}</dt>
                      <dd className="tabular">{row.items}</dd>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted">
                      {row.opened_at ? <Elapsed since={row.opened_at} /> : null}
                      {row.opened_by_name ? <span>{row.opened_by_name}</span> : null}
                      {row.orders_in_kitchen > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <ChefHat aria-hidden size={13} />
                          {t('admin.tables.state.inKitchen', { count: row.orders_in_kitchen })}
                        </span>
                      ) : null}
                      {row.orders_ready > 0 ? (
                        <span className="inline-flex items-center gap-1">
                          <Utensils aria-hidden size={13} />
                          {t('admin.tables.state.ready', { count: row.orders_ready })}
                        </span>
                      ) : null}
                    </div>
                    {/* Pasifleştirilmiş masada kalan açık hesap: garson ekranında hiç görünmez,
                        bu yüzden burada açıkça söylenir (0017 fonksiyon notu). */}
                    {!row.is_active ? (
                      <p className="text-xs text-warning">{t('admin.tables.state.strayOpen')}</p>
                    ) : null}
                  </dl>
                ) : (
                  <p className="text-sm text-muted">
                    {state === 'inactive'
                      ? t('admin.tables.isActiveHint')
                      : t('admin.tables.state.freeHint')}
                  </p>
                )}

                <div className="mt-auto flex flex-wrap gap-2">
                  {state === 'open' ? (
                    <>
                      <Button
                        variant="secondary"
                        icon={<Receipt aria-hidden size={18} />}
                        onClick={() => setClosing(row)}
                      >
                        {t('admin.tables.state.close')}
                      </Button>
                      <Button
                        variant="danger"
                        icon={<Eraser aria-hidden size={18} />}
                        onClick={() => setResetting(row)}
                      >
                        {t('admin.tables.state.reset')}
                      </Button>
                    </>
                  ) : state === 'free' ? (
                    <Button
                      variant="secondary"
                      icon={<DoorOpen aria-hidden size={18} />}
                      loading={pending === row.table_id}
                      onClick={() => void open(row)}
                    >
                      {t('admin.tables.state.open')}
                    </Button>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {closing ? (
        <CloseTableSheet
          row={closing}
          locale={locale}
          open={Boolean(closing)}
          onClose={() => setClosing(null)}
        />
      ) : null}
      {resetting ? (
        <ResetTableSheet
          row={resetting}
          locale={locale}
          open={Boolean(resetting)}
          onClose={() => setResetting(null)}
        />
      ) : null}
    </section>
  );
}
