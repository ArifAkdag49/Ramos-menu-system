import { localTableName, type Locale } from '@ramos/shared';
import { useQueryClient } from '@tanstack/react-query';
import { CircleOff, Plus, Receipt, Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { saveTables, TablesApiError, useAdminTables } from '../../../data/adminTables';
import { qk } from '../../../data/keys';
import { useTableOverviewQuery } from '../../../data/tables';
import { toast } from '../../../lib/toast';
import { Badge } from '../../../ui/Badge';
import { Button } from '../../../ui/Button';
import { EmptyState } from '../../../ui/EmptyState';
import { Spinner } from '../../../ui/Spinner';
import { MoveButtons, TextField, Toggle } from '../menu/fields';
import { reorder } from '../menu/menuAdminLogic';
import {
  changedTables,
  suggestTableName,
  TABLE_NAME_MAX,
  tableNameError,
  type TableDraft,
  type TableRecord,
} from './tablesLogic';

/**
 * Admin > Masalar. Kategoriler ekranının kalıbı: taslak liste, yukarı/aşağı ile sıra, tek ana
 * eylem **Kaydet**. Sıra garsonun masa ızgarasındaki sıradır (`table_overview` `sort`'a göre dizer).
 *
 * Açık hesabı olan masa pasifleştirilemez: garson ekranından kaybolan bir masanın hesabı
 * kapatılamaz. Kontrol `table_overview`'dan gelir (Realtime `orders` olayıyla canlı kalır) ve
 * kaydetmeden hemen önce yeniden yapılır — anahtar kapatılırken açık olmayan masa o arada açılmış olabilir.
 */
export function TablesAdminPage() {
  const { t } = useTranslation();
  const tables = useAdminTables();

  if (tables.isPending) {
    return (
      <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
        <Spinner label={t('common.loading')} />
        <span>{t('common.loading')}</span>
      </p>
    );
  }

  const rows = tables.data ?? [];
  // Sunucudaki kimlik kümesi değişince (masa eklendi) taslaklar sıfırlanır — CategoriesPage ile aynı gerekçe.
  return <TableList key={rows.map((r) => r.id).join()} server={rows} />;
}

const draftOf = (r: TableRecord): TableDraft => ({
  key: r.id,
  id: r.id,
  name: r.name,
  is_active: r.is_active,
});

function TableList({ server }: { server: TableRecord[] }) {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';
  const queryClient = useQueryClient();
  const overview = useTableOverviewQuery();
  const [drafts, setDrafts] = useState<TableDraft[]>(() => server.map(draftOf));
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const openIds = new Set((overview.data ?? []).filter((r) => r.session_id).map((r) => r.table_id));

  const patch = (key: string, fields: Partial<TableDraft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...fields } : d)));

  const move = (fromKey: string, toKey: string) => {
    const order = reorder(
      drafts.map((d) => ({ id: d.key })),
      fromKey,
      toKey,
    );
    if (order.length === 0) return;
    const byKey = new Map(drafts.map((d) => [d.key, d]));
    setDrafts(order.map((o) => byKey.get(o.id)).filter((d): d is TableDraft => Boolean(d)));
  };

  const add = () =>
    setDrafts((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        name: suggestTableName(list.map((d) => d.name)),
        is_active: true,
      },
    ]);

  const fieldError = (d: TableDraft): string | null => {
    const key = tableNameError(d.name, d.key, drafts);
    return key ? t(`admin.tables.errors.${key}`) : null;
  };

  const save = async () => {
    setError(null);
    if (drafts.some((d) => tableNameError(d.name, d.key, drafts))) {
      setShowErrors(true);
      setError(t('admin.tables.errors.fix_fields'));
      return;
    }

    setSaving(true);
    try {
      // Pasifleşecek masalar için son durum: ekrandaki özet birkaç saniye eski olabilir.
      const fresh = (await overview.refetch()).data ?? overview.data ?? [];
      const busy = drafts.find(
        (d) =>
          d.id &&
          !d.is_active &&
          server.find((s) => s.id === d.id)?.is_active &&
          fresh.some((r) => r.table_id === d.id && r.session_id),
      );
      if (busy) {
        setError(
          t('admin.tables.errors.open_session', { table: localTableName(busy.name, locale) }),
        );
        patch(busy.key, { is_active: true });
        return;
      }

      const { inserts, updates } = changedTables(server, drafts);
      await saveTables(inserts, updates);
      toast(t('admin.tables.saved'), 'ready');
      setShowErrors(false);
    } catch (e) {
      setError(
        e instanceof TablesApiError && e.key === 'name_taken'
          ? t('admin.tables.errors.name_taken', { name: e.tableName ?? '' })
          : t('errors.unknown'),
      );
    } finally {
      setSaving(false);
      // Başarıda da hatada da sunucu gerçeğine dön: yarıda kalan bir kayıtta ilk satırlar yazılmış olabilir.
      void queryClient.invalidateQueries({ queryKey: qk.tables });
    }
  };

  const activeCount = drafts.filter((d) => d.is_active).length;

  return (
    <div className="mx-auto flex max-w-[900px] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h1 className="text-2xl font-semibold">{t('admin.tables.title')}</h1>
          <p className="text-muted">
            {t('admin.tables.activeCount', { count: activeCount })} · {t('admin.tables.nameHint')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" icon={<Plus aria-hidden size={18} />} onClick={add}>
            {t('admin.tables.add')}
          </Button>
          <Button
            icon={<Save aria-hidden size={20} />}
            loading={saving}
            onClick={() => void save()}
          >
            {t('common.save')}
          </Button>
        </div>
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-card border border-danger/40 bg-danger/15 px-3 py-2 text-sm text-danger-ink"
        >
          {error}
        </p>
      ) : null}

      {drafts.length === 0 ? (
        <EmptyState
          title={t('admin.tables.empty')}
          action={
            <Button variant="secondary" icon={<Plus aria-hidden size={18} />} onClick={add}>
              {t('admin.tables.add')}
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {drafts.map((d, i) => {
            const isOpen = !!d.id && openIds.has(d.id);
            // Açık masa yalnız **kapatılamaz**; zaten pasif bir masayı açmak her zaman serbest.
            const lockActive = isOpen && d.is_active;
            // Yerleşim: telefonda 1. satır ad + sıra düğmeleri, 2. satır anahtar + rozet; geniş
            // ekranda tek satır ve sabit genişlikli sütunlar (rozeti olan/olmayan satırda ad alanı
            // aynı kalır). `sm:contents` telefon sarmalayıcısını geniş ekranda ızgaradan kaldırır.
            // Üst boşluk alan etiketinin yüksekliğidir (12 px yazı + 6 px aralık): ad altında hata
            // çıksa da hiza bozulmaz.
            return (
              <li
                key={d.key}
                className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-1 rounded-card border border-border bg-surface p-3 sm:grid-cols-[minmax(0,1fr)_13rem_10rem_auto] sm:gap-x-4"
              >
                <div className="col-start-1 row-start-1 min-w-0">
                  <TextField
                    label={t('admin.tables.name')}
                    value={d.name}
                    maxLength={TABLE_NAME_MAX}
                    onChange={(name) => patch(d.key, { name })}
                    error={showErrors ? fieldError(d) : null}
                  />
                </div>
                <div className="col-start-2 row-start-1 pt-[1.375rem] sm:col-start-4">
                  <MoveButtons
                    disabledUp={i === 0}
                    disabledDown={i === drafts.length - 1}
                    onUp={() => move(d.key, drafts[i - 1]?.key ?? d.key)}
                    onDown={() => move(d.key, drafts[i + 1]?.key ?? d.key)}
                  />
                </div>
                <div className="col-span-2 row-start-2 flex flex-wrap items-center gap-x-4 sm:contents">
                  <div className="min-w-0 sm:col-start-2 sm:row-start-1 sm:pt-[1.375rem]">
                    <Toggle
                      label={t('admin.tables.isActive')}
                      checked={d.is_active}
                      disabled={lockActive}
                      hint={lockActive ? t('admin.tables.openSessionHint') : undefined}
                      onChange={(is_active) => patch(d.key, { is_active })}
                    />
                  </div>
                  <div className="sm:col-start-3 sm:row-start-1 sm:pt-[1.375rem]">
                    <div className="flex min-h-12 items-center">
                      {isOpen ? (
                        <Badge tone="open" icon={<Receipt aria-hidden size={14} />}>
                          {t('admin.tables.openSession')}
                        </Badge>
                      ) : !d.is_active ? (
                        <Badge tone="empty" icon={<CircleOff aria-hidden size={14} />}>
                          {t('admin.tables.inactive')}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
