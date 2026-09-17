import { useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminMenu, type AdminCategory } from '../../../data/adminMenu';
import { qk } from '../../../data/keys';
import { toast } from '../../../lib/toast';
import { Button } from '../../../ui/Button';
import { Spinner } from '../../../ui/Spinner';
import { upsertCategory } from './adminMenuApi';
import { MoveButtons, TextField, Toggle } from './fields';
import { reorder } from './menuAdminLogic';

interface CategoryDraft {
  key: string;
  id?: string;
  name_de: string;
  name_tr: string;
  name_en: string;
  name_ar: string;
  is_beverage: boolean;
  is_active: boolean;
}

const draftOf = (c: AdminCategory): CategoryDraft => ({
  key: c.id,
  id: c.id,
  name_de: c.name_de,
  name_tr: c.name_tr ?? '',
  name_en: c.name_en ?? '',
  name_ar: c.name_ar ?? '',
  is_beverage: c.is_beverage,
  is_active: c.is_active,
});

/**
 * Menü > Kategoriler. Sıra menüdeki okuma sırasıdır (garson ekranında sekmeler bu sırayla dizilir),
 * bu yüzden taşıma ve adlar aynı ekranda düzenlenir. Tek ana eylem: **Kaydet** — satır satır
 * kaydetmek 10 kategoride 10 ağ isteği ve 10 karar demekti.
 */
export function CategoriesPage() {
  const { t } = useTranslation();
  const { categories, isPending } = useAdminMenu();

  if (isPending) {
    return (
      <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
        <Spinner label={t('common.loading')} />
        <span>{t('common.loading')}</span>
      </p>
    );
  }

  // Sunucudaki liste değiştiğinde (başka bir admin kategori eklediğinde) taslaklar `key` ile
  // sıfırlanır. Efekt içinde `setState` çağırmak aynı sonucu verirdi ama her veri turunda
  // fazladan bir render doğururdu (react-hooks/set-state-in-effect).
  return <CategoryList key={categories.map((c) => c.id).join()} categories={categories} />;
}

function CategoryList({ categories }: { categories: AdminCategory[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<CategoryDraft[]>(() => categories.map(draftOf));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const patch = (key: string, fields: Partial<CategoryDraft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...fields } : d)));

  const move = (fromKey: string, toKey: string) => {
    const order = reorder(drafts.map((d) => ({ id: d.key })), fromKey, toKey);
    if (order.length === 0) return;
    const byKey = new Map(drafts.map((d) => [d.key, d]));
    setDrafts(order.map((o) => byKey.get(o.id)).filter((d): d is CategoryDraft => Boolean(d)));
  };

  const add = () =>
    setDrafts((list) => [
      ...list,
      {
        key: crypto.randomUUID(),
        name_de: '',
        name_tr: '',
        name_en: '',
        name_ar: '',
        is_beverage: false,
        is_active: true,
      },
    ]);

  const save = async () => {
    if (drafts.some((d) => !d.name_de.trim())) {
      setError(t('admin.menu.errors.nameRequired'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      for (const [i, d] of drafts.entries()) {
        await upsertCategory({
          id: d.id,
          name_de: d.name_de.trim(),
          name_tr: d.name_tr.trim() || null,
          name_en: d.name_en.trim() || null,
          name_ar: d.name_ar.trim() || null,
          is_beverage: d.is_beverage,
          is_active: d.is_active,
          sort: (i + 1) * 10,
        });
      }
      void queryClient.invalidateQueries({ queryKey: qk.menu });
      toast(t('admin.menu.saved'));
    } catch {
      setError(t('errors.unknown'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button variant="secondary" icon={<Plus aria-hidden size={18} />} onClick={add}>
          {t('admin.menu.categories.add')}
        </Button>
        <Button icon={<Save aria-hidden size={20} />} loading={saving} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </div>

      <p className="text-sm text-muted">{t('admin.menu.categories.qrNamesHint')}</p>

      {error ? (
        <p role="alert" className="rounded-card border border-danger/40 bg-danger/15 px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-3">
        {drafts.map((d, i) => (
          <li key={d.key} className="flex flex-col gap-2 rounded-card border border-border bg-surface p-3">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <TextField
                label={t('admin.menu.nameDe')}
                value={d.name_de}
                onChange={(name_de) => patch(d.key, { name_de })}
              />
              <TextField
                label={t('admin.menu.nameTr')}
                value={d.name_tr}
                onChange={(name_tr) => patch(d.key, { name_tr })}
              />
              <TextField
                label={t('admin.menu.nameEn')}
                value={d.name_en}
                lang="en"
                onChange={(name_en) => patch(d.key, { name_en })}
              />
              <TextField
                label={t('admin.menu.nameAr')}
                value={d.name_ar}
                lang="ar"
                dir="rtl"
                onChange={(name_ar) => patch(d.key, { name_ar })}
              />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-4">
                <Toggle
                  label={t('admin.menu.categories.isBeverage')}
                  checked={d.is_beverage}
                  onChange={(is_beverage) => patch(d.key, { is_beverage })}
                />
                <Toggle
                  label={t('admin.menu.isActive')}
                  checked={d.is_active}
                  onChange={(is_active) => patch(d.key, { is_active })}
                />
              </div>
              <MoveButtons
                disabledUp={i === 0}
                disabledDown={i === drafts.length - 1}
                onUp={() => move(d.key, drafts[i - 1]?.key ?? d.key)}
                onDown={() => move(d.key, drafts[i + 1]?.key ?? d.key)}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
