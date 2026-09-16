import { describe, expect, it } from 'vitest';
import {
  previewPayloadFor,
  readAllergenLegend,
  reorder,
  slugify,
  slugWithFallback,
  validateGroup,
} from './menuAdminLogic';

describe('menü admin mantığı', () => {
  it('grup kuralları', () => {
    expect(validateGroup({ min_select: 2, max_select: 1 }, 3)).toBe('min_gt_max');
    expect(validateGroup({ min_select: 5, max_select: 5 }, 4)).toBe('min_gt_options');
    expect(validateGroup({ min_select: 0, max_select: 3 }, 2)).toBe('max_gt_options');
    expect(validateGroup({ min_select: 5, max_select: 5 }, 16)).toBeNull();
  });

  it('sürükle-bırak sırası 10’un katları', () => {
    expect(reorder([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'c', 'a')).toEqual([
      { id: 'c', sort: 10 },
      { id: 'a', sort: 20 },
      { id: 'b', sort: 30 },
    ]);
  });

  it('ileri taşıma hedefin özgün yerine bırakır', () => {
    expect(reorder([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'a', 'c')).toEqual([
      { id: 'b', sort: 10 },
      { id: 'c', sort: 20 },
      { id: 'a', sort: 30 },
    ]);
  });

  it('taşıma yoksa yazma da yok', () => {
    expect(reorder([{ id: 'a' }, { id: 'b' }], 'a', 'a')).toEqual([]);
    expect(reorder([{ id: 'a' }, { id: 'b' }], 'a', 'yok')).toEqual([]);
  });

  it.each([
    ['Drehspieß Sandwich', 'drehspiess-sandwich'],
    ['Şiş Kebap', 'sis-kebap'],
    ['Iskender · Ali Nazik', 'iskender-ali-nazik'],
    ['Käse-Pizza (groß)', 'kase-pizza-gross'],
    ['  Pide   ', 'pide'],
  ])('slug: %s → %s', (name, slug) => expect(slugify(name as string)).toBe(slug));

  it('slug boş kalırsa kısa ek verilir', () =>
    expect(slugWithFallback('···', 'abcdef01-2345')).toBe('x-abcdef01'));

  it('önizleme payload’u seçimleri fişe çevirir', () => {
    const p = {
      id: 'p',
      code: '05',
      name: 'Drehspieß Sandwich',
      variants: [{ id: 'k', name_de: 'Kalb', name_tr: 'Dana' }],
      ingredients: [{ id: 'z', name_de: 'Zwiebeln', name_tr: 'Soğan' }],
      groups: [
        { id: 's', name_de: 'Soße', ticket_format: 'label_values', options: [{ id: 'a', name_de: 'Knoblauch' }] },
      ],
    } as never;
    const payload = previewPayloadFor(p, { variantId: 'k', optionIds: ['a'], removedIngredientIds: ['z'] }, 2);
    expect(payload.items[0]).toMatchObject({
      qty: 2,
      code: '05',
      variant: 'Kalb',
      without: ['Zwiebeln'],
      groups: [{ label: 'Soße', format: 'label_values', values: ['Knoblauch'] }],
    });
    expect(payload.table).toBe('Tisch 12');
  });

  it('alerjen lejantı bozuk kayıtları atlar', () => {
    expect(
      readAllergenLegend([
        { code: 'a', de: 'Glutenhaltiges Getreide', tr: 'Glutenli tahıl' },
        { de: 'kodsuz' },
        null,
        'metin',
        { code: '7' },
      ]),
    ).toEqual([
      { code: 'a', de: 'Glutenhaltiges Getreide', tr: 'Glutenli tahıl' },
      { code: '7', de: '7', tr: '7' },
    ]);
    expect(readAllergenLegend(null)).toEqual([]);
    expect(readAllergenLegend('[]')).toEqual([]);
  });

  it('seçim yapılmamış grup fişe girmez', () => {
    const p = {
      id: 'p',
      code: '05',
      name: 'Sandwich',
      variants: [],
      ingredients: [],
      groups: [
        { id: 's', name_de: 'Soße', ticket_format: 'label_values', options: [{ id: 'a', name_de: 'Knoblauch' }] },
      ],
    } as never;
    const payload = previewPayloadFor(p, { variantId: null, optionIds: [], removedIngredientIds: [] }, 1);
    expect(payload.items[0]?.groups).toEqual([]);
    expect(payload.items[0]?.variant).toBeNull();
  });
});
