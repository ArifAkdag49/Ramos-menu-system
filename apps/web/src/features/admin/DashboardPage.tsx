import { formatEuro, localTableName, type Locale } from '@ramos/shared';
import { useTranslation } from 'react-i18next';
import { useRecentAudit, type AuditEntry } from '../../data/audit';
import { useReportRange } from '../../data/reports';
import { useStaffNames } from '../../data/staff';
import { useTableOverviewQuery, type TableRow } from '../../data/tables';
import { Badge } from '../../ui/Badge';
import { Spinner } from '../../ui/Spinner';
import type { Tone } from '../../ui/tone';
import { Elapsed } from '../common/Elapsed';
import { businessDate, dashboardStats, formatBusinessDay } from './dashboardLogic';
import { PrinterCard } from './PrinterCard';

const AUDIT_LIMIT = 10;

const ACTION_KEY = {
  session_open: 'admin.audit.action.session_open',
  session_close: 'admin.audit.action.session_close',
  session_move: 'admin.audit.action.session_move',
  order_submit: 'admin.audit.action.order_submit',
  order_ready: 'admin.audit.action.order_ready',
  order_ready_undo: 'admin.audit.action.order_ready_undo',
  order_served: 'admin.audit.action.order_served',
  order_reprint: 'admin.audit.action.order_reprint',
  item_cancel: 'admin.audit.action.item_cancel',
  product_sold_out: 'admin.audit.action.product_sold_out',
  product_available: 'admin.audit.action.product_available',
  duty_on: 'admin.audit.action.duty_on',
  duty_off: 'admin.audit.action.duty_off',
} as const;

/** `internal.audit_row()` tetikleyicisinin ürettiği kayıtlar: eylem satır işlemi, nesne tablodur. */
const ROW_ACTION_KEY = {
  insert: 'admin.audit.action.insert',
  update: 'admin.audit.action.update',
  delete: 'admin.audit.action.delete',
} as const;

const ENTITY_KEY = {
  categories: 'admin.audit.entity.categories',
  products: 'admin.audit.entity.products',
  product_variants: 'admin.audit.entity.product_variants',
  ingredients: 'admin.audit.entity.ingredients',
  product_ingredients: 'admin.audit.entity.product_ingredients',
  option_groups: 'admin.audit.entity.option_groups',
  options: 'admin.audit.entity.options',
  product_option_groups: 'admin.audit.entity.product_option_groups',
  dining_tables: 'admin.audit.entity.dining_tables',
  settings: 'admin.audit.entity.settings',
} as const;

const CLOCK = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
});

/**
 * Admin canlı durum ekranı (spec §8.4). Dört sayı, yazıcı kartı, açık masalar ve son hareketler.
 *
 * `dataviz`: kutular sade, rakamlar `tabular`, renk yalnız **anlam** taşıdığı yerde (masa ve
 * yazıcı durumu) kullanılır — sayıların kendisi metin renginde kalır, böylece spec §8.5'in sabit
 * renk sözlüğü bozulmaz. Telefonda tablo yok: açık masalar kart listesine iner (BUILD-PROMPT §10.7).
 */
export function DashboardPage() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';

  // "Henüz gelmedi" ile "yok" AYRI şeylerdir: ilk yüklemede boş durum metni göstermek operatöre
  // yanlış bilgi verir (M3 kapısının (d) tuzağı). Bu yüzden sorguların bekleme durumu da okunur.
  const tablesQuery = useTableOverviewQuery();
  const tables = tablesQuery.data ?? [];
  const stats = dashboardStats(tables);
  const today = businessDate(new Date());
  const { report, isPending: reportPending } = useReportRange(today, today);
  const { entries: audit, isPending: auditPending } = useRecentAudit(AUDIT_LIMIT);
  const staffNames = useStaffNames();

  const openTables = tables.filter((row) => row.session_id);
  const tablesPending = tablesQuery.isPending;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t('admin.dashboard.title')}</h1>
        <p className="text-xs text-muted">
          {t('admin.dashboard.businessDayNote', { date: formatBusinessDay(today) })}
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label={t('admin.dashboard.openTables')} value={stats.openTables} pending={tablesPending} />
            <Stat label={t('admin.dashboard.inKitchen')} value={stats.inKitchen} pending={tablesPending} />
            <Stat label={t('admin.dashboard.ready')} value={stats.ready} pending={tablesPending} />
            <Stat
              label={t('admin.dashboard.revenue')}
              value={formatEuro(report?.value_cents ?? 0)}
              pending={reportPending}
              note={t('admin.dashboard.revenueNote', {
                orders: report?.orders ?? 0,
                items: report?.items ?? 0,
              })}
            />
          </div>

          <OpenTables
            rows={openTables}
            locale={locale}
            openValueCents={stats.openValueCents}
            pending={tablesPending}
          />
        </div>

        <div className="flex flex-col gap-6">
          <PrinterCard />
          <AuditList entries={audit} staffNames={staffNames} pending={auditPending} />
        </div>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  note,
  pending,
}: {
  label: string;
  value: string | number;
  note?: string;
  pending: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-card border border-border bg-surface px-4 py-3">
      <span className="text-xs font-medium text-muted">{label}</span>
      {/* Veri gelmeden "0" yazmak yanlış bilgidir; tire tarafsızdır ve düzen kaymaz. */}
      <span className="tabular text-[30px] font-semibold leading-none">{pending ? '—' : value}</span>
      {note ? <span className="text-xs text-muted">{pending ? ' ' : note}</span> : null}
    </div>
  );
}

/** Liste gövdesinin ilk yükleme hâli — boş durum metniyle karıştırılmasın diye ayrı. */
function Loading() {
  const { t } = useTranslation();
  return (
    <p className="flex items-center justify-center gap-2 px-4 py-8 text-muted">
      <Spinner label={t('common.loading')} />
      <span>{t('common.loading')}</span>
    </p>
  );
}

/** Masa satırının durumu: hazır (altın) > mutfakta (lime) > açık (gri). Spec §8.5. */
function rowState(row: TableRow): { tone: Tone; key: 'admin.dashboard.ready' | 'admin.dashboard.inKitchen' | 'admin.dashboard.tables.stateOpen' } {
  if (row.orders_ready > 0) return { tone: 'ready', key: 'admin.dashboard.ready' };
  if (row.orders_in_kitchen > 0) return { tone: 'open', key: 'admin.dashboard.inKitchen' };
  return { tone: 'empty', key: 'admin.dashboard.tables.stateOpen' };
}

function OpenTables({
  rows,
  locale,
  openValueCents,
  pending,
}: {
  rows: TableRow[];
  locale: Locale;
  openValueCents: number;
  pending: boolean;
}) {
  const { t } = useTranslation();

  return (
    <section aria-labelledby="open-tables-title" className="rounded-card border border-border bg-surface">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
        <h2 id="open-tables-title" className="text-base font-semibold">
          {t('admin.dashboard.tables.title')}
        </h2>
        <span className="text-xs text-muted">
          {pending ? ' ' : t('admin.dashboard.openValueNote', { total: formatEuro(openValueCents) })}
        </span>
      </div>

      {pending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-muted">{t('admin.dashboard.tables.empty')}</p>
      ) : (
        <>
          {/* Telefon: kart listesi */}
          <ul className="flex flex-col divide-y divide-border md:hidden">
            {rows.map((row) => {
              const state = rowState(row);
              return (
                <li key={row.table_id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{localTableName(row.name, locale)}</span>
                    <span className="block truncate text-xs text-muted">
                      {row.opened_by_name ?? '—'}
                      {row.opened_at ? ' · ' : ''}
                      {row.opened_at ? <Elapsed since={row.opened_at} /> : null}
                    </span>
                  </span>
                  <span className="flex shrink-0 items-center gap-3">
                    <span className="tabular font-semibold">{formatEuro(row.total_cents)}</span>
                    <Badge tone={state.tone}>{t(state.key)}</Badge>
                  </span>
                </li>
              );
            })}
          </ul>

          {/* Masaüstü: tablo */}
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('admin.dashboard.tables.table')}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('admin.dashboard.tables.openedBy')}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('admin.dashboard.tables.elapsed')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('admin.dashboard.tables.total')}
                </th>
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('admin.dashboard.tables.state')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => {
                const state = rowState(row);
                return (
                  <tr key={row.table_id}>
                    <th scope="row" className="px-4 py-2 text-left font-semibold">
                      {localTableName(row.name, locale)}
                    </th>
                    <td className="px-4 py-2 text-muted">{row.opened_by_name ?? '—'}</td>
                    <td className="tabular px-4 py-2 text-muted">
                      {row.opened_at ? <Elapsed since={row.opened_at} /> : '—'}
                    </td>
                    <td className="tabular px-4 py-2 text-right font-semibold">{formatEuro(row.total_cents)}</td>
                    <td className="px-4 py-2">
                      <Badge tone={state.tone}>{t(state.key)}</Badge>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

function AuditList({
  entries,
  staffNames,
  pending,
}: {
  entries: AuditEntry[];
  staffNames: Map<string, string>;
  pending: boolean;
}) {
  const { t } = useTranslation();

  const describe = (e: AuditEntry): string => {
    const rowAction = ROW_ACTION_KEY[e.action as keyof typeof ROW_ACTION_KEY];
    if (rowAction) {
      const entity = ENTITY_KEY[e.entity as keyof typeof ENTITY_KEY];
      return t(rowAction, { entity: entity ? t(entity) : e.entity });
    }
    const action = ACTION_KEY[e.action as keyof typeof ACTION_KEY];
    return action ? t(action) : `${e.action} · ${e.entity}`;
  };

  return (
    <section aria-labelledby="audit-title" className="rounded-card border border-border bg-surface">
      <h2 id="audit-title" className="border-b border-border px-4 py-3 text-base font-semibold">
        {t('admin.dashboard.audit.title')}
      </h2>

      {pending ? (
        <Loading />
      ) : entries.length === 0 ? (
        <p className="px-4 py-8 text-center text-muted">{t('admin.dashboard.audit.empty')}</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border">
          {entries.map((e) => (
            <li key={e.id} className="flex gap-3 px-4 py-2">
              <time dateTime={e.at} className="tabular shrink-0 text-muted">
                {CLOCK.format(new Date(e.at))}
              </time>
              <span className="min-w-0">
                <span className="block">{describe(e)}</span>
                <span className="block truncate text-xs text-muted">
                  {(e.actor_id && staffNames.get(e.actor_id)) || '—'}
                </span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
