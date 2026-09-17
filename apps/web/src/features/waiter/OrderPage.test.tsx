import type { MenuProduct } from '@ramos/shared';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../i18n';

const product = (over: Partial<MenuProduct> & { id: string; name: string }): MenuProduct => ({
  category_id: 'c1', code: null, description: null, base_price_cents: 750, allergens: null,
  image_path: null, is_sold_out: false, sort: 1, variants: [], ingredients: [], groups: [], ...over,
});

// Kapı sahnesindeki gerçek ürünler: aynı önekle başlayan altı ürün ve en uzun Almanca ad.
const sandwich = product({ id: 'p05', code: '05', name: 'Drehspieß Sandwich', sort: 1 });
const teller = product({ id: 'p08', code: '08', name: 'Drehspieß Teller', sort: 2 });
const uzun = product({ id: 'pM3', code: 'M3', name: 'M3 Lahmacun Menü mit Drehspießfleisch', sort: 3 });
const tukendi = product({ id: 'p02', code: '02', name: 'Kuttelsuppe / İşkembe Çorbası', is_sold_out: true, sort: 4 });

const menu = {
  isLoading: false,
  categories: [{ id: 'c1', name_de: 'Suppen', name_tr: 'Çorbalar', is_beverage: false, sort: 1 }],
  products: [sandwich, teller, uzun, tukendi],
  byId: new Map([sandwich, teller, uzun, tukendi].map((p) => [p.id, p])),
};
const state = { isLoading: false };

// `isLoading` react-query'nin ilk yükleme bayrağıdır: elde hiç veri YOKKEN true olur. Sahte de
// aynısını yapar, yoksa gerçekte hiç oluşmayan bir durum test edilirdi.
vi.mock('../../data/menu', () => ({
  useMenu: () =>
    state.isLoading
      ? { isLoading: true, categories: [], products: [], byId: new Map() }
      : menu,
}));
vi.mock('../../data/tables', () => ({ useTableOverview: () => [] }));
vi.mock('../../data/settings', () => ({ useSettings: () => undefined }));
vi.mock('../../lib/online', () => ({ useOnline: () => true }));

import { OrderPage } from './OrderPage';
import { useCart } from './cartStore';

const show = () =>
  render(
    <MemoryRouter initialEntries={['/waiter/table/t1/order']}>
      <Routes>
        <Route path="/waiter/table/:tableId/order" element={<OrderPage />} />
      </Routes>
    </MemoryRouter>,
  );

const row = (name: string) => screen.getByText(name).closest('li') as HTMLElement;

beforeEach(() => {
  state.isLoading = false;
});
afterEach(async () => {
  await i18n.changeLanguage('tr');
});

/**
 * Y1: menü gelene kadar ekran bomboştu (`m3-order-loading-390.png`: arama kutusu + siyah ekran).
 * Masa ızgarasında iskelet vardı, burada yoktu — garson ekranı "bozuk" sanıp geri çıkıyordu.
 */
describe('OrderPage — menü yükleniyor (Y1)', () => {
  it('ilk yüklemede ürün iskeleti gösterir', () => {
    state.isLoading = true;
    show();
    expect(screen.getByTestId('menu-skeleton')).toBeInTheDocument();
  });

  it('menü gelince iskelet kaybolur', () => {
    show();
    expect(screen.queryByTestId('menu-skeleton')).not.toBeInTheDocument();
    expect(screen.getByText('Drehspieß Sandwich')).toBeInTheDocument();
  });
});

/**
 * K1 (KRİTİK): DE'de "Hinzufügen" düğmesi ad sütununu yiyordu (`05 Drehspie…`). Menüde
 * `Drehspieß Sandwich / Teller / Dürüm / Box / Mini / Mega` var — hepsi aynı görünüyordu.
 */
describe('OrderPage — ürün adı kesilmez (K1)', () => {
  it('ad `truncate` değil, iki satıra sarar', () => {
    show();
    const name = screen.getByText('M3 Lahmacun Menü mit Drehspießfleisch');
    expect(name.className).toContain('line-clamp-2');
    expect(name.className).not.toContain('truncate');
  });

  it('düğme adın yanında değil, fiyatla aynı alt satırdadır — ad satırın tamamını alır', async () => {
    await i18n.changeLanguage('de');
    show();
    const actions = within(row('Drehspieß Sandwich')).getByTestId('product-row-actions');
    expect(within(actions).getByRole('button', { name: /Hinzufügen/ })).toBeInTheDocument();
    expect(actions).not.toContainElement(screen.getByText('Drehspieß Sandwich'));
  });

  it('Almanca en uzun düğme metniyle bile ad tam yazılır', async () => {
    await i18n.changeLanguage('de');
    show();
    expect(screen.getByText('M3 Lahmacun Menü mit Drehspießfleisch')).toBeInTheDocument();
    expect(screen.queryByText(/…$/)).not.toBeInTheDocument();
  });
});

/**
 * Y3: `opacity-50` tükendi satırını 2,74:1'e düşürüyordu; satırda düğme de kalmadığı için satır
 * "eksik render" gibi duruyordu. Artık net bir rozet var ve satır tam opaklıkta.
 */
describe('OrderPage — tükendi ürün (Y3)', () => {
  it('satırda opaklık kırpması yok', () => {
    show();
    expect(row('Kuttelsuppe / İşkembe Çorbası').className).not.toMatch(/opacity-/);
  });

  it('sağda "Tükendi" rozeti durur, ekleme düğmesi yoktur', () => {
    show();
    const li = row('Kuttelsuppe / İşkembe Çorbası');
    expect(within(li).getByText('Tükendi')).toBeInTheDocument();
    expect(within(li).queryByRole('button')).not.toBeInTheDocument();
  });

  it('fiyat tükendi etiketiyle gizlenmez — garson fiyatı hâlâ okuyabilir', () => {
    show();
    expect(within(row('Kuttelsuppe / İşkembe Çorbası')).getByText('7,50 €')).toBeInTheDocument();
  });
});

/** O7: kategori şeridi rolsüz bir `div`'de `aria-label` taşıyordu; etiket duyurulmuyordu. */
describe('OrderPage — kategori şeridi (O7)', () => {
  it('etiketli bir grup olarak duyurulur', () => {
    show();
    expect(screen.getByRole('group', { name: 'Kategoriler' })).toBeInTheDocument();
  });
});

/**
 * Ekstra ücretli sepet satırı "Düzenle" ile açılınca ekstralar panele gelmeli; aksi halde
 * "Güncelle" onları sessizce siler ve mutfağa/fişe/hesaba ekstrasız gider.
 */
describe('OrderPage — sepetten düzenleme ekstra ücreti korur', () => {
  afterEach(() => {
    useCart.setState({ carts: {}, notes: {}, pendingOrderId: {} });
  });

  it('ekstra panelde çip olarak durur ve Güncelle sonrası satırda kalır', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    const cheese = [{ label: 'ekstra peynir', cents: 100 }];
    useCart.setState({ carts: {}, notes: {}, pendingOrderId: {} });
    useCart.getState().add('t1', {
      productId: 'p05', variantId: null, optionIds: [], removedIngredientIds: [], quantity: 1, note: '', extraCharges: cheese,
    });
    show();
    await user.click(screen.getByRole('button', { name: /Sepet$/ }));
    await user.click(screen.getByRole('button', { name: 'Düzenle' }));
    expect(screen.getByRole('button', { name: /^ekstra peynir 1,00\s€ ekstrasını kaldır$/ })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /^Güncelle/ }));
    expect(useCart.getState().carts.t1).toEqual([expect.objectContaining({ productId: 'p05', extraCharges: cheese })]);
  });
});

/** Satıra dokunmak ürün kartını açar; "Ekle" ise kart açmadan doğrudan sepete ekler. */
describe('OrderPage — satır ürün kartını açar', () => {
  it('satıra dokununca kart (dialog) açılır', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    show();
    await user.click(within(row('Drehspieß Sandwich')).getByRole('button', { name: /ürün kartını aç/ }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('"Ekle" kart açmaz', async () => {
    const user = (await import('@testing-library/user-event')).default.setup();
    show();
    await user.click(within(row('Drehspieß Teller')).getByRole('button', { name: /^Ekle$/ }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
