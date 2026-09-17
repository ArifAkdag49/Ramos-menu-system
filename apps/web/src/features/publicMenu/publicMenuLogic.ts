import { formatEuro } from '@ramos/shared';
import type { PublicLocale } from './locale';
import { t } from './strings';
import type { PublicAllergen, PublicCategory, PublicProduct, PublicVariant } from './types';

const filled = (v: string | null | undefined): string | null => (v && v.trim() ? v : null);

/** Kategori adı müşterinin dilinde; çeviri girilmemişse Almanca (her kategoride zorunlu). */
export function categoryName(c: PublicCategory, locale: PublicLocale): string {
  const local = locale === 'de' ? null : c[`name_${locale}`];
  return filled(local) ?? c.name_de;
}

/** Varyant adları yalnız DE/TR girilir: TR'de Türkçe, diğer dillerde Almanca görünür. */
export function variantName(v: PublicVariant, locale: PublicLocale): string {
  return locale === 'tr' ? (filled(v.name_tr) ?? v.name_de) : v.name_de;
}

export function sortedVariants(p: PublicProduct): PublicVariant[] {
  return [...p.variants].sort((a, b) => a.sort - b.sort);
}

/**
 * Tutar metni, her dilde `de-DE` biçimi (8,50 €). Arapçada sağdan sola akışta "€" sayının soluna
 * kaçıyordu ("€ 8,50"): tutar soldan sağa yalıtılır (U+2066 LRI … U+2069 PDI).
 */
const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);

export function euro(cents: number, locale: PublicLocale): string {
  const text = formatEuro(cents);
  return locale === 'ar' ? `${LRI}${text}${PDI}` : text;
}

/**
 * Satırdaki fiyat. Varyantların fiyatı farklıysa en düşüğü "…'dan" kalıbıyla; tek fiyat varsa
 * yalın. Biçim her dilde `de-DE` (8,50 €): menü Almanya'da, kasa fişi de böyle.
 */
export function priceLabel(p: PublicProduct, locale: PublicLocale): string {
  if (p.variants.length > 0) {
    const prices = p.variants.map((v) => v.price_cents);
    const min = Math.min(...prices);
    const price = euro(min, locale);
    return prices.some((x) => x !== min) ? t(locale, 'priceFrom', { price }) : price;
  }
  return p.base_price_cents === null ? '' : euro(p.base_price_cents, locale);
}

/** Lejantta yalnız DE ve TR metni var: TR'de Türkçe, EN/AR/DE'de Almanca. */
export function legendLabel(e: PublicAllergen, locale: PublicLocale): string {
  return locale === 'tr' ? (filled(e.tr) ?? e.de) : e.de;
}

export function allergenLabels(
  codes: string | null,
  legend: PublicAllergen[],
  locale: PublicLocale,
): { code: string; label: string }[] {
  if (!codes) return [];
  const byCode = new Map(legend.map((e) => [e.code.toLowerCase(), e]));
  return codes
    .split(',')
    .map((c) => c.trim().toLowerCase())
    .filter(Boolean)
    .map((code) => {
      const entry = byCode.get(code);
      return { code, label: entry ? legendLabel(entry, locale) : code };
    });
}

export interface ProductGroup {
  category: PublicCategory;
  products: PublicProduct[];
}

/** Kategoriler `sort` sırasıyla; ürünü olmayan kategori menüde yer kaplamaz. */
export function groupProducts(
  categories: PublicCategory[],
  products: PublicProduct[],
): ProductGroup[] {
  const byCategory = new Map<string, PublicProduct[]>();
  for (const p of products)
    byCategory.set(p.category_id, [...(byCategory.get(p.category_id) ?? []), p]);
  return [...categories]
    .sort((a, b) => a.sort - b.sort)
    .map((category) => ({
      category,
      products: [...(byCategory.get(category.id) ?? [])].sort((a, b) => a.sort - b.sort),
    }))
    .filter((g) => g.products.length > 0);
}
