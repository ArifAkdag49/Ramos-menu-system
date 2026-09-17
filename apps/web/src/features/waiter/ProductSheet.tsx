import {
  EXTRA_CHARGE_LIMITS,
  defaultSelection,
  formatEuro,
  localName,
  normalizeExtraLabel,
  parseEuroToCents,
  toggleOption,
  unitPriceCents,
  validateExtraCharge,
  validateSelection,
  type CartLine,
  type ExtraCharge,
  type ExtraChargeError,
  type Locale,
  type MenuGroup,
  type MenuProduct,
  type Selection,
} from '@ramos/shared';
import { clsx } from 'clsx';
import type { TFunction } from 'i18next';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useSettings } from '../../data/settings';
import { Badge } from '../../ui/Badge';
import { Button } from '../../ui/Button';
import { Chip } from '../../ui/Chip';
import { ProductImage } from '../../ui/ProductImage';
import { Sheet } from '../../ui/Sheet';
import { Stepper } from '../../ui/Stepper';

type LineInput = Omit<CartLine, 'key' | 'productId'>;

/** Grubun seçim kuralını tek satırlık bir ipucuna çevirir ("1 seçin", "en fazla 3", "tam 5 — 3/5"). */
function groupHint(g: Pick<MenuGroup, 'min_select' | 'max_select'>, chosen: number, t: TFunction<'translation'>): string {
  const { min_select: min, max_select: max } = g;
  if (min === 0 && max === 1) return t('waiter.order.hint.optional');
  if (min === max) return min === 1 ? t('waiter.order.hint.exactlyOne') : t('waiter.order.hint.exactlyN', { n: max, chosen });
  if (min === 0) return t('waiter.order.hint.upToN', { n: max });
  return t('waiter.order.hint.rangeMinMax', { min, max });
}

/**
 * Ürün paneli: varyant, seçim grupları, malzeme (OHNE/ÇIKAR), not ve serbest ekstra ücret. Kurallar
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
  // Serbest ekstra ücret (menüde olmayan istek): eklenenler + henüz "Ekle"ye basılmamış giriş.
  const [extras, setExtras] = useState<ExtraCharge[]>(initial?.extraCharges ?? []);
  const [extraLabel, setExtraLabel] = useState('');
  const [extraAmount, setExtraAmount] = useState('');
  const [extraError, setExtraError] = useState<ExtraChargeError | null>(null);

  const errors = useMemo(() => validateSelection(product, selection), [product, selection]);
  const errorGroupIds = useMemo(() => new Set(errors.flatMap((e) => ('groupId' in e ? [e.groupId] : []))), [errors]);
  const variantInvalid = errors.some((e) => e.key === 'variant_required');
  const canSubmit = errors.length === 0;

  if (!open) return null;

  // Yazılmış ama "Ekle"ye basılmamış geçerli bir ekstra da fiyata dahil görünür; gönderimde eklenir.
  const pendingText = extraLabel.trim() !== '' || extraAmount.trim() !== '';
  const pendingCents = pendingText ? parseEuroToCents(extraAmount) : null;
  const pendingExtra: ExtraCharge | null =
    pendingText && pendingCents !== null && !validateExtraCharge(extraLabel, pendingCents, extras.length)
      ? { label: normalizeExtraLabel(extraLabel), cents: pendingCents }
      : null;
  const allExtras = pendingExtra ? [...extras, pendingExtra] : extras;
  const unitPrice = unitPriceCents(product, { ...selection, extraCharges: allExtras });
  const sortedGroups = [...product.groups].sort((a, b) => a.sort - b.sort);

  /**
   * Y5 (M3 tasarım kapısı): zorunlu "Sos" grubu panel açılınca katlamanın altında kalıyordu ve
   * tek işareti 1 px'lik bir çerçeveydi. Garson gri "Sepete ekle"ye basıyor, hiçbir şey olmuyor,
   * **neden** yazmıyordu — BUILD-PROMPT §10.9 "hata mesajı ne oldu + ne yapılmalı der" ihlali.
   * Eksik olan ilk alan görünme sırasına göre (önce varyant, sonra grup sırası) adıyla söylenir.
   */
  const missingLabel = canSubmit
    ? null
    : variantInvalid
      ? t('waiter.order.variantLabel')
      : (() => {
          const group = sortedGroups.find((g) => errorGroupIds.has(g.id));
          return group ? localName(group, locale) : null;
        })();
  const hintId = 'product-submit-hint';
  const quickNotes = (settings?.quick_notes as { de: string; tr: string }[] | null | undefined) ?? [];

  const toggleIngredient = (id: string) =>
    setSelection((s) => ({
      ...s,
      removedIngredientIds: s.removedIngredientIds.includes(id)
        ? s.removedIngredientIds.filter((x) => x !== id)
        : [...s.removedIngredientIds, id],
    }));

  /** Ekstrayı doğrular; geçerliyse listeye alır ve girişi temizler. Hata anahtarını döner. */
  const addExtra = (): ExtraChargeError | null => {
    const cents = parseEuroToCents(extraAmount);
    const error = validateExtraCharge(extraLabel, cents, extras.length);
    setExtraError(error);
    if (error || cents === null) return error ?? 'amount_invalid';
    setExtras((xs) => [...xs, { label: normalizeExtraLabel(extraLabel), cents }]);
    setExtraLabel('');
    setExtraAmount('');
    return null;
  };

  const submit = () => {
    if (!canSubmit) return;
    // Garson tutarı yazıp "Ekle"ye basmayı unuttuysa ekstra sessizce kaybolmasın.
    if (pendingText && !pendingExtra) {
      addExtra();
      return;
    }
    onSubmit({ ...selection, quantity, note: note.trim(), extraCharges: allExtras });
  };

  return (
    <Sheet
      open
      onClose={onClose}
      title={product.name}
      closeLabel={t('common.close')}
      footer={
        <div className="flex flex-col gap-2">
          {missingLabel ? (
            <p id={hintId} data-testid="submit-hint" className="text-base font-medium text-danger-ink">
              {t('waiter.order.submitHint', { group: missingLabel })}
            </p>
          ) : null}
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
            <Button
              fullWidth
              size="lg"
              disabled={!canSubmit}
              aria-describedby={missingLabel ? hintId : undefined}
              onClick={submit}
            >
              {t(initial ? 'waiter.order.update' : 'waiter.order.addToCart', { price: formatEuro(unitPrice * quantity) })}
            </Button>
          </div>
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-2">
          {/* Kare görsel: yükseklik değil genişlik sınırlanır (max-h kareyi bozup kırpardı); geniş
              ekranda panel çok uzamasın diye ortalanmış en fazla 24 rem. */}
          <ProductImage path={product.image_path} size="full" code={product.code} className="mx-auto max-w-sm" />
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
            className={clsx(
              'm-0 flex flex-col gap-2 rounded-card border-0 p-0',
              variantInvalid && 'border border-danger/60 p-3',
            )}
          >
            {variantInvalid ? (
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-base font-semibold">{t('waiter.order.variantLabel')}</span>
                <Badge tone="danger">{t('waiter.order.requiredMark')}</Badge>
              </div>
            ) : null}
            <div className="flex gap-2">
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
            </div>
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
                <span className="flex items-baseline gap-2">
                  {/* Y5: eksik grubun tek işareti 1 px kenarlıktı — katlamanın altında görünmüyordu. */}
                  {hasError ? <Badge tone="danger">{t('waiter.order.requiredMark')}</Badge> : null}
                  <span className="text-sm text-muted">{groupHint(g, chosen.length, t)}</span>
                </span>
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

        {/* min-w-0: fieldset'in tarayıcı varsayılanı min-content genişliktir; giriş satırı paneli 390 px'te yana taşırıyordu. */}
        <fieldset className="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
          <legend className="mb-1 text-base font-semibold">{t('waiter.order.extra.title')}</legend>
          <p className="text-sm text-muted">{t('waiter.order.extra.hint')}</p>
          {extras.length ? (
            <div className="flex flex-wrap gap-2">
              {extras.map((e, i) => (
                <Chip
                  key={`${i}-${e.label}`}
                  selected
                  aria-label={t('waiter.order.extra.remove', { label: e.label, price: formatEuro(e.cents) })}
                  onClick={() => setExtras((xs) => xs.filter((_, j) => j !== i))}
                >
                  {e.label} +{formatEuro(e.cents)} ✕
                </Chip>
              ))}
            </div>
          ) : null}
          {extras.length < EXTRA_CHARGE_LIMITS.maxPerItem ? (
            // Telefonda iki satır: açıklama tam genişlik (DE yer tutucu da sığar), altında tutar + Ekle.
            <div className="flex flex-col gap-2">
              <input
                id="product-extra-label"
                aria-label={t('waiter.order.extra.label')}
                value={extraLabel}
                maxLength={EXTRA_CHARGE_LIMITS.labelMax}
                placeholder={t('waiter.order.extra.labelPlaceholder')}
                onChange={(e) => {
                  setExtraLabel(e.target.value);
                  setExtraError(null);
                }}
                className="min-h-12 w-full rounded-control border border-border bg-surface-2 px-3 text-base text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
              />
              <div className="flex gap-2">
                <div className="relative w-32 shrink-0">
                  <input
                    id="product-extra-amount"
                    aria-label={t('waiter.order.extra.amount')}
                    value={extraAmount}
                    inputMode="decimal"
                    placeholder="1,00"
                    onChange={(e) => {
                      setExtraAmount(e.target.value);
                      setExtraError(null);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        addExtra();
                      }
                    }}
                    className="tabular min-h-12 w-full rounded-control border border-border bg-surface-2 pl-3 pr-7 text-right text-base text-text placeholder:text-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lime"
                  />
                  <span aria-hidden className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-base text-muted">
                    €
                  </span>
                </div>
                <Button variant="secondary" className="flex-1" onClick={() => void addExtra()} disabled={!pendingText}>
                  {t('waiter.order.extra.add')}
                </Button>
              </div>
            </div>
          ) : null}
          {extraError ? (
            <p role="alert" className="text-base font-medium text-danger-ink">
              {t(`waiter.order.extra.errors.${extraError}`, { max: EXTRA_CHARGE_LIMITS.maxPerItem, labelMax: EXTRA_CHARGE_LIMITS.labelMax })}
            </p>
          ) : null}
        </fieldset>
      </div>
    </Sheet>
  );
}
