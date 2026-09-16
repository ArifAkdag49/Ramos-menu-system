import { useQueryClient } from '@tanstack/react-query';
import { Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAdminMenu, usageCounts, type AdminIngredient, type AdminProduct } from '../../../data/adminMenu';
import { qk } from '../../../data/keys';
import { toast } from '../../../lib/toast';
import { Button } from '../../../ui/Button';
import { Spinner } from '../../../ui/Spinner';
import { upsertIngredient } from './adminMenuApi';
import { TextField, Toggle } from './fields';

interface IngredientDraft {
  key: string;
  id?: string;
  name_de: string;
  name_tr: string;
  is_active: boolean;
}

const draftOf = (i: AdminIngredient): IngredientDraft => ({
  key: i.id,
  id: i.id,
  name_de: i.name_de,
  name_tr: i.name_tr ?? '',
  is_active: i.is_active,
});

/**
 * Menü > Malzemeler. "Kaç üründe kullanılıyor" sayısı ayrı bir sorgu değil, elimizdeki ürün
 * ağacından sayılır — pasifleştirmeden önce etkiyi görmek için orada durur. Malzeme **silinmez**:
 * `product_ingredients` FK'si `on delete restrict`, üstelik geçmiş siparişlerin "OHNE" satırları
 * bu adlara dayanır.
 */
export function IngredientsPage() {
  const { t } = useTranslation();
  const { ingredients, products, isPending } = useAdminMenu();

  if (isPending) {
    return (
      <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
        <Spinner label={t('common.loading')} />
        <span>{t('common.loading')}</span>
      </p>
    );
  }

  // Taslaklar sunucu listesi değişince `key` ile sıfırlanır (bkz. CategoriesPage).
  return (
    <IngredientList
      key={ingredients.map((i) => i.id).join()}
      ingredients={ingredients}
      products={products}
    />
  );
}

function IngredientList({
  ingredients,
  products,
}: {
  ingredients: AdminIngredient[];
  products: AdminProduct[];
}) {
  const { t, i18n } = useTranslation();
  const isTr = i18n.language !== 'de';
  const queryClient = useQueryClient();
  const [drafts, setDrafts] = useState<IngredientDraft[]>(() => ingredients.map(draftOf));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const counts = useMemo(() => usageCounts(products).ingredients, [products]);

  const patch = (key: string, fields: Partial<IngredientDraft>) =>
    setDrafts((list) => list.map((d) => (d.key === key ? { ...d, ...fields } : d)));

  const save = async () => {
    if (drafts.some((d) => !d.name_de.trim())) {
      setError(t('admin.menu.errors.nameRequired'));
      return;
    }
    setError(null);
    setSaving(true);
    try {
      for (const d of drafts) {
        await upsertIngredient({
          id: d.id,
          name_de: d.name_de.trim(),
          name_tr: d.name_tr.trim() || null,
          is_active: d.is_active,
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
        <Button
          variant="secondary"
          icon={<Plus aria-hidden size={18} />}
          onClick={() =>
            setDrafts((list) => [
              ...list,
              { key: crypto.randomUUID(), name_de: '', name_tr: '', is_active: true },
            ])
          }
        >
          {t('admin.menu.ingredients.add')}
        </Button>
        <Button icon={<Save aria-hidden size={20} />} loading={saving} onClick={() => void save()}>
          {t('common.save')}
        </Button>
      </div>

      {error ? (
        <p role="alert" className="rounded-card border border-danger/40 bg-danger/15 px-3 py-2 text-sm text-danger-ink">
          {error}
        </p>
      ) : null}

      <ul className="flex flex-col gap-2">
        {drafts.map((d) => (
          <li
            key={d.key}
            className="grid gap-3 rounded-card border border-border bg-surface p-3 sm:grid-cols-[1fr_1fr_auto_auto] sm:items-end"
          >
            <TextField label={t('admin.menu.nameDe')} value={d.name_de} onChange={(name_de) => patch(d.key, { name_de })} />
            <TextField label={t('admin.menu.nameTr')} value={d.name_tr} onChange={(name_tr) => patch(d.key, { name_tr })} />
            <p className="pb-3 text-xs text-muted">
              {t('admin.menu.usedIn', { count: d.id ? (counts.get(d.id) ?? 0) : 0 })}
            </p>
            <Toggle label={t('admin.menu.isActive')} checked={d.is_active} onChange={(is_active) => patch(d.key, { is_active })} />
            {isTr && !d.name_tr ? (
              <p className="text-xs text-muted sm:col-span-4">{t('admin.menu.ingredients.trMissing')}</p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
