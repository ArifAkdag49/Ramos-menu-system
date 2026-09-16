import {
  defaultSelection,
  formatEuro,
  localName,
  toggleOption,
  unitPriceCents,
  validateSelection,
  type CartLine,
  type Locale,
  type MenuGroup,
  type MenuProduct,
  type Selection,
} from '@ramos/shared';
import { clsx } from 'clsx';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../data/settings';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { ProductImage } from '../../ui/ProductImage';
import { Sheet } from '../../ui/Sheet';
import { Stepper } from '../../ui/Stepper';

type LineInput = Omit<CartLine, 'key' | 'productId'>;
type Translate = (key: string, options?: Record<string, unknown>) => string;

/** Grubun seçim kuralını tek satırlık bir ipucuna çevirir ("1 seçin", "en fazla 3", "tam 5 — 3/5"). */
function groupHint(g: Pick<MenuGroup, 'min_select' | 'max_select'>, chosen: number, t: Translate): string {
  const { min_select: min, max_select: max } = g;
  if (min === 0 && max === 1) return t('waiter.order.hint.optional');
  if (min === max) return min === 1 ? t('waiter.order.hint.exactlyOne') : t('waiter.order.hint.exactlyN', { n: max, chosen });
  if (min === 0) return t('waiter.order.hint.upToN', { n: max });
  return t('waiter.order.hint.rangeMinMax', { min, max });
}

/**
 * Ürün paneli: varyant, seçim grupları, malzeme (OHNE/ÇIKAR) ve not. Kurallar
 * (`defaultSelection`/`toggleOption`/`validateSelection`/`unitPriceCents`) `@ramos/shared`'dan
 * gelir — sunucudaki `submit_order` aynısını uygular, burada ikinci bir kopya yazılmaz.
 *
 * `initial` verilirse düzenleme moduna geçer (buton "Güncelle" olur). Panel yalnız açıkken
 * (`open`) çağıran tarafından mount edilir (bkz. `OrderPage`); bu yüzden seçim durumu tek seferlik
 * `useState` başlatıcısıyla kurulur — yeniden açılış her zaman yeni bir mount'tur.
 */
export function ProductSheet({
  product,
  open,
  onClose,
  onSubmit,
  initial,
}: {
  product: MenuProduct;
  open: boolean;
  onClose: () => void;
  onSubmit: (line: LineInput) => void;
  initial?: LineInput;
}) {
  const { t, i18n } = useTranslation();
  const locale: Locale = i18n.language === 'de' ? 'de' : 'tr';
  const settings = useSettings();

  const [selection, setSelection] = useState<Selection>(() =>
    initial
      ? { variantId: initial.variantId, optionIds: initial.optionIds, removedIngredientIds: initial.removedIngredientIds }
      : defaultSelection(product),
  );
  const [quantity, setQuantity] = useState(initial?.quantity ?? 1);
  const [note, setNote] = useState(initial?.note ?? '');

  const errors = useMemo(() => validateSelection(product, selection), [product, selection]);
  const errorGroupIds = useMemo(() => new Set(errors.flatMap((e) => ('groupId' in e ? [e.groupId] : []))), [errors]);
  const variantInvalid = errors.some((e) => e.key === 'variant_required');
  const canSubmit = errors.length === 0;

  if (!open) return null;

  const unitPrice = unitPriceCents(product, selection);
  const sortedGroups = [...product.groups].sort((a, b) => a.sort - b.sort);
  const quickNotes = (settings?.quick_notes as { de: string; tr: string }[] | null | undefined) ?? [];

  const toggleIngredient = (id: string) =>
    setSelection((s) => ({
      ...s,
      removedIngredientIds: s.removedIngredientIds.includes(id)
        ? s.removedIngredientIds.filter((x) => x !== id)
        : [...s.removedIngredientIds, id],
    }));

  const submit = () => {
    if (!canSubmit) return;
    onSubmit({ ...selection, quantity, note: note.trim() });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={product.name}
      closeLabel={t('common.close')}
      footer={
        <div className="flex items-center gap-3">
          <Stepper
            value={quantity}
            onChange={setQuantity}
            min={1}
            max={99}
            decreaseLabel={t('waiter.order.quantity.decrease')}
            increaseLabel={t('waiter.order.quantity.increase')}
            valueLabel={t('waiter.order.quantity.value', { count: quantity })}
          />
          <Button fullWidth size="lg" disabled={!canSubmit} onClick={submit}>
            {t(initial ? 'waiter.order.update' : 'waiter.order.addToCart', { price: formatEuro(unitPrice * quantity) })}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          <ProductImage path={product.image_path} size="full" code={product.code} alt={product.name} className="max-h-60" />
          <div className="flex items-baseline gap-2">
            {product.code ? <span className="tabular text-sm text-muted">{product.code}</span> : null}
            <span className="text-lg font-semibold">{product.name}</span>
          </div>
          {product.description ? <p className="text-sm text-muted">{product.description}</p> : null}
          {product.allergens ? (
            <p className="text-xs text-muted">
              {t('waiter.order.allergensLabel')}: {product.allergens}
            </p>
          ) : null}
        </div>

        {product.variants.length ? (
          <fieldset
            aria-invalid={variantInvalid}
            aria-label={t('waiter.order.variantLabel')}
            className={clsx('m-0 flex gap-2 rounded-card border-0 p-0', variantInvalid && 'border border-danger/60 p-3')}
          >
            {[...product.variants]
              .sort((a, b) => a.sort - b.sort)
              .map((v) => (
                <Chip
                  key={v.id}
                  selected={selection.variantId === v.id}
                  className="flex-1 justify-center"
                  onClick={() => setSelection((s) => ({ ...s, variantId: v.id }))}
                >
                  {localName(v, locale)} {formatEuro(v.price_cents)}
                </Chip>
              ))}
          </fieldset>
        ) : null}

        {sortedGroups.map((g) => {
          const chosen = g.options.filter((o) => selection.optionIds.includes(o.id));
          const hasError = errorGroupIds.has(g.id);
          return (
            <fieldset
              key={g.id}
              aria-invalid={hasError}
              aria-label={localName(g, locale)}
              className={clsx('m-0 flex flex-col gap-2 rounded-card border-0 p-0', hasError && 'border border-danger/60 p-3')}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-semibold">{localName(g, locale)}</span>
                <span className="text-sm text-muted">{groupHint(g, chosen.length, t)}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {[...g.options]
                  .sort((a, b) => a.sort - b.sort)
                  .map((o) => (
                    <Chip
                      key={o.id}
                      selected={selection.optionIds.includes(o.id)}
                      onClick={() => setSelection((s) => ({ ...s, optionIds: toggleOption(g, s.optionIds, o.id) }))}
                    >
                      {localName(o, locale)}
                      {o.price_delta_cents ? ` +${formatEuro(o.price_delta_cents)}` : ''}
                    </Chip>
                  ))}
              </div>
            </fieldset>
          );
        })}

        {product.ingredients.length ? (
          <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
            <legend className="mb-1 text-base font-semibold">{t('waiter.order.ingredientsTitle')}</legend>
            <div className="flex flex-wrap gap-2">
              {[...product.ingredients]
                .sort((a, b) => a.sort - b.sort)
                .map((ing) => {
                  const removed = selection.removedIngredientIds.includes(ing.id);
                  return (
                    <Chip key={ing.id} selected={!removed} removed={removed} onClick={() => toggleIngredient(ing.id)}>
                      {removed ? `${t('waiter.order.removedPrefix')} ${localName(ing, locale)}` : localName(ing, locale)}
                    </Chip>
                  );
                })}
            </div>
          </fieldset>
        ) : null}

        <div className="flex flex-col gap-2">
          <label htmlFor="product-note" className="text-base font-semibold">
            {t('waiter.order.noteLabel')}
          </label>
          <textarea
            id="product-note"
            value={note}
            maxLength={200}
            placeholder={t('waiter.order.notePlaceholder')}
            onChange={(e) => setNote(e.target.value)}
            rows={2}
            className="w-full resize-none rounded-control border border-border bg-surface-2 px-3 py-2 text-base text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
          />
          {quickNotes.length ? (
            <div className="flex flex-wrap gap-2">
              {quickNotes.map((n, i) => {
                const text = locale === 'tr' && n.tr ? n.tr : n.de;
                return (
                  <Chip key={i} onClick={() => setNote((current) => (current ? `${current}, ${text}` : text).slice(0, 200))}>
                    {text}
                  </Chip>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </Sheet>
  );
}
