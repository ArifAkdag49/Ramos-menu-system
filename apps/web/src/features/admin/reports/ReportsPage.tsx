import { formatEuro, type Locale } from '@ramos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { AlertTriangle, Download, FlaskConical } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchOrdersForExport } from '../../../data/adminOrders';
import { useReportRange, type ReportRange } from '../../../data/reports';
import { useBusinessDayStart } from '../../../data/settings';
import { staffNamesQuery, useAdminStaffList } from '../../../data/staff';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../ui/Badge';
import { Banner } from '../../../ui/Banner';
import { Button } from '../../../ui/Button';
import { Chip } from '../../../ui/Chip';
import { Spinner } from '../../../ui/Spinner';
import { businessDate, dateRangeError, formatBusinessDay, formatDayStart } from '../dashboardLogic';
import { TextField } from '../menu/fields';
import { CSV_HEADERS, csvFileName, downloadTextFile, orderRowsForCsv, toCsv } from './csv';
import {
  activePreset,
  hourAxis,
  hourRows,
  isTestWaiter,
  presetRange,
  RANGE_PRESETS,
  type RangePreset,
} from './reportsLogic';

const PRESET_KEY = {
  today: 'admin.reports.presets.today',
  yesterday: 'admin.reports.presets.yesterday',
  last7: 'admin.reports.presets.last7',
  thisMonth: 'admin.reports.presets.thisMonth',
} as const satisfies Record<RangePreset, string>;

const DAY_MS = 24 * 60 * 60 * 1000;
const dayCount = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / DAY_MS) + 1;

const hourLabel = (hour: number) => `${String(hour).padStart(2, '0')}:00`;

/**
 * Admin > Raporlar (spec §8.4). Tarih aralığı tek satırda, her şeyin üstünde (dataviz: süzgeç
 * altındaki her sayıyı birlikte kapsar). Aralık iş günüdür — başlangıç saati ayardan (R86).
 *
 * Görsel dil panoyla aynı: sayılar metin renginde, renk yalnız çubukta (tek seri → tek renk lime,
 * lejant yok; başlık neyin çizildiğini söyler). Telefonda tablo yok: garson ve ürün listeleri
 * kart satırına iner; saatlik dağılım zaten satır satır bir çubuk tablosudur ve yatay kaymaz.
 */
export function ReportsPage() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';
  const queryClient = useQueryClient();
  const dayStart = useBusinessDayStart();
  const today = businessDate(new Date(), dayStart);
  // Tarih seçilmedikçe (null) aralık "bugün"ü izler; iş günü başlangıcı sonradan gelebilir (R86).
  const [range, setRange] = useState<{ from: string | null; to: string | null }>({
    from: null,
    to: null,
  });
  const from = range.from ?? today;
  const to = range.to ?? today;
  const rangeError = dateRangeError(from, to);
  const { report, isPending, isStale, isError } = useReportRange(
    rangeError ? '' : from,
    rangeError ? '' : to,
  );
  const staff = useAdminStaffList().data ?? [];
  const [exporting, setExporting] = useState(false);
  const preset = activePreset(from, to, today);

  const exportCsv = async () => {
    setExporting(true);
    try {
      // Garson adları dosyaya yazılmadan önce beklenir; boş "Kellner" sütunu sessiz bir hata olurdu.
      const names = await queryClient.ensureQueryData(staffNamesQuery);
      const orders = await fetchOrdersForExport(from, to, names);
      if (orders.length === 0) {
        toast(t('admin.reports.csv.empty'), 'info');
        return;
      }
      downloadTextFile(
        csvFileName(from, to),
        toCsv(CSV_HEADERS, orderRowsForCsv(orders)),
        'text/csv;charset=utf-8',
      );
      toast(t('admin.reports.csv.done', { count: orders.length }));
    } catch {
      toast(t('admin.reports.csv.error'), 'danger');
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('admin.reports.title')}</h1>
          <p className="text-muted">
            {rangeError
              ? ' '
              : from === to
                ? formatBusinessDay(from)
                : t('admin.reports.rangeSummary', {
                    from: formatBusinessDay(from),
                    to: formatBusinessDay(to),
                    count: dayCount(from, to),
                  })}
          </p>
        </div>
        <Button
          icon={<Download aria-hidden size={20} />}
          loading={exporting}
          disabled={exporting || !!rangeError}
          onClick={() => void exportCsv()}
          className="max-sm:w-full"
        >
          {t('admin.reports.csv.download')}
        </Button>
      </header>

      <section
        aria-label={t('admin.reports.rangeLabel')}
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
      >
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div
            role="group"
            aria-label={t('admin.reports.presets.label')}
            className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap"
          >
            {RANGE_PRESETS.map((p) => (
              <Chip
                key={p}
                selected={preset === p}
                className="justify-center text-sm"
                onClick={() =>
                  setRange(p === 'today' ? { from: null, to: null } : presetRange(p, today))
                }
              >
                {t(PRESET_KEY[p])}
              </Chip>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3 lg:w-[22rem]">
            <TextField
              type="date"
              label={t('admin.range.from')}
              value={from}
              onChange={(v) => setRange({ from: v, to })}
            />
            <TextField
              type="date"
              label={t('admin.range.to')}
              value={to}
              onChange={(v) => setRange({ from, to: v })}
            />
          </div>
        </div>
        {rangeError ? (
          <p role="alert" className="text-danger-ink">
            {t(`admin.range.errors.${rangeError}`)}
          </p>
        ) : (
          <p className="text-xs text-muted">
            {t('admin.range.note', { time: formatDayStart(dayStart) })}
          </p>
        )}
      </section>

      {rangeError ? null : isError && !report ? (
        <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
          {t('admin.reports.loadError')}
        </Banner>
      ) : (
        <div
          aria-busy={isPending || isStale || undefined}
          className={clsx(
            'flex flex-col gap-6 transition-opacity duration-150 ease-out',
            // Yeni aralık yüklenirken eski çerçeve yerinde kalır, yalnız soluklaşır (zıplama yok).
            isStale && 'opacity-60',
          )}
        >
          <StatTiles report={report} pending={isPending} />

          <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
            <WaiterTable report={report} pending={isPending} staff={staff} />
            <TopProducts report={report} pending={isPending} />
          </div>

          <HourChart report={report} pending={isPending} dayStart={dayStart} locale={locale} />
        </div>
      )}
    </div>
  );
}

function Card({
  id,
  title,
  subtitle,
  children,
}: {
  id: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <section aria-labelledby={id} className="min-w-0 rounded-card border border-border bg-surface">
      <div className="flex flex-col gap-0.5 border-b border-border px-4 py-3">
        <h2 id={id} className="text-base font-semibold">
          {title}
        </h2>
        {subtitle ? <p className="text-xs text-muted">{subtitle}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <p className="flex items-center justify-center gap-2 px-4 py-8 text-muted">
      <Spinner label={t('common.loading')} />
      <span>{t('common.loading')}</span>
    </p>
  );
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-muted">{children}</p>;
}

function StatTiles({ report, pending }: { report: ReportRange | undefined; pending: boolean }) {
  const { t } = useTranslation();
  const r = pending ? undefined : report;
  const average = r && r.orders > 0 ? Math.round(r.value_cents / r.orders) : null;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <StatTile label={t('admin.reports.stats.orders')} value={r ? String(r.orders) : null} />
      <StatTile label={t('admin.reports.stats.items')} value={r ? String(r.items) : null} />
      <StatTile
        label={t('admin.reports.stats.revenue')}
        value={r ? formatEuro(r.value_cents) : null}
        note={
          average !== null ? t('admin.reports.stats.average', { value: formatEuro(average) }) : null
        }
      />
      <StatTile
        label={t('admin.reports.stats.cancelled')}
        value={r ? String(r.cancelled_items) : null}
        note={
          r
            ? t('admin.reports.stats.cancelledValue', {
                value: formatEuro(r.cancelled_value_cents),
              })
            : null
        }
      />
    </div>
  );
}

/**
 * Sayı kutusu (dataviz "stat tile"): etiket · değer · not. Büyük tek başına değer orantılı
 * rakamla yazılır; `tabular` yalnız hizalanması gereken sütunlarda kullanılır.
 */
function StatTile({
  label,
  value,
  note,
}: {
  label: string;
  value: string | null;
  note?: string | null;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-card border border-border bg-surface px-4 py-3">
      <span className="text-xs font-medium text-muted">{label}</span>
      {/* Veri gelmeden "0" yazmak yanlış bilgidir; tire tarafsızdır ve düzen kaymaz. */}
      <span className="break-words text-[26px] font-semibold leading-tight sm:text-[30px]">
        {value ?? '—'}
      </span>
      <span className="min-h-[1lh] text-xs text-muted">{note ?? ' '}</span>
    </div>
  );
}

function TestBadge() {
  const { t } = useTranslation();
  return (
    <Badge tone="warning" icon={<FlaskConical aria-hidden size={14} />}>
      {t('admin.reports.waiters.test')}
    </Badge>
  );
}

function WaiterTable({
  report,
  pending,
  staff,
}: {
  report: ReportRange | undefined;
  pending: boolean;
  staff: readonly { username: string; display_name: string }[];
}) {
  const { t } = useTranslation();
  const rows = report?.by_waiter ?? [];
  return (
    <Card id="report-waiters" title={t('admin.reports.waiters.title')}>
      {pending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>{t('admin.reports.empty')}</Empty>
      ) : (
        <>
          <ul className="flex flex-col divide-y divide-border md:hidden">
            {rows.map((w) => (
              <li
                key={w.display_name}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="flex min-w-0 flex-col gap-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="break-words font-semibold">{w.display_name}</span>
                    {isTestWaiter(w.display_name, staff) ? <TestBadge /> : null}
                  </span>
                  <span className="text-muted">
                    {t('admin.reports.waiters.ordersCount', { count: w.orders })}
                  </span>
                </span>
                <span className="tabular shrink-0 font-semibold">{formatEuro(w.value_cents)}</span>
              </li>
            ))}
          </ul>
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="px-4 py-2 font-medium">
                  {t('admin.reports.waiters.name')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('admin.reports.waiters.orders')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('admin.reports.waiters.revenue')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((w) => (
                <tr key={w.display_name}>
                  <th scope="row" className="px-4 py-2 text-left font-semibold">
                    <span className="flex flex-wrap items-center gap-2">
                      {w.display_name}
                      {isTestWaiter(w.display_name, staff) ? <TestBadge /> : null}
                    </span>
                  </th>
                  <td className="tabular px-4 py-2 text-right">{w.orders}</td>
                  <td className="tabular px-4 py-2 text-right font-semibold">
                    {formatEuro(w.value_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

function TopProducts({ report, pending }: { report: ReportRange | undefined; pending: boolean }) {
  const { t } = useTranslation();
  const rows = report?.top_products ?? [];
  const key = (p: { product_code: string | null; product_name: string }) =>
    `${p.product_code ?? ''}|${p.product_name}`;
  return (
    <Card id="report-products" title={t('admin.reports.products.title')}>
      {pending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>{t('admin.reports.empty')}</Empty>
      ) : (
        <>
          <ol className="flex flex-col divide-y divide-border md:hidden">
            {rows.map((p, i) => (
              <li key={key(p)} className="flex items-center gap-3 px-4 py-3">
                <span className="tabular w-6 shrink-0 text-right text-muted">{i + 1}</span>
                <span className="flex min-w-0 flex-1 flex-col">
                  <span lang="de" className="break-words font-semibold">
                    {p.product_code ? (
                      <span className="tabular text-muted">{p.product_code} </span>
                    ) : null}
                    {p.product_name}
                  </span>
                  <span className="text-muted">
                    {t('admin.reports.products.qtyCount', { count: p.qty })}
                  </span>
                </span>
                <span className="tabular shrink-0 font-semibold">{formatEuro(p.value_cents)}</span>
              </li>
            ))}
          </ol>
          <table className="hidden w-full md:table">
            <thead>
              <tr className="border-b border-border text-left text-xs text-muted">
                <th scope="col" className="w-12 px-4 py-2 text-right font-medium">
                  {t('admin.reports.products.rank')}
                </th>
                <th scope="col" className="w-16 px-2 py-2 font-medium">
                  {t('admin.reports.products.code')}
                </th>
                <th scope="col" className="px-2 py-2 font-medium">
                  {t('admin.reports.products.name')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('admin.reports.products.qty')}
                </th>
                <th scope="col" className="px-4 py-2 text-right font-medium">
                  {t('admin.reports.products.revenue')}
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p, i) => (
                <tr key={key(p)}>
                  <td className="tabular px-4 py-2 text-right text-muted">{i + 1}</td>
                  <td className="tabular px-2 py-2 text-muted">{p.product_code ?? '—'}</td>
                  <th scope="row" lang="de" className="px-2 py-2 text-left font-semibold">
                    {p.product_name}
                  </th>
                  <td className="tabular px-4 py-2 text-right">{p.qty}</td>
                  <td className="tabular px-4 py-2 text-right font-semibold">
                    {formatEuro(p.value_cents)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </Card>
  );
}

/**
 * Saatlik dağılım — yatay çubuk tablosu (dataviz). Tek seri, tek renk (`--lime`); çubuk ≤ 24 px,
 * uçta 4 px yuvarlak, taban kare. Kılavuz çizgileri eksen işaretleriyle aynı yerde, 1 px düz ve
 * yüzeyden bir ton açık. Grafiğin kendisi gerçek bir `<table>`: ekran okuyucu saat → sipariş
 * sayısını (ve payını) satır satır okur, ayrı bir "tablo görünümü"ne gerek kalmaz. Değer çubuğun
 * ucunda yazılı; üzerine gelince saat aralığı ve pay (%) ipucu olarak görünür — ipucu bilgiyi
 * kilitlemez, aynı bilgi tabloda zaten var.
 */
function HourChart({
  report,
  pending,
  dayStart,
  locale,
}: {
  report: ReportRange | undefined;
  pending: boolean;
  dayStart: number;
  locale: Locale;
}) {
  const { t } = useTranslation();
  const rows = hourRows(report?.by_hour ?? [], dayStart);
  const total = rows.reduce((sum, r) => sum + r.orders, 0);
  const axis = hourAxis(Math.max(0, ...rows.map((r) => r.orders)));
  const percent = new Intl.NumberFormat(locale === 'de' ? 'de-DE' : 'tr-TR', {
    style: 'percent',
    maximumFractionDigits: 0,
  });
  const pct = (value: number) => (value / axis.max) * 100;
  // Kılavuz: her işaret bir çizgi. Son çizgi (100 %) arka planın tekrarına düşmez, ayrıca çizilir.
  const grid = {
    backgroundImage: 'linear-gradient(to right, var(--color-border) 1px, transparent 1px)',
    backgroundSize: `${100 / (axis.ticks.length - 1)}% 100%`,
    backgroundRepeat: 'repeat-x',
  };

  return (
    <Card
      id="report-hours"
      title={t('admin.reports.hours.title')}
      subtitle={t('admin.reports.hours.subtitle')}
    >
      {pending ? (
        <Loading />
      ) : rows.length === 0 ? (
        <Empty>{t('admin.reports.empty')}</Empty>
      ) : (
        <div className="px-4 pb-4 pt-2">
          <table className="w-full border-collapse">
            <caption className="sr-only">{t('admin.reports.hours.caption')}</caption>
            <thead>
              <tr className="text-xs text-muted">
                <th scope="col" className="w-14 pb-2 pr-3 text-right font-medium">
                  {t('admin.reports.hours.hour')}
                </th>
                <th scope="col" className="pb-2 text-left font-medium">
                  {t('admin.reports.hours.orders')}
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const share = total > 0 ? percent.format(r.orders / total) : percent.format(0);
                const detail = t('admin.reports.hours.detail', {
                  from: hourLabel(r.hour),
                  to: hourLabel((r.hour + 1) % 24),
                  count: r.orders,
                  share,
                });
                return (
                  <tr key={r.hour} className="group">
                    <th
                      scope="row"
                      className="tabular w-14 pr-3 text-right font-normal text-muted group-hover:text-text"
                    >
                      {hourLabel(r.hour)}
                    </th>
                    <td className="pr-12">
                      <div className="relative h-8 border-r border-border" style={grid}>
                        <span
                          aria-hidden
                          className={clsx(
                            'absolute left-0 top-1/2 h-5 -translate-y-1/2 rounded-r-[4px] bg-lime',
                            'transition-[filter] duration-150 ease-out group-hover:brightness-125',
                          )}
                          style={{ width: `${pct(r.orders)}%` }}
                        />
                        <span
                          className={clsx(
                            'tabular absolute top-1/2 -translate-y-1/2 pl-2 font-semibold',
                            r.orders === 0 ? 'text-muted' : 'text-text',
                          )}
                          style={{ left: `${pct(r.orders)}%` }}
                        >
                          {r.orders}
                          {/* Pay (%) üzerine gelince görünür; ekran okuyucu onu satırda duyar. */}
                          <span className="sr-only"> · {share}</span>
                        </span>
                        <span
                          aria-hidden
                          className={clsx(
                            // Sağa yaslı: dar ekranda da kartın içinde kalır, sayfayı yana kaydırmaz.
                            'pointer-events-none absolute bottom-full right-0 z-10 mb-1 hidden whitespace-nowrap rounded-control border border-border bg-surface-2 px-3 py-1.5 text-xs shadow-[var(--shadow-overlay)]',
                            'group-hover:block',
                          )}
                        >
                          {detail}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot aria-hidden>
              <tr>
                <td />
                <td className="pr-12">
                  <div className="relative mt-1 h-5 text-xs text-muted">
                    {axis.ticks.map((tick) => (
                      <span
                        key={tick}
                        className="tabular absolute top-0 -translate-x-1/2"
                        style={{ left: `${pct(tick)}%` }}
                      >
                        {tick}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </Card>
  );
}
