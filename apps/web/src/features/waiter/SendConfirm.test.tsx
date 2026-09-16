import type { MenuProduct } from '@ramos/shared';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';

const h = vi.hoisted(() => ({ send: vi.fn(), isPending: false }));
vi.mock('../../data/orders', () => ({
  useSubmitOrder: () => ({ send: h.send, isPending: h.isPending }),
}));

import { SendConfirm } from './SendConfirm';
import { useCart } from './cartStore';

const doener: MenuProduct = {
  id: 'p05', category_id: 'c', code: '05', name: 'Drehspieß Sandwich', description: null,
  base_price_cents: null, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [{ id: 'k', name_de: 'Kalb', name_tr: 'Dana', price_cents: 850, is_default: true, sort: 1 }],
  ingredients: [], groups: [],
};
const cola: MenuProduct = {
  id: 'p-cola', category_id: 'c2', code: null, name: 'Cola 0,33 l', description: null,
  base_price_cents: 250, allergens: null, image_path: null, is_sold_out: false, sort: 1,
  variants: [], ingredients: [], groups: [],
};
const byId = new Map([doener, cola].map((p) => [p.id, p]));

beforeAll(() => {
  void i18n.changeLanguage('tr');
});
beforeEach(() => {
  h.isPending = false;
  h.send.mockReset();
  useCart.setState({ carts: {}, notes: {}, pendingOrderId: {} });
  useCart.getState().add('t1', {
    productId: 'p05', variantId: 'k', optionIds: [], removedIngredientIds: [], quantity: 2, note: '',
  });
  useCart.getState().add('t1', {
    productId: 'p-cola', variantId: null, optionIds: [], removedIngredientIds: [], quantity: 1, note: '',
  });
});

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <MemoryRouter>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MemoryRouter>
  );
  return render(
    <SendConfirm
      tableId="t1"
      tableName="Masa 3"
      lines={useCart.getState().carts.t1!}
      byId={byId}
      locale="tr"
      onBack={vi.fn()}
      onEditLine={vi.fn()}
    />,
    { wrapper },
  );
}

describe('SendConfirm', () => {
  /** M1: "kalem"/"Position" SATIR demek; 2 adet + 1 adet iki kalemdir, üç değil. */
  it('özet satır sayar, adet toplamaz', () => {
    show();
    expect(screen.getByText('2 kalem')).toBeInTheDocument();
    expect(screen.queryByText('3 kalem')).not.toBeInTheDocument();
  });

  /** R74(a): gönderim uçarken panelden çıkılamaz. */
  it('gönderim uçarken kapat düğmesi kilitlidir', () => {
    h.isPending = true;
    show();
    expect(screen.getByRole('button', { name: 'Geri' })).toBeDisabled();
  });

  it('boştayken kapatılabilir', () => {
    show();
    expect(screen.getByRole('button', { name: 'Geri' })).toBeEnabled();
  });
});
