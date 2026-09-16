import { addLine, type CartLine, type MenuGroup, type MenuProduct } from '@ramos/shared';
import { describe, expect, it } from 'vitest';
import { RpcError } from '../../lib/rpc';
import { errorKey, submitErrorView } from './submitError';

const sauce: MenuGroup = {
  id: 'g-s', name_de: 'Soße', name_tr: null, min_select: 1, max_select: 2, ticket_format: 'label_values', sort: 1,
  options: [{ id: 'kn', name_de: 'Knoblauch', name_tr: null, price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 1 }],
};
const doener: MenuProduct = {
  id: 'p05', category_id: 'c', code: '05', name: 'Drehspieß Sandwich', description: null,
  base_price_cents: null, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [{ id: 'k', name_de: 'Kalb', name_tr: null, price_cents: 850, is_default: true, sort: 1 }],
  ingredients: [], groups: [sauce],
};
const cola: MenuProduct = {
  id: 'p-cola', category_id: 'c2', code: null, name: 'Cola 0,33 l', description: null,
  base_price_cents: 250, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [], ingredients: [], groups: [],
};
const byId = new Map([doener, cola].map((p) => [p.id, p]));

const base = { variantId: null, optionIds: [], removedIngredientIds: [], quantity: 1, note: '' };
let lines: CartLine[] = [];
lines = addLine(lines, { ...base, productId: doener.id, variantId: 'k', optionIds: ['kn'] });
lines = addLine(lines, { ...base, productId: cola.id });
const doenerKey = lines[0]!.key;

describe('submitErrorView', () => {
  it('ağ hatası: tekrar gönder önerilir, hiçbir satır işaretlenmez', () => {
    const v = submitErrorView(new RpcError('network'), lines, byId);
    expect(v).toMatchObject({ key: 'network', suggest: 'retry', badLineKeys: [], refreshMenu: false });
  });

  it('tükendi: detaydaki ürünün satırı işaretlenir, sil önerilir, menü tazelenir', () => {
    const v = submitErrorView(new RpcError('product_sold_out', doener.id), lines, byId);
    expect(v).toMatchObject({ key: 'product_sold_out', suggest: 'remove', refreshMenu: true });
    expect(v.badLineKeys).toEqual([doenerKey]);
  });

  it('varyant eksik: ilgili satırda düzenle önerilir', () => {
    const v = submitErrorView(new RpcError('variant_required', doener.id), lines, byId);
    expect(v).toMatchObject({ key: 'variant_required', suggest: 'edit', refreshMenu: false });
    expect(v.badLineKeys).toEqual([doenerKey]);
  });

  it('seçim grubu hatası: detay grup kimliğidir, o grubu taşıyan satır işaretlenir', () => {
    const v = submitErrorView(new RpcError('option_group_min', sauce.id), lines, byId);
    expect(v).toMatchObject({ key: 'option_group_min', suggest: 'edit' });
    expect(v.badLineKeys).toEqual([doenerKey]);
  });

  it('eşleşmeyen detay: satır işaretlenmez ama hata anahtarı korunur', () => {
    const v = submitErrorView(new RpcError('product_sold_out', 'yok-boyle-urun'), lines, byId);
    expect(v).toMatchObject({ key: 'product_sold_out', suggest: 'remove' });
    expect(v.badLineKeys).toEqual([]);
  });

  it('RpcError olmayan hata bilinmeyene düşer', () => {
    const v = submitErrorView(new Error('boom'), lines, byId);
    expect(v).toMatchObject({ key: 'unknown', suggest: null, badLineKeys: [], refreshMenu: false });
  });

  it('diğer iş kuralı hataları yalnız mesaj gösterir', () => {
    const v = submitErrorView(new RpcError('table_inactive'), lines, byId);
    expect(v).toMatchObject({ key: 'table_inactive', suggest: null, badLineKeys: [] });
  });
});

describe('errorKey', () => {
  it('RPC hatasının anahtarını döndürür', () => {
    expect(errorKey(new RpcError('open_orders_in_kitchen'))).toBe('open_orders_in_kitchen');
  });

  it('tanınmayan her şey bilinmeyene düşer', () => {
    expect(errorKey(new Error('boom'))).toBe('unknown');
    expect(errorKey(undefined)).toBe('unknown');
  });
});
