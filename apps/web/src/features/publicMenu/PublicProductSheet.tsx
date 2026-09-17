import { Badge } from '../../ui/Badge';
import { ProductImage } from '../../ui/ProductImage';
import { Sheet } from '../../ui/Sheet';
import type { PublicLocale } from './locale';
import { allergenLabels, euro, priceLabel, sortedVariants, variantName } from './publicMenuLogic';
import { t } from './strings';
import type { PublicAllergen, PublicProduct } from './types';

/**
 * Ürün kartı: büyük görsel, fiyat(lar), açıklama ve alerjenler. Yalnız bilgi — sepet, adet ya da
 * seçim yok; tek eylem kartı kapatmak.
 */
export function PublicProductSheet({
  product,
  legend,
  locale,
  onClose,
}: {
  product: PublicProduct;
  legend: PublicAllergen[];
  locale: PublicLocale;
  onClose: () => void;
}) {
  const variants = sortedVariants(product);
  const allergens = allergenLabels(product.allergens, legend, locale);

  return (
    <Sheet open onClose={onClose} title={product.name} closeLabel={t(locale, 'close')}>
      <div className="mx-auto flex max-w-sm flex-col gap-5 pb-4">
        <ProductImage
          path={product.image_path}
          size="full"
          code={product.code}
          className={product.is_sold_out ? 'mx-auto max-w-sm grayscale' : 'mx-auto max-w-sm'}
        />

        <div className="flex flex-col gap-2">
          <p className="flex items-baseline gap-2">
            {product.code ? (
              <span className="tabular shrink-0 text-base font-semibold text-muted">
                {product.code}
              </span>
            ) : null}
            <bdi lang="de" className="min-w-0 text-xl font-semibold rtl:text-right">
              {product.name}
            </bdi>
          </p>
          {product.is_sold_out ? (
            <Badge tone="empty" className="self-start">
              {t(locale, 'soldOut')}
            </Badge>
          ) : null}
        </div>

        {variants.length > 1 ? (
          <ul
            aria-label={t(locale, 'sizes')}
            className="flex flex-col rounded-card border border-border"
          >
            {variants.map((v) => (
              <li
                key={`${v.sort}-${v.name_de}`}
                className="flex items-baseline justify-between gap-3 border-b border-border px-4 py-3 last:border-b-0"
              >
                <span className="min-w-0">{variantName(v, locale)}</span>
                <span className="tabular shrink-0 font-semibold text-gold">
                  {euro(v.price_cents, locale)}
                </span>
              </li>
            ))}
          </ul>
        ) : priceLabel(product, locale) ? (
          <p className="tabular text-2xl font-semibold text-gold">{priceLabel(product, locale)}</p>
        ) : null}

        {product.description ? (
          <p lang="de" dir="auto" className="text-base leading-relaxed text-text/90 rtl:text-right">
            {product.description}
          </p>
        ) : null}

        {allergens.length > 0 ? (
          <div className="flex flex-col gap-1.5">
            <h3 className="text-sm font-semibold text-muted">{t(locale, 'allergens')}</h3>
            <ul className="flex flex-wrap gap-2">
              {allergens.map((a) => (
                <li
                  key={a.code}
                  className="inline-flex items-baseline gap-1.5 rounded-full border border-border bg-surface-2 px-3 py-1 text-sm"
                >
                  <span className="font-semibold text-gold">{a.code}</span>
                  <span>{a.label}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Sheet>
  );
}
