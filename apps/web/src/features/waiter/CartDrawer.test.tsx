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

vi.mock('../../data/menu', () => ({
  useMenu: () => ({ categories: [], products: [cola], byId: new Map([[cola.id, cola]]) }),
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
