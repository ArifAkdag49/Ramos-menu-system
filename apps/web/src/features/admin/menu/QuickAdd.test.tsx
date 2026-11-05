import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdminIngredient, AdminOptionGroup } from '../../../data/adminMenu';
import i18n from '../../../i18n';

const api = vi.hoisted(() => ({
  upsertIngredient: vi.fn(),
  upsertGroup: vi.fn(),
  upsertOption: vi.fn(),
}));

vi.mock('./adminMenuApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./adminMenuApi')>()),
  ...api,
}));

import { MenuApiError } from './adminMenuApi';
import { GroupOptionsQuickAdd, QuickAddGroup, QuickAddIngredient } from './QuickAdd';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const onion: AdminIngredient = { id: 'i1', slug: 'zwiebeln', name_de: 'Zwiebeln', name_tr: 'Soğan', is_active: true };

const sauces: AdminOptionGroup = {
  id: 'g1',
  slug: 'g-sosse',
  admin_label: 'Soßen',
  name_de: 'Soße',
  name_tr: 'Sos',
  min_select: 0,
  max_select: 3,
  ticket_format: 'label_values',
  sort: 10,
  is_active: true,
  options: [
    { id: 'o1', name_de: 'Knoblauch', name_tr: 'Sarımsaklı', price_delta_cents: 0, is_default: false, is_exclusive: false, sort: 10, is_active: true },
    { id: 'o2', name_de: 'Scharf', name_tr: 'Acı', price_delta_cents: 50, is_default: false, is_exclusive: false, sort: 20, is_active: true },
  ],
};

describe('QuickAdd', () => {
  beforeAll(() => {
    void i18n.changeLanguage('tr');
  });
  beforeEach(() => vi.clearAllMocks());

  it('yeni malzeme oluşturulur ve ürüne seçilir', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    api.upsertIngredient.mockResolvedValue('i-new');
    render(<QuickAddIngredient ingredients={[onion]} onCreated={onCreated} />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Listede yok — yeni malzeme ekle' }));
    await user.type(screen.getByLabelText('Almanca ad'), '  Gurken ');
    await user.type(screen.getByLabelText('Türkçe ad'), 'Salatalık');
    await user.click(screen.getByRole('button', { name: 'Ekle ve seç' }));

    expect(api.upsertIngredient).toHaveBeenCalledWith({ name_de: 'Gurken', name_tr: 'Salatalık', is_active: true });
    expect(onCreated).toHaveBeenCalledWith('i-new');
    // Panel kapanır, düğme geri gelir.
    expect(screen.getByRole('button', { name: 'Listede yok — yeni malzeme ekle' })).toBeInTheDocument();
  });

  it('aynı adlı malzeme kaydedilmez', async () => {
    const user = userEvent.setup();
    render(<QuickAddIngredient ingredients={[onion]} onCreated={vi.fn()} />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Listede yok — yeni malzeme ekle' }));
    await user.type(screen.getByLabelText('Almanca ad'), 'zwiebeln{Enter}');
    expect(screen.getByText('Bu ad zaten var')).toBeInTheDocument();
    expect(api.upsertIngredient).not.toHaveBeenCalled();
  });

  it('gruba fiyatlı seçenek eklenir; sunucudaki çakışma söylenir', async () => {
    const user = userEvent.setup();
    api.upsertOption.mockRejectedValueOnce(new MenuApiError('23505', 'duplicate')).mockResolvedValueOnce('o-new');
    render(<GroupOptionsQuickAdd group={sauces} />, { wrapper });
    expect(screen.getByText('Knoblauch · Scharf +0,50 €')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bu gruba seçenek ekle' }));
    await user.type(screen.getByLabelText('Almanca ad'), 'BBQ-Soße');
    await user.type(screen.getByLabelText('Fiyat farkı'), '0,50');
    await user.click(screen.getByRole('button', { name: 'Seçeneği ekle' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Bu ad zaten var');

    await user.click(screen.getByRole('button', { name: 'Seçeneği ekle' }));
    expect(api.upsertOption).toHaveBeenLastCalledWith({
      group_id: 'g1',
      name_de: 'BBQ-Soße',
      name_tr: null,
      price_delta_cents: 50,
      is_default: false,
      is_exclusive: false,
      sort: 30,
      is_active: true,
    });
  });

  it('hatalı fiyatla seçenek eklenmez', async () => {
    const user = userEvent.setup();
    render(<GroupOptionsQuickAdd group={sauces} />, { wrapper });
    await user.click(screen.getByRole('button', { name: 'Bu gruba seçenek ekle' }));
    await user.type(screen.getByLabelText('Almanca ad'), 'Mango');
    await user.type(screen.getByLabelText('Fiyat farkı'), 'iki');
    await user.click(screen.getByRole('button', { name: 'Seçeneği ekle' }));
    expect(screen.getByText('Fiyat hatalı — örnek: 7,50')).toBeInTheDocument();
    expect(api.upsertOption).not.toHaveBeenCalled();
  });

  it('zorunlu tek seçimli yeni grup ilk seçeneğiyle oluşturulur ve ürüne eklenir', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    api.upsertGroup.mockResolvedValue('g-new');
    api.upsertOption.mockResolvedValue('o-new');
    render(<QuickAddGroup groups={[sauces]} onCreated={onCreated} />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Listede yok — yeni seçim grubu' }));
    await user.type(screen.getByLabelText('Grup adı (Almanca)'), 'Brot');
    await user.selectOptions(screen.getByLabelText('Tür'), 'single');
    await user.type(screen.getByLabelText('Almanca ad'), 'Fladenbrot');
    await user.click(screen.getByRole('button', { name: 'Grubu oluştur ve ekle' }));

    expect(api.upsertGroup).toHaveBeenCalledWith({
      admin_label: 'Brot',
      name_de: 'Brot',
      name_tr: null,
      min_select: 1,
      max_select: 1,
      ticket_format: 'values_only',
      sort: 20,
      is_active: true,
    });
    expect(api.upsertOption).toHaveBeenCalledWith(
      expect.objectContaining({ group_id: 'g-new', name_de: 'Fladenbrot', is_default: true, price_delta_cents: 0 }),
    );
    expect(onCreated).toHaveBeenCalledWith('g-new');
  });
});
