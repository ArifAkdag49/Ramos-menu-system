import type { Locale } from '@ramos/shared';
import { AlertTriangle, CalendarDays, ChevronDown, ChevronUp, ScrollText } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuditLog, type AuditLogEntry, type AuditLogFilter } from '../../data/audit';
import { useStaffNames } from '../../data/staff';
import { Banner } from '../../ui/Banner';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Spinner } from '../../ui/Spinner';
import {
  AUDIT_ACTIONS,
  AUDIT_ENTITIES,
  auditLabelKeys,
  auditSummary,
  isRowAction,
  type AuditSummaryContext,
} from './auditLogic';
import { businessDate, dateRangeError } from './dashboardLogic';
import { SelectField, TextField } from './menu/fields';
import { formatDateTime } from './orders/orderView';

const FIELD_KEY = {
  name: 'admin.audit.fields.name',
  name_de: 'admin.audit.fields.name_de',
  name_tr: 'admin.audit.fields.name_tr',
  sort: 'admin.audit.fields.sort',
  is_active: 'admin.audit.fields.is_active',
  is_sold_out: 'admin.audit.fields.is_sold_out',
  base_price_cents: 'admin.audit.fields.base_price_cents',
  price_cents: 'admin.audit.fields.price_cents',
  price_delta_cents: 'admin.audit.fields.price_delta_cents',
  code: 'admin.audit.fields.code',
  image_path: 'admin.audit.fields.image_path',
  description: 'admin.audit.fields.description',
  allergens: 'admin.audit.fields.allergens',
  category_id: 'admin.audit.fields.category_id',
  archived_at: 'admin.audit.fields.archived_at',
  is_default: 'admin.audit.fields.is_default',
  cancel_reasons: 'admin.audit.fields.cancel_reasons',
  quick_notes: 'admin.audit.fields.quick_notes',
} as const;

const ROLE_KEY = {
  admin: 'roles.admin',
  waiter: 'roles.waiter',
  kitchen: 'roles.kitchen',
  printer: 'roles.printer',
} as const;

/**
 * Admin > Denetim kaydı. Kim, ne zaman, neyi değiştirdi — satırın özeti tek bakışta okunur,
 * ayrıntının tamamı (tetikleyicinin eski/yeni satır görüntüsü ya da RPC'nin yazdığı bilgi) satır
 * açılınca JSON olarak görünür. Telefonda tablo yok: aynı satır dar ekranda alt alta dizilir.
 */
export function AuditLogPage() {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';
  const [today] = useState(() => businessDate(new Date()));
  const [form, setForm] = useState<AuditLogFilter>({
    from: today,
    to: today,
    action: '',
    entity: '',
  });
  const [page, setPage] = useState(1);
  const staffNames = useStaffNames();

  const rangeError = dateRangeError(form.from, form.to);
  const filter: AuditLogFilter | null = rangeError
    ? null
    : {
        from: form.from,
        to: form.to,
        ...(form.action ? { action: form.action } : {}),
        ...(form.entity ? { entity: form.entity } : {}),
      };
  const { entries, hasMore, isPending, isFetching, isError } = useAuditLog(filter, page);

  const update = (patch: Partial<AuditLogFilter>) => {
    setForm((f) => ({ ...f, ...patch }));
    setPage(1);
  };

  const ctx: AuditSummaryContext = {
    locale,
    staffName: (id) => staffNames.get(id),
    roleName: (role) => (role in ROLE_KEY ? t(ROLE_KEY[role as keyof typeof ROLE_KEY]) : role),
    fieldName: (field) =>
      field in FIELD_KEY ? t(FIELD_KEY[field as keyof typeof FIELD_KEY]) : field,
  };

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4">
      <h1 className="text-2xl font-semibold">{t('admin.audit.title')}</h1>

      <section
        aria-label={t('admin.audit.filters.label')}
        className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4"
      >
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <TextField
            type="date"
            label={t('admin.range.from')}
            value={form.from}
            onChange={(from) => update({ from })}
          />
          <TextField
            type="date"
            label={t('admin.range.to')}
            value={form.to}
            onChange={(to) => update({ to })}
          />
          <SelectField
            className="col-span-2 sm:col-span-1"
            label={t('admin.audit.filters.action')}
            value={form.action ?? ''}
            onChange={(action) => update({ action })}
            options={[
              { value: '', label: t('admin.audit.filters.allActions') },
              ...AUDIT_ACTIONS.map((a) => {
                const keys = auditLabelKeys({ action: a, entity: '' });
                // Satır işlemleri ("{{entity}} ekledi") süzgeçte varlıksız okunur: "… ekledi".
                const label = keys.action ? t(keys.action, { entity: '…' }) : a;
                return { value: a, label };
              }),
            ]}
          />
          <SelectField
            className="col-span-2 sm:col-span-1"
            label={t('admin.audit.filters.entity')}
            value={form.entity ?? ''}
            onChange={(entity) => update({ entity })}
            options={[
              { value: '', label: t('admin.audit.filters.allEntities') },
              ...AUDIT_ENTITIES.map((e) => {
                const keys = auditLabelKeys({ action: '', entity: e });
                return { value: e, label: keys.entity ? t(keys.entity) : e };
              }),
            ]}
          />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          {rangeError ? (
            <p role="alert" className="text-sm text-danger-ink">
              {t(`admin.range.errors.${rangeError}`)}
            </p>
          ) : (
            <p className="text-xs text-muted">{t('admin.range.note')}</p>
          )}
          {form.from !== today || form.to !== today ? (
            <Button
              variant="ghost"
              className="px-3"
              icon={<CalendarDays aria-hidden size={18} />}
              onClick={() => update({ from: today, to: today })}
            >
              {t('admin.range.today')}
            </Button>
          ) : null}
        </div>
      </section>

      {rangeError ? null : isPending ? (
        <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
          <Spinner label={t('common.loading')} />
          <span>{t('common.loading')}</span>
        </p>
      ) : isError ? (
        <Banner tone="danger" icon={<AlertTriangle aria-hidden size={20} />}>
          {t('admin.audit.loadError')}
        </Banner>
      ) : entries.length === 0 ? (
        <EmptyState icon={<ScrollText aria-hidden size={32} />} title={t('admin.audit.empty')} />
      ) : (
        <section className="rounded-card border border-border bg-surface">
          {/* Sütun başlıkları yalnız geniş ekranda; telefonda satır kendi içinde alt alta okunur. */}
          <div
            aria-hidden
            className="hidden border-b border-border px-4 py-2 text-xs text-muted md:grid md:grid-cols-[10.5rem_11rem_minmax(0,1fr)_auto] md:gap-x-4"
          >
            <span>{t('admin.audit.columns.time')}</span>
            <span>{t('admin.audit.columns.actor')}</span>
            <span>{t('admin.audit.columns.action')}</span>
            <span className="sr-only">{t('admin.audit.columns.detail')}</span>
          </div>
          <ol className="flex flex-col divide-y divide-border">
            {entries.map((e) => (
              <AuditRow key={e.id} entry={e} ctx={ctx} />
            ))}
          </ol>
          {hasMore || isFetching ? (
            <div className="flex justify-center border-t border-border p-3">
              {hasMore ? (
                <Button
                  variant="secondary"
                  fullWidth
                  loading={isFetching}
                  icon={<ChevronDown aria-hidden size={18} />}
                  onClick={() => setPage((p) => p + 1)}
                >
                  {t('admin.orders.more')}
                </Button>
              ) : (
                <Spinner label={t('common.loading')} />
              )}
            </div>
          ) : null}
        </section>
      )}
    </div>
  );
}

function AuditRow({ entry, ctx }: { entry: AuditLogEntry; ctx: AuditSummaryContext }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const keys = auditLabelKeys(entry);
  const entityLabel = keys.entity ? t(keys.entity) : entry.entity;
  const actionLabel = keys.action
    ? isRowAction(entry.action)
      ? t(keys.action, { entity: entityLabel })
      : t(keys.action)
    : entry.action;
  const summary = auditSummary(entry, ctx);
  const actor = entry.actor_id
    ? (ctx.staffName(entry.actor_id) ?? entry.actor_id.slice(0, 8))
    : t('admin.audit.system');

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="grid gap-x-4 gap-y-1 md:grid-cols-[10.5rem_11rem_minmax(0,1fr)_auto] md:items-center">
        <time dateTime={entry.at} className="tabular text-muted">
          {formatDateTime(entry.at)}
        </time>
        <span className="min-w-0 break-words font-medium">{actor}</span>
        <span className="min-w-0">
          <span className="block break-words">{actionLabel}</span>
          <span className="block break-words text-muted">
            {isRowAction(entry.action) ? null : (
              <>
                {entityLabel}
                {summary ? ' · ' : ''}
              </>
            )}
            {summary}
          </span>
        </span>
        <Button
          variant="ghost"
          className="justify-self-start px-2 md:justify-self-end"
          aria-expanded={open}
          icon={open ? <ChevronUp aria-hidden size={18} /> : <ChevronDown aria-hidden size={18} />}
          onClick={() => setOpen((v) => !v)}
        >
          {open ? t('admin.audit.hideDetails') : t('admin.audit.showDetails')}
        </Button>
      </div>
      {open ? (
        <pre className="max-h-96 overflow-y-auto whitespace-pre-wrap break-all rounded-control border border-border bg-surface-2 p-3 font-mono text-xs leading-relaxed">
          {JSON.stringify(
            { entity: entry.entity, entity_id: entry.entity_id, details: entry.details },
            null,
            2,
          )}
        </pre>
      ) : null}
    </li>
  );
}
