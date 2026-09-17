import { describe, expect, it } from 'vitest';
import {
  allergenLabels,
  categoryName,
  euro,
  groupProducts,
  legendLabel,
  priceLabel,
  sortedVariants,
  variantName,
} from './publicMenuLogic';
import type { PublicCategory, PublicProduct } from './types';

const LRI = String.fromCharCode(0x2066);
const PDI = String.fromCharCode(0x2069);
const NBSP = String.fromCharCode(0xa0);

const cat = (over: Partial<PublicCategory> = {}): PublicCategory => ({
  id: 'c1',
  name_de: 'Suppen',
  name_tr: 'Çorbalar',
  name_en: 'Soups',
  name_ar: 'شوربات',
  is_beverage: false,
  sort: 10,
  ...over,
});

const product = (over: Partial<PublicProduct> = {}): PublicProduct => ({
  id: 'p1',
  category_id: 'c1',
  code: '01',
  name: 'Linsensuppe',
  description: null,
  base_price_cents: 650,
  image_path: null,
  allergens: null,
  is_sold_out: false,
  sort: 1,
  variants: [],
  ...over,
});

const legend = [
  { code: 'a', de: 'Glutenhaltiges Getreide', tr: 'Glutenli tahıl' },
  { code: 'g', de: 'Milch' },
];

describe('categoryName', () => {
  it('dile göre ad, yoksa Almanca', () => {
    expect(categoryName(cat(), 'de')).toBe('Suppen');
    expect(categoryName(cat(), 'tr')).toBe('Çorbalar');
    expect(categoryName(cat(), 'en')).toBe('Soups');
    expect(categoryName(cat(), 'ar')).toBe('شوربات');
    expect(categoryName(cat({ name_en: null, name_ar: '  ' }), 'en')).toBe('Suppen');
    expect(categoryName(cat({ name_ar: '  ' }), 'ar')).toBe('Suppen');
  });
});

describe('priceLabel', () => {
  it('varyant yoksa taban fiyat', () => {
    expect(priceLabel(product(), 'de')).toBe(`6,50${NBSP}€`);
  });

  it('tek varyant: "ab" yok, varyantın fiyatı', () => {
    const p = product({
      variants: [{ name_de: 'Normal', name_tr: null, price_cents: 800, sort: 1 }],
    });
    expect(priceLabel(p, 'de')).toBe(`8,00${NBSP}€`);
  });

  it('birden çok varyant: en düşük fiyattan, dile göre kalıp', () => {
    const p = product({
      variants: [
        { name_de: 'Groß', name_tr: 'Büyük', price_cents: 1150, sort: 2 },
        { name_de: 'Klein', name_tr: 'Küçük', price_cents: 850, sort: 1 },
      ],
    });
    expect(priceLabel(p, 'de')).toBe(`ab 8,50${NBSP}€`);
    expect(priceLabel(p, 'tr')).toBe(`8,50${NBSP}€’dan`);
    expect(priceLabel(p, 'en')).toBe(`from 8,50${NBSP}€`);
    expect(priceLabel(p, 'ar')).toBe(`من ${LRI}8,50${NBSP}€${PDI}`);
  });

  it('aynı fiyatlı varyantlarda "ab" yok', () => {
    const p = product({
      variants: [
        { name_de: 'Rot', name_tr: null, price_cents: 300, sort: 1 },
        { name_de: 'Weiß', name_tr: null, price_cents: 300, sort: 2 },
      ],
    });
    expect(priceLabel(p, 'de')).toBe(`3,00${NBSP}€`);
  });

  it('Arapçada tutar soldan sağa yalıtılır, diğer dillerde yalın', () => {
    expect(euro(650, 'ar')).toBe(`${LRI}6,50${NBSP}€${PDI}`);
    expect(euro(650, 'en')).toBe(`6,50${NBSP}€`);
    expect(priceLabel(product(), 'ar')).toBe(`${LRI}6,50${NBSP}€${PDI}`);
  });

  it('fiyat yoksa boş', () => {
    expect(priceLabel(product({ base_price_cents: null }), 'de')).toBe('');
  });
});

describe('varyantlar', () => {
  it('dile göre ad: tr → name_tr ?? name_de, diğerleri Almanca', () => {
    const v = { name_de: 'Groß', name_tr: 'Büyük', price_cents: 1, sort: 1 };
    expect(variantName(v, 'tr')).toBe('Büyük');
    expect(variantName({ ...v, name_tr: null }, 'tr')).toBe('Groß');
    expect(variantName(v, 'en')).toBe('Groß');
    expect(variantName(v, 'ar')).toBe('Groß');
  });

  it('sıraya göre dizilir', () => {
    const p = product({
      variants: [
        { name_de: 'B', name_tr: null, price_cents: 2, sort: 2 },
        { name_de: 'A', name_tr: null, price_cents: 1, sort: 1 },
      ],
    });
    expect(sortedVariants(p).map((v) => v.name_de)).toEqual(['A', 'B']);
  });
});

describe('alerjenler', () => {
  it('kodlar lejanttan metne çevrilir; tr varsa tr, yoksa de', () => {
    expect(allergenLabels('a, g', legend, 'tr')).toEqual([
      { code: 'a', label: 'Glutenli tahıl' },
      { code: 'g', label: 'Milch' },
    ]);
  });

  it('en/ar/de Almanca lejantı kullanır', () => {
    for (const locale of ['de', 'en', 'ar'] as const) {
      expect(allergenLabels('a', legend, locale)).toEqual([
        { code: 'a', label: 'Glutenhaltiges Getreide' },
      ]);
    }
  });

  it('bilinmeyen kod kodun kendisiyle kalır; boş değer boş liste', () => {
    expect(allergenLabels('A,x,,', legend, 'de')).toEqual([
      { code: 'a', label: 'Glutenhaltiges Getreide' },
      { code: 'x', label: 'x' },
    ]);
    expect(allergenLabels(null, legend, 'de')).toEqual([]);
  });

  it('lejant satırı dile göre', () => {
    expect(legendLabel(legend[0]!, 'tr')).toBe('Glutenli tahıl');
    expect(legendLabel(legend[1]!, 'tr')).toBe('Milch');
    expect(legendLabel(legend[0]!, 'ar')).toBe('Glutenhaltiges Getreide');
  });
});

describe('groupProducts', () => {
  it('kategoriler sıralı, boş kategori atlanır, ürünler sıralı', () => {
    const cats = [
      cat({ id: 'c2', sort: 20 }),
      cat({ id: 'c1', sort: 10 }),
      cat({ id: 'c3', sort: 30 }),
    ];
    const products = [
      product({ id: 'b', category_id: 'c1', sort: 2 }),
      product({ id: 'a', category_id: 'c1', sort: 1 }),
      product({ id: 'z', category_id: 'c2', sort: 1 }),
    ];
    const groups = groupProducts(cats, products);
    expect(groups.map((g) => g.category.id)).toEqual(['c1', 'c2']);
    expect(groups[0]!.products.map((p) => p.id)).toEqual(['a', 'b']);
  });
});
