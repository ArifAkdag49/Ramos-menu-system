import type { MenuProduct } from '@ramos/shared';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';

const cola: MenuProduct = {
  id: 'p-cola', category_id: 'c', code: null, name: 'Cola 0,33 l', description: null,
  base_price_cents: 250, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [], ingredients: [], groups: [],
};

// Kapı sahnesindeki ürün: iki malzemesi çıkarılmış dana döner (`m3-cart-full-390.png`).
const doener: MenuProduct = {
  id: 'p05', category_id: 'c', code: '05', name: 'Drehspieß Sandwich', description: null,
  base_price_cents: null, allergens: null, image_path: null, is_sold_out: false, sort: 2,
  variants: [
    { id: 'h', name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: 750, is_default: true, sort: 1 },
    { id: 'k', name_de: 'Kalb', name_tr: 'Dana', price_cents: 850, is_default: false, sort: 2 },
  ],
  ingredients: [
    { id: 'zw', name_de: 'Zwiebeln', name_tr: 'Soğan', sort: 1 },
    { id: 'to', name_de: 'Tomaten', name_tr: 'Domates', sort: 2 },
  ],
  groups: [],
};

vi.mock('../../data/menu', () => ({
  useMenu: () => ({
    isLoading: false,
    categories: [],
    products: [cola, doener],
    byId: new Map([cola, doener].map((p) => [p.id, p])),
  }),
}));
vi.mock('../../lib/online', () => ({ useOnline: () => true }));
vi.mock('./SendConfirm', () => ({ SendConfirm: () => <div>onay</div> }));

import { CartDrawer } from './CartDrawer';
import { useCart } from './cartStore';

beforeAll(() => {
  void i18n.changeLanguage('tr');
});
beforeEach(() => {
  useCart.setState({ carts: {}, notes: {}, pendingOrderId: {} });
});

const open = () =>
  render(
    <CartDrawer tableId="t1" tableName="Masa 3" locale="tr" open onClose={vi.fn()} onEditLine={vi.fn()} />,
  );

/**
 * R75: admin bir ürünü arşivlerse sepetteki satır menüde bulunamaz. Eski davranışta satır hiç
 * çizilmiyordu ama `toSubmitItems` onu yine de gönderiyordu: sunucu `product_*` hatası dönüyor,
 * hata ilgili satırı işaretliyor ama satır ekranda olmadığı için "Sil" düğmesi hiç görünmüyordu.
 * Tek çıkış `localStorage`'ı temizlemekti.
 */
describe('CartDrawer — menüden düşmüş ürün (R75)', () => {
  it('bilinmeyen ürünlü satır gizlenmez, açıklamasıyla çizilir', () => {
    useCart.getState().add('t1', {
      productId: 'p-arsivlenmis', variantId: null, optionIds: [], removedIngredientIds: [], quantity: 1, note: '',
    });
    open();
    expect(screen.getByText(/menüden kalktı/i)).toBeInTheDocument();
  });

  it('satırın "Sil" düğmesi onu sepetten çıkarır', async () => {
    useCart.getState().add('t1', {
      productId: 'p-arsivlenmis', variantId: null, optionIds: [], removedIngredientIds: [], quantity: 1, note: '',
    });
    useCart.getState().add('t1', {
      productId: cola.id, variantId: null, optionIds: [], removedIngredientIds: [], quantity: 1, note: '',
    });
    open();

    const missing = screen.getByTestId('missing-product-line');
    await userEvent.click(within(missing).getByRole('button', { name: 'Sil' }));

    expect(useCart.getState().carts.t1).toHaveLength(1);
    expect(useCart.getState().carts.t1![0]!.productId).toBe(cola.id);
    expect(screen.queryByText(/menüden kalktı/i)).not.toBeInTheDocument();
  });

  it('bilinen ürünler normal çizilmeye devam eder', () => {
    useCart.getState().add('t1', {
      productId: cola.id, variantId: null, optionIds: [], removedIngredientIds: [], quantity: 1, note: '',
    });
    open();
    expect(screen.getByText('Cola 0,33 l')).toBeInTheDocument();
    expect(screen.queryByTestId('missing-product-line')).not.toBeInTheDocument();
  });
});

/**
 * Y4 (M3 tasarım kapısı): sepet satırında ÇIKAR, "Dana · ÇIKAR Domates, Soğan · …" orta-nokta
 * zincirinin ortasında 14 px gri metindi. Masa detayında aynı bilgi ayrı satırda ve kırmızı
 * gösteriliyordu; oysa **gönderimden önceki son kontrol noktası** sepettir. Artık iki ekran da
 * `ItemLinesView`'ı kullanıyor.
 */
describe('CartDrawer — ÇIKAR ayrı satırda ve danger tonunda (Y4)', () => {
  const withRemoved = () =>
    useCart.getState().add('t1', {
      productId: doener.id, variantId: 'k', optionIds: [], removedIngredientIds: ['zw', 'to'], quantity: 1, note: '',
    });

  it('ÇIKAR kendi satırındadır ve danger tonunu taşır', () => {
    withRemoved();
    open();
    const without = screen.getByText('ÇIKAR Soğan, Domates');
    expect(without).toHaveAttribute('data-tone', 'danger');
    expect(without.className).toContain('text-danger-ink');
  });

  it('varyant ÇIKAR ile aynı satıra gömülmez', () => {
    withRemoved();
    open();
    expect(screen.getByText('Dana')).not.toBe(screen.getByText('ÇIKAR Soğan, Domates'));
    expect(screen.queryByText(/Dana · ÇIKAR/)).not.toBeInTheDocument();
  });

  it('alt satırlar 14 px değildir (§10.6)', () => {
    withRemoved();
    open();
    expect(screen.getByText('ÇIKAR Soğan, Domates').closest('div')?.className ?? '').not.toContain('text-sm');
  });
});

/** O4: yıkıcı olan "Sil" yalnız ikondu, yanındaki "Çoğalt" yazılıydı (§10.3). */
describe('CartDrawer — Sil düğmesi yazılıdır (O4)', () => {
  it('sepet satırındaki Sil düğmesinin görünür yazısı var', () => {
    useCart.getState().add('t1', {
      productId: cola.id, variantId: null, optionIds: [], removedIngredientIds: [], quantity: 1, note: '',
    });
    open();
    const line = screen.getByText('Cola 0,33 l').closest('li') as HTMLElement;
    expect(within(line).getByRole('button', { name: 'Sil' })).toHaveTextContent('Sil');
  });
});
