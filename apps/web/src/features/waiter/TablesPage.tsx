import { formatEuro, localTableName, type Locale } from '@ramos/shared';
import { clsx } from 'clsx';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useTableOverview } from '../../data/tables';
import { Badge } from '../../ui/Badge';
import { Chip } from '../../ui/Chip';
import { EmptyState } from '../../ui/EmptyState';
import { Elapsed } from '../common/Elapsed';
import { tableTone } from './waiterLogic';

type Filter = 'all' | 'open' | 'ready';

const CARD_TONE: Record<'free' | 'open' | 'ready', string> = {
  free: 'border-border bg-surface text-muted',
  open: 'border-lime/40 bg-lime/15 text-text',
  ready: 'border-gold/40 bg-gold/15 text-text',
};

/**
 * Garson masa ızgarası. Telefonda 3 sütun; kart tonu masanın durumunu taşır
 * (`data-tone` — Görev 16 KDS'te de aynı örüntü kullanılır).
 */
export function TablesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';
  const rows = useTableOverview();
  const [filter, setFilter] = useState<Filter>('all');

  // Görev 12'nin `useTableOverview`'i yükleme durumu döndürmez; seed her zaman masa içerdiğinden
  // boş dizi pratikte yalnız "henüz gelmedi" anlamına gelir (Karar: task-13-report.md).
  const loading = rows.length === 0;

  const visible = useMemo(() => rows.filter((r) => filter === 'all' || tableTone(r) === filter), [rows, filter]);

  return (
    <div className="flex flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap gap-2">
        <Chip selected={filter === 'all'} onClick={() => setFilter('all')}>
          {t('waiter.tables.filterAll')}
        </Chip>
        <Chip selected={filter === 'open'} onClick={() => setFilter('open')}>
          {t('waiter.tables.filterOpen')}
        </Chip>
        <Chip selected={filter === 'ready'} onClick={() => setFilter('ready')}>
          {t('waiter.tables.filterReady')}
        </Chip>
      </div>

      {loading ? (
        <div className="grid grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div
              key={i}
              aria-hidden
              className="h-28 animate-pulse rounded-card border border-border bg-surface-2"
            />
          ))}
        </div>
      ) : visible.length === 0 ? (
        <EmptyState
          title={t('waiter.tables.emptyFiltered')}
          action={
            <Chip selected={false} onClick={() => setFilter('all')}>
              {t('waiter.tables.emptyFilteredAction')}
            </Chip>
          }
        />
      ) : (
        <div className="grid grid-cols-3 gap-3">
          {visible.map((row) => {
            const tone = tableTone(row);
            return (
              <button
                key={row.table_id}
                type="button"
                data-tone={tone}
                onClick={() => navigate(`/waiter/table/${row.table_id}`)}
                className={clsx(
                  'flex min-h-24 flex-col items-start gap-1 rounded-card border p-3 text-left transition-colors',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
                  CARD_TONE[tone],
                )}
              >
                <span className="text-base font-semibold">{localTableName(row.name, locale)}</span>
                {tone !== 'free' ? (
                  <>
                    <span className="tabular text-sm">{formatEuro(row.total_cents)}</span>
                    {row.opened_by_name ? <span className="text-xs text-muted">{row.opened_by_name}</span> : null}
                    {row.opened_at ? <Elapsed since={row.opened_at} className="text-xs text-muted" /> : null}
                  </>
                ) : null}
                {tone === 'ready' ? (
                  <Badge tone="ready" className="mt-1 animate-pulse">
                    {t('status.ready')}
                  </Badge>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
