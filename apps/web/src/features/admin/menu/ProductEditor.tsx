import type { MenuProduct } from '@ramos/shared';
import { Archive, Copy, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { AdminCategory, AdminIngredient, AdminOptionGroup, AdminProduct } from '../../../data/adminMenu';
import { Button } from '../../../ui/Button';
import { Chip } from '../../../ui/Chip';
import { Sheet } from '../../../ui/Sheet';
import {
  archiveProduct,
  duplicateProduct,
  MenuApiError,
  saveVariants,
  setProductGroups,
  setProductIngredients,
  upsertProduct,
  type VariantInput,
} from './adminMenuApi';
import { MoveButtons, Section, SelectField, TextArea, TextField, Toggle } from './fields';
import { reorder, type AllergenEntry } from './menuAdminLogic';
import { centsToInput, parseEuroInput } from './money';
import { ProductImageField } from './ProductImageField';
import { TicketPreview } from './TicketPreview';
import { VariantsEditor, type VariantDraft } from './VariantsEditor';

interface Form {
  code: string;
  name: string;
  description: string;
  category_id: string;
  basePriceInput: string;
  allergens: string[];
  is_active: boolean;
  is_sold_out: boolean;
  variants: VariantDraft[];
  ingredientIds: string[];
  groupIds: string[];
  image_path: string | null;
}

const draftsFrom = (product: AdminProduct | null): VariantDraft[] =>
  (product?.product_variants ?? [])
    .slice()
    .sort((a, b) => a.sort - b.sort)
    .map((v) => ({
      key: v.id,
      id: v.id,
      name_de: v.name_de,
      name_tr: v.name_tr ?? '',
      priceInput: centsToInput(v.price_cents),
      is_default: v.is_default,
      is_active: v.is_active,
    }));

function formFrom(product: AdminProduct | null, fallbackCategoryId: string): Form {
  return {
    code: product?.code ?? '',
    name: product?.name ?? '',
    description: product?.description ?? '',
    category_id: product?.category_id ?? fallbackCategoryId,
    basePriceInput: product?.base_price_cents != null ? centsToInput(product.base_price_cents) : '',
    allergens: (product?.allergens ?? '').split(',').map((s) => s.trim()).filter(Boolean),
    is_active: product?.is_active ?? true,
    is_sold_out: product?.is_sold_out ?? false,
    variants: draftsFrom(product),
    ingredientIds: (product?.product_ingredients ?? [])
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((pi) => pi.ingredients.id),
    groupIds: (product?.product_option_groups ?? [])
      .slice()
      .sort((a, b) => a.sort - b.sort)
      .map((pg) => pg.option_groups.id),
    image_path: product?.image_path ?? null,
  };
}

/**
 * Ürün editörü — listedeki satıra dokununca sağdan açılan çekmece (masaüstü öncelikli, telefonda
 * tam ekran). Tek ana eylem **Kaydet**tir; Kopyala ve Arşivle alt tarafta, ayrı ve sessiz durur
 * (BUILD-PROMPT §10.1).
 *
 * Kaydetme sırası kasıtlı: önce ürün satırı (yeni üründe `id` buradan gelir), sonra varyantlar,
 * en son bağlantılar. Ürün numarası çakışırsa (`23505`) hiçbir bağlantı yazılmamış olur.
 *
 * Form durumu yalnız ilk render'da kurulur; başka bir ürüne geçildiğinde çağıran taraf `key` ile
 * bileşeni yeniden doğurur (React'in "duruma anahtarla sıfırla" kalıbı). Efekt içinde `setState`
 * çağırmak aynı işi yapardı ama her ürün değişiminde fazladan bir render turu doğururdu.
 */
export function ProductEditor({
  product,
  categories,
  ingredients,
  groups,
  allergenLegend,
  open,
  onClose,
  onSaved,
}: {
  product: AdminProduct | null;
  categories: AdminCategory[];
  ingredients: AdminIngredient[];
  groups: AdminOptionGroup[];
  allergenLegend: AllergenEntry[];
  open: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}) {
  const { t, i18n } = useTranslation();
  const isTr = i18n.language !== 'de';
  const [form, setForm] = useState<Form>(() => formFrom(product, categories[0]?.id ?? ''));
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [saving, setSaving] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const patch = (fields: Partial<Form>) => setForm((f) => ({ ...f, ...fields }));
  const activeVariants = form.variants.filter((v) => v.is_active);
  const hasVariants = activeVariants.length > 0;
  const category = categories.find((c) => c.id === form.category_id);

  const previewProduct = useMemo<MenuProduct>(
    () => buildPreviewProduct(form, product, ingredients, groups),
    [form, product, ingredients, groups],
  );

  const validate = (): Record<string, string> | null => {
    const found: Record<string, string> = {};
    if (!form.name.trim()) found.name = t('admin.menu.errors.nameRequired');
    if (!form.category_id) found.category = t('admin.menu.errors.categoryRequired');

    if (hasVariants) {
      for (const v of activeVariants) {
        if (!v.name_de.trim()) found[`${v.key}:name`] = t('admin.menu.errors.nameRequired');
        if (parseEuroInput(v.priceInput) === null) found[`${v.key}:price`] = t('admin.menu.errors.priceInvalid');
      }
    } else if (parseEuroInput(form.basePriceInput) === null) {
      found.basePrice = t('admin.menu.errors.priceInvalid');
    }
    return Object.keys(found).length > 0 ? found : null;
  };

  const handleSave = async () => {
    const problems = validate();
    if (problems) {
      setErrors(problems);
      return;
    }
    setErrors({});
    setSaving(true);
    try {
      const id = await upsertProduct({
        id: product?.id,
        category_id: form.category_id,
        code: form.code.trim() || null,
        name: form.name.trim(),
        description: form.description.trim() || null,
        // Varyantlı üründe taban fiyat **null** olmalıdır: iki fiyat kaynağı kalırsa hangisinin
        // geçerli olduğu belirsizleşir ve garson ekranında yanlış tutar çıkar.
        base_price_cents: hasVariants ? null : parseEuroInput(form.basePriceInput),
        allergens: form.allergens.length > 0 ? form.allergens.join(',') : null,
        is_active: form.is_active,
        is_sold_out: form.is_sold_out,
        sort: product?.sort ?? 0,
      });

      if (form.variants.length > 0) {
        const rows: VariantInput[] = form.variants.map((v, i) => ({
          id: v.id,
          name_de: v.name_de.trim(),
          name_tr: v.name_tr.trim() || null,
          price_cents: parseEuroInput(v.priceInput) ?? 0,
          is_default: v.is_default,
          sort: (i + 1) * 10,
          is_active: v.is_active,
        }));
        await saveVariants(id, rows);
      }
      await setProductIngredients(id, form.ingredientIds);
      await setProductGroups(id, form.groupIds);

      onSaved(t('admin.menu.saved'));
    } catch (e) {
      const problem = errorFor(e);
      setErrors({ [problem.field]: t(problem.key) });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicate = async () => {
    if (!product) return;
    setSaving(true);
    try {
      await duplicateProduct(product);
      onSaved(t('admin.menu.duplicated'));
    } catch (e) {
      const problem = errorFor(e);
      setErrors({ [problem.field]: t(problem.key) });
    } finally {
      setSaving(false);
    }
  };

  const handleArchive = async () => {
    if (!product) return;
    setSaving(true);
    try {
      await archiveProduct(product.id);
      onSaved(t('admin.menu.archived'));
    } catch (e) {
      const problem = errorFor(e);
      setErrors({ [problem.field]: t(problem.key) });
    } finally {
      setSaving(false);
    }
  };

  const moveInList = (list: string[], fromId: string, toId: string): string[] => {
    const order = reorder(list.map((id) => ({ id })), fromId, toId);
    return order.length > 0 ? order.map((o) => o.id) : list;
  };

  return (
    <Sheet
      open={open}
      side="right"
      busy={saving}
      onClose={onClose}
      title={product ? product.name : t('admin.menu.products.new')}
      closeLabel={t('common.close')}
      footer={
        <Button fullWidth size="lg" icon={<Save aria-hidden size={20} />} loading={saving} onClick={() => void handleSave()}>
          {t('common.save')}
        </Button>
      }
    >
      <div className="flex flex-col gap-4 pb-4">
        {errors.form ? (
          <p role="alert" className="rounded-card border border-danger/40 bg-danger/15 px-3 py-2 text-sm text-danger-ink">
            {errors.form}
          </p>
        ) : null}

        <Section title={t('admin.menu.sections.basics')}>
          <div className="grid gap-3 sm:grid-cols-[8rem_1fr]">
            <TextField
              label={t('admin.menu.code')}
              value={form.code}
              error={errors.code}
              maxLength={8}
              placeholder="05"
              inputClassName="tabular"
              onChange={(code) => patch({ code })}
            />
            <TextField
              label={t('admin.menu.productName')}
              value={form.name}
              error={errors.name}
              onChange={(name) => patch({ name })}
            />
          </div>
          <TextArea
            label={t('admin.menu.description')}
            value={form.description}
            onChange={(description) => patch({ description })}
          />
          <SelectField
            label={t('admin.menu.category')}
            value={form.category_id}
            onChange={(category_id) => patch({ category_id })}
            options={categories.map((c) => ({ value: c.id, label: isTr && c.name_tr ? c.name_tr : c.name_de }))}
          />
        </Section>

        <Section title={t('admin.menu.sections.price')}>
          {hasVariants ? (
            <p className="text-xs text-muted">{t('admin.menu.variants.basePriceHidden')}</p>
          ) : (
            <TextField
              label={t('admin.menu.basePrice')}
              value={form.basePriceInput}
              error={errors.basePrice}
              placeholder="7,50"
              inputClassName="tabular"
              hint={t('admin.menu.priceHint')}
              onChange={(basePriceInput) => patch({ basePriceInput })}
            />
          )}
          <VariantsEditor
            variants={form.variants}
            errors={errors}
            onChange={(variants) => patch({ variants })}
          />
        </Section>

        <Section title={t('admin.menu.sections.image')}>
          {product ? (
            <ProductImageField
              product={{ id: product.id, code: product.code, image_path: form.image_path }}
              onChanged={(image_path) => patch({ image_path })}
            />
          ) : (
            <p className="text-xs text-muted">{t('admin.menu.image.saveFirst')}</p>
          )}
        </Section>

        <Section title={t('admin.menu.sections.allergens')}>
          <div className="flex flex-wrap gap-2">
            {allergenLegend.map((a) => {
              const selected = form.allergens.includes(a.code);
              return (
                <Chip
                  key={a.code}
                  selected={selected}
                  onClick={() =>
                    patch({
                      allergens: selected
                        ? form.allergens.filter((c) => c !== a.code)
                        : [...form.allergens, a.code],
                    })
                  }
                >
                  <span className="tabular font-semibold">{a.code}</span>
                  <span className="ml-1 text-xs text-muted">{isTr ? a.tr : a.de}</span>
                </Chip>
              );
            })}
          </div>
          <p className="tabular text-xs text-muted">
            {form.allergens.length > 0 ? form.allergens.join(',') : t('admin.menu.allergens.none')}
          </p>
        </Section>

        <Section title={t('admin.menu.sections.ingredients')}>
          <PickList
            all={ingredients.filter((i) => i.is_active).map((i) => ({ id: i.id, label: isTr && i.name_tr ? i.name_tr : i.name_de }))}
            selected={form.ingredientIds}
            onChange={(ingredientIds) => patch({ ingredientIds })}
            onMove={(from, to) => patch({ ingredientIds: moveInList(form.ingredientIds, from, to) })}
            emptyLabel={t('admin.menu.ingredients.noneChosen')}
          />
        </Section>

        <Section title={t('admin.menu.sections.groups')}>
          <PickList
            all={groups.filter((g) => g.is_active).map((g) => ({ id: g.id, label: g.admin_label || g.name_de }))}
            selected={form.groupIds}
            onChange={(groupIds) => patch({ groupIds })}
            onMove={(from, to) => patch({ groupIds: moveInList(form.groupIds, from, to) })}
            emptyLabel={t('admin.menu.groups.noneChosen')}
          />
        </Section>

        <Section title={t('admin.menu.sections.state')}>
          <Toggle
            label={t('admin.menu.isActive')}
            hint={t('admin.menu.isActiveHint')}
            checked={form.is_active}
            onChange={(is_active) => patch({ is_active })}
          />
          <Toggle
            label={t('admin.menu.isSoldOut')}
            hint={t('admin.menu.isSoldOutHint')}
            checked={form.is_sold_out}
            onChange={(is_sold_out) => patch({ is_sold_out })}
          />
        </Section>

        <Section title={t('admin.menu.sections.preview')}>
          <TicketPreview product={previewProduct} isBeverage={category?.is_beverage ?? false} />
        </Section>

        {product ? (
          <Section title={t('admin.menu.sections.actions')}>
            <div className="flex flex-wrap gap-2">
              <Button
                variant="secondary"
                icon={<Copy aria-hidden size={18} />}
                disabled={saving}
                onClick={() => void handleDuplicate()}
              >
                {t('common.duplicate')}
              </Button>
              {confirmArchive ? (
                <div className="flex w-full flex-col gap-2 rounded-card border border-danger/40 bg-danger/10 p-3">
                  <p className="text-xs text-danger-ink">{t('admin.menu.archiveConfirm')}</p>
                  <div className="flex gap-2">
                    <Button variant="danger" loading={saving} onClick={() => void handleArchive()}>
                      {t('admin.menu.archive')}
                    </Button>
                    <Button variant="ghost" onClick={() => setConfirmArchive(false)}>
                      {t('common.cancel')}
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  icon={<Archive aria-hidden size={18} />}
                  disabled={saving}
                  onClick={() => setConfirmArchive(true)}
                >
                  {t('admin.menu.archive')}
                </Button>
              )}
            </div>
          </Section>
        ) : null}
      </div>
    </Sheet>
  );
}

/** Kütüphaneden çoklu seçim + sıralama: seçilenler üstte sıralı, seçilmeyenler altta çip olarak. */
function PickList({
  all,
  selected,
  onChange,
  onMove,
  emptyLabel,
}: {
  all: { id: string; label: string }[];
  selected: string[];
  onChange: (next: string[]) => void;
  onMove: (fromId: string, toId: string) => void;
  emptyLabel: string;
}) {
  const byId = new Map(all.map((x) => [x.id, x.label]));
  const chosen = selected.filter((id) => byId.has(id));
  const rest = all.filter((x) => !selected.includes(x.id));

  return (
    <div className="flex flex-col gap-3">
      {chosen.length === 0 ? (
        <p className="text-xs text-muted">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border rounded-control border border-border bg-surface-2">
          {chosen.map((id, i) => (
            <li key={id} className="flex items-center justify-between gap-2 pl-3">
              <span className="min-w-0 truncate text-sm">{byId.get(id)}</span>
              <span className="flex items-center">
                <MoveButtons
                  disabledUp={i === 0}
                  disabledDown={i === chosen.length - 1}
                  onUp={() => onMove(id, chosen[i - 1] ?? id)}
                  onDown={() => onMove(id, chosen[i + 1] ?? id)}
                />
                <Chip selected onClick={() => onChange(selected.filter((x) => x !== id))}>
                  ✕
                </Chip>
              </span>
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap gap-2">
        {rest.map((x) => (
          <Chip key={x.id} onClick={() => onChange([...selected, x.id])}>
            {x.label}
          </Chip>
        ))}
      </div>
    </div>
  );
}

/** Form hâlinden önizleme için `MenuProduct` kurar — kaydedilmemiş değişiklikler de fişte görünür. */
function buildPreviewProduct(
  form: Form,
  product: AdminProduct | null,
  ingredients: AdminIngredient[],
  groups: AdminOptionGroup[],
): MenuProduct {
  const ingById = new Map(ingredients.map((i) => [i.id, i]));
  const grpById = new Map(groups.map((g) => [g.id, g]));
  return {
    id: product?.id ?? 'preview',
    category_id: form.category_id,
    code: form.code.trim() || null,
    name: form.name.trim() || '—',
    description: form.description || null,
    base_price_cents: parseEuroInput(form.basePriceInput),
    allergens: form.allergens.join(',') || null,
    image_path: form.image_path,
    is_sold_out: form.is_sold_out,
    sort: product?.sort ?? 0,
    variants: form.variants
      .filter((v) => v.is_active)
      .map((v, i) => ({
        id: v.key,
        name_de: v.name_de || '—',
        name_tr: v.name_tr || null,
        price_cents: parseEuroInput(v.priceInput) ?? 0,
        is_default: v.is_default,
        sort: i,
      })),
    ingredients: form.ingredientIds.flatMap((id, i) => {
      const ing = ingById.get(id);
      return ing ? [{ id: ing.id, name_de: ing.name_de, name_tr: ing.name_tr, sort: i }] : [];
    }),
    groups: form.groupIds.flatMap((id, i) => {
      const g = grpById.get(id);
      if (!g) return [];
      return [
        {
          id: g.id,
          name_de: g.name_de,
          name_tr: g.name_tr,
          min_select: g.min_select,
          max_select: g.max_select,
          ticket_format: g.ticket_format,
          sort: i,
          options: g.options
            .filter((o) => o.is_active)
            .sort((a, b) => a.sort - b.sort)
            .map((o) => ({
              id: o.id,
              name_de: o.name_de,
              name_tr: o.name_tr,
              price_delta_cents: o.price_delta_cents,
              is_default: o.is_default,
              is_exclusive: o.is_exclusive,
              sort: o.sort,
            })),
        },
      ];
    }),
  };
}

type ErrorField = 'code' | 'form';
type ErrorKey =
  | 'admin.menu.errors.codeTaken'
  | 'admin.menu.errors.inUse'
  | 'errors.not_authorized'
  | 'errors.unknown';

/**
 * Kayıt hatasını alana bağlar. `23505` ürün numarası benzersizlik ihlalidir ve tek çözümü
 * numarayı değiştirmektir — bu yüzden mesaj genel bir toast değil, **alanın altında** durur.
 * `23503` kaydın başka yerde kullanıldığını söyler; çözüm silmek değil pasifleştirmektir
 * (global-constraints §Kayıtlar).
 */
function errorFor(e: unknown): { field: ErrorField; key: ErrorKey } {
  if (e instanceof MenuApiError) {
    if (e.code === '23505') return { field: 'code', key: 'admin.menu.errors.codeTaken' };
    if (e.code === '23503') return { field: 'form', key: 'admin.menu.errors.inUse' };
    if (e.code === '42501') return { field: 'form', key: 'errors.not_authorized' };
  }
  return { field: 'form', key: 'errors.unknown' };
}
