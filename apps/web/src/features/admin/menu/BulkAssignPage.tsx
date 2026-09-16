import { useQueryClient } from '@tanstack/react-query';
import { Layers, Link2Off } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { byAdminOrder, useAdminMenu } from '../../../data/adminMenu';
import { qk } from '../../../data/keys';
import { toast } from '../../../lib/toast';
import { Button } from '../../../ui/Button';
import { Chip } from '../../../ui/Chip';
import { Spinner } from '../../../ui/Spinner';
import { bulkAssignGroup, bulkAssignIngredients, unassignGroup } from './adminMenuApi';
import { Section, SelectField } from './fields';

const ALL = 'all';
type Target = 'ingredients' | 'group';

/**
 * Menü > Toplu atama. "Bütün dürümlere soğan ekle" işi tek tek 30 ürün açmayı gerektirmesin diye
 * var. Yazma `ignoreDuplicates` ile yapılır: zaten bağlı olan ürün hata vermez, sessizce atlanır —
 * seçimi tekrar uygulamak güvenlidir.
 */
export function BulkAssignPage() {
  const { t, i18n } = useTranslation();
  const isTr = i18n.language !== 'de';
  const queryClient = useQueryClient();
  const { categories, products, ingredients, groups, isPending } = useAdminMenu();

  const [categoryId, setCategoryId] = useState<string>(ALL);
  const [selected, setSelected] = useState<string[]>([]);
  const [target, setTarget] = useState<Target>('ingredients');
  const [ingredientIds, setIngredientIds] = useState<string[]>([]);
  const [groupId, setGroupId] = useState<string>('');
  const [busy, setBusy] = useState(false);

  const visible = useMemo(
    () =>
      (categoryId === ALL ? products : products.filter((p) => p.category_id === categoryId))
        .slice()
        .sort(byAdminOrder),
    [products, categoryId],
  );

  const visibleIds = visible.map((p) => p.id);
  const chosen = selected.filter((id) => visibleIds.includes(id));
  const allChosen = chosen.length === visible.length && visible.length > 0;

  const apply = async (mode: 'assign' | 'unassign') => {
    setBusy(true);
    try {
      let affected = 0;
      if (target === 'ingredients') {
        affected = await bulkAssignIngredients(chosen, ingredientIds);
      } else if (groupId) {
        affected = mode === 'assign' ? await bulkAssignGroup(chosen, groupId) : await unassignGroup(chosen, groupId);
      }
      void queryClient.invalidateQueries({ queryKey: qk.menu });
      toast(t('admin.menu.bulk.done', { count: affected }));
    } catch {
      toast(t('errors.unknown'), 'danger');
    } finally {
      setBusy(false);
    }
  };

  const canApply =
    chosen.length > 0 && (target === 'ingredients' ? ingredientIds.length > 0 : groupId !== '');

  if (isPending) {
    return (
      <p className="flex items-center justify-center gap-2 px-4 py-10 text-muted">
        <Spinner label={t('common.loading')} />
        <span>{t('common.loading')}</span>
      </p>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Section
        title={t('admin.menu.bulk.step1')}
        action={
          <Button
            variant="ghost"
            onClick={() => setSelected(allChosen ? [] : visibleIds)}
            disabled={visible.length === 0}
          >
            {allChosen ? t('admin.menu.bulk.clearAll') : t('admin.menu.bulk.selectAll')}
          </Button>
        }
      >
        <SelectField
          label={t('admin.menu.category')}
          value={categoryId}
          onChange={setCategoryId}
          options={[
            { value: ALL, label: t('admin.menu.products.allCategories') },
            ...categories.map((c) => ({ value: c.id, label: isTr && c.name_tr ? c.name_tr : c.name_de })),
          ]}
        />
        <ul className="max-h-96 overflow-y-auto rounded-control border border-border bg-surface-2">
          {visible.map((p) => (
            <li key={p.id}>
              <label className="flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5 hover:bg-surface">
                <input
                  type="checkbox"
                  checked={selected.includes(p.id)}
                  onChange={(e) =>
                    setSelected((s) => (e.target.checked ? [...s, p.id] : s.filter((x) => x !== p.id)))
                  }
                  className="size-5 shrink-0 accent-[var(--lime)]"
                />
                <span className="tabular w-10 shrink-0 text-xs text-muted">{p.code ?? '—'}</span>
                <span className="min-w-0 truncate text-sm">{p.name}</span>
              </label>
            </li>
          ))}
        </ul>
        <p className="text-xs text-muted">{t('admin.menu.bulk.selectedCount', { count: chosen.length })}</p>
      </Section>

      <div className="flex flex-col gap-4">
        <Section title={t('admin.menu.bulk.step2')}>
          <div className="flex flex-wrap gap-2">
            <Chip selected={target === 'ingredients'} onClick={() => setTarget('ingredients')}>
              {t('admin.menu.bulk.targetIngredients')}
            </Chip>
            <Chip selected={target === 'group'} onClick={() => setTarget('group')}>
              {t('admin.menu.bulk.targetGroup')}
            </Chip>
          </div>

          {target === 'ingredients' ? (
            <div className="flex flex-wrap gap-2">
              {ingredients
                .filter((i) => i.is_active)
                .map((i) => (
                  <Chip
                    key={i.id}
                    selected={ingredientIds.includes(i.id)}
                    onClick={() =>
                      setIngredientIds((s) => (s.includes(i.id) ? s.filter((x) => x !== i.id) : [...s, i.id]))
                    }
                  >
                    {isTr && i.name_tr ? i.name_tr : i.name_de}
                  </Chip>
                ))}
            </div>
          ) : (
            <SelectField
              label={t('admin.menu.bulk.targetGroup')}
              value={groupId}
              onChange={setGroupId}
              options={[
                { value: '', label: t('common.select') },
                ...groups.filter((g) => g.is_active).map((g) => ({ value: g.id, label: g.admin_label || g.name_de })),
              ]}
            />
          )}
        </Section>

        <Section title={t('admin.menu.bulk.step3')}>
          <Button
            size="lg"
            fullWidth
            icon={<Layers aria-hidden size={20} />}
            loading={busy}
            disabled={!canApply}
            onClick={() => void apply('assign')}
          >
            {t('admin.menu.bulk.apply')}
          </Button>
          {target === 'group' ? (
            <Button
              variant="ghost"
              icon={<Link2Off aria-hidden size={18} />}
              disabled={busy || !canApply}
              onClick={() => void apply('unassign')}
            >
              {t('admin.menu.bulk.unassign')}
            </Button>
          ) : null}
          <p className="text-xs text-muted">{t('admin.menu.bulk.applyHint')}</p>
        </Section>
      </div>
    </div>
  );
}
