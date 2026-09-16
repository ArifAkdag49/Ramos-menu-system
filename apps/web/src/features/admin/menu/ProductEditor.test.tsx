import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminCategory, AdminProduct } from '../../../data/adminMenu';
import i18n from '../../../i18n';

// Gerçek modülden `MenuApiError` korunur: editör hatayı `instanceof` ile tanır, sahte bir sınıf
// koyulsaydı kod çakışması testi yanlış dalı ölçerdi.
const api = vi.hoisted(() => ({
  upsertProduct: vi.fn(),
  saveVariants: vi.fn(),
  setProductIngredients: vi.fn(),
  setProductGroups: vi.fn(),
  archiveProduct: vi.fn(),
  duplicateProduct: vi.fn(),
}));

vi.mock('./adminMenuApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./adminMenuApi')>()),
  ...api,
}));

import { MenuApiError } from './adminMenuApi';
import { ProductEditor } from './ProductEditor';

const category: AdminCategory = {
  id: 'c1',
  slug: 'doener',
  name_de: 'Drehspieß',
  name_tr: 'Döner',
  is_beverage: false,
  sort: 10,
  is_active: true,
};

const withVariants: AdminProduct = {
  id: 'p05',
  slug: 'drehspiess-sandwich',
  category_id: 'c1',
  code: '05',
  name: 'Drehspieß Sandwich',
  description: null,
  base_price_cents: null,
  allergens: null,
  image_path: null,
  is_active: true,
  is_sold_out: false,
  sort: 10,
  archived_at: null,
  product_variants: [
    { id: 'v-k', name_de: 'Kalb', name_tr: 'Dana', price_cents: 850, is_default: true, sort: 10, is_active: true },
  ],
  product_ingredients: [],
  product_option_groups: [],
};

const flat: AdminProduct = {
  ...withVariants,
  id: 'p02',
  slug: 'suppe',
  code: '02',
  name: 'Kuttelsuppe',
  base_price_cents: 690,
  product_variants: [],
};

const show = (product: AdminProduct) =>
  render(
    <ProductEditor
      open
      product={product}
      categories={[category]}
      ingredients={[]}
      groups={[]}
      allergenLegend={[]}
      onClose={vi.fn()}
      onSaved={vi.fn()}
    />,
  );

const saveButton = () => screen.getByRole('button', { name: 'Kaydet' });

describe('ProductEditor', () => {
  // Admin ekranı restoranda Türkçe kullanılır; beklenen metinler TR sözlüğünden.
  beforeAll(() => {
    void i18n.changeLanguage('tr');
  });

  beforeEach(() => {
    vi.clearAllMocks();
    api.upsertProduct.mockResolvedValue('p05');
    api.saveVariants.mockResolvedValue(undefined);
    api.setProductIngredients.mockResolvedValue(undefined);
    api.setProductGroups.mockResolvedValue(undefined);
    api.archiveProduct.mockResolvedValue(undefined);
  });

  it('varyantlı üründe taban fiyat alanı yok, varyant tablosu var', () => {
    show(withVariants);
    expect(screen.queryByLabelText('Taban fiyat')).toBeNull();
    expect(screen.getByDisplayValue('Kalb')).toBeInTheDocument();
    expect(screen.getByDisplayValue('8,50')).toBeInTheDocument();
  });

  it('varyantsız üründe taban fiyat alanı görünür', () => {
    show(flat);
    expect(screen.getByLabelText('Taban fiyat')).toHaveValue('6,90');
  });

  it('“7,5” girilince kayda 750 kuruş gider', async () => {
    const user = userEvent.setup();
    show(withVariants);
    const price = screen.getByDisplayValue('8,50');
    await user.clear(price);
    await user.type(price, '7,5');
    await user.click(saveButton());

    expect(api.saveVariants).toHaveBeenCalledWith('p05', [
      expect.objectContaining({ id: 'v-k', price_cents: 750 }),
    ]);
    // Varyantlı üründe taban fiyat null yazılır: iki fiyat kaynağı kalmaz.
    expect(api.upsertProduct).toHaveBeenCalledWith(expect.objectContaining({ base_price_cents: null }));
  });

  it('numara çakışmasında hata numara alanının altında görünür', async () => {
    const user = userEvent.setup();
    api.upsertProduct.mockRejectedValue(new MenuApiError('23505', 'duplicate key'));
    show(withVariants);
    await user.click(saveButton());

    const message = await screen.findByText('Bu numara başka üründe kullanılıyor');
    expect(message).toBeInTheDocument();
    expect(screen.getByLabelText('Numara')).toHaveAttribute('aria-invalid', 'true');
  });

  it('Arşivle önce onay ister, sonra çağırır', async () => {
    const user = userEvent.setup();
    show(withVariants);

    await user.click(screen.getByRole('button', { name: 'Arşivle' }));
    expect(api.archiveProduct).not.toHaveBeenCalled();
    expect(screen.getByText(/menüden kalksın mı/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Arşivle' }));
    expect(api.archiveProduct).toHaveBeenCalledWith('p05');
  });
});
