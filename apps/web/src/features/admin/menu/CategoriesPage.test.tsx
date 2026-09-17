import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { AdminCategory } from '../../../data/adminMenu';

// Canlı `categories` tablosuna yazılmaz: veri kancası ve kayıt çağrısı sahte.
const h = vi.hoisted(() => ({
  categories: [] as AdminCategory[],
  upsert: vi.fn(),
}));

vi.mock('../../../data/adminMenu', () => ({
  useAdminMenu: () => ({ categories: h.categories, isPending: false }),
}));
vi.mock('./adminMenuApi', () => ({ upsertCategory: h.upsert }));

import { CategoriesPage } from './CategoriesPage';

const show = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <CategoriesPage />
    </QueryClientProvider>,
  );

beforeEach(() => {
  h.upsert.mockReset().mockResolvedValue('c1');
  h.categories = [
    {
      id: 'c1',
      slug: 'suppen',
      name_de: 'Suppen',
      name_tr: 'Çorbalar',
      name_en: 'Soups',
      name_ar: null,
      is_beverage: false,
      sort: 10,
      is_active: true,
    },
  ];
});

describe('<CategoriesPage />', () => {
  it('EN ve AR ad alanları; AR sağdan sola', () => {
    show();
    const row = within(screen.getByRole('listitem'));
    expect(row.getByLabelText(/İngilizce ad/)).toHaveValue('Soups');
    const ar = row.getByLabelText(/Arapça ad/);
    expect(ar).toHaveValue('');
    expect(ar).toHaveAttribute('dir', 'rtl');
    expect(ar).toHaveAttribute('lang', 'ar');
  });

  it('kaydedince EN/AR gönderilir; boş alan null olur', async () => {
    const user = userEvent.setup();
    show();
    const row = within(screen.getByRole('listitem'));
    await user.type(row.getByLabelText(/Arapça ad/), ' شوربات ');
    await user.clear(row.getByLabelText(/İngilizce ad/));
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(h.upsert).toHaveBeenCalledWith({
      id: 'c1',
      name_de: 'Suppen',
      name_tr: 'Çorbalar',
      name_en: null,
      name_ar: 'شوربات',
      is_beverage: false,
      is_active: true,
      sort: 10,
    });
  });
});
