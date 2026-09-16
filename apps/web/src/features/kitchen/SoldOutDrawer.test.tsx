import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';

const products = [
  { id: 'p1', category_id: 'c1', code: '05', name: 'Drehspieß Sandwich', is_sold_out: false },
  { id: 'p2', category_id: 'c1', code: '12', name: 'Pizza Mix', is_sold_out: true },
  { id: 'p3', category_id: 'c2', code: null, name: 'Cola', is_sold_out: false },
];
const categories = [
  { id: 'c1', name_de: 'Essen', name_tr: 'Yemek', is_beverage: false, sort: 1 },
  { id: 'c2', name_de: 'Getränke', name_tr: 'İçecekler', is_beverage: true, sort: 2 },
];

const mutate = vi.fn();
vi.mock('../../data/menu', () => ({ useMenu: () => ({ categories, products, byId: new Map() }) }));
vi.mock('../../data/orders', () => ({ useSetSoldOut: () => ({ mutate }) }));

import { SoldOutDrawer } from './SoldOutDrawer';

describe('SoldOutDrawer', () => {
  it('ürünleri listeler ve arama ile filtreler', async () => {
    render(<SoldOutDrawer open onClose={() => {}} />);
    expect(screen.getByText(/Drehspieß Sandwich/)).toBeInTheDocument();
    expect(screen.getByText(/Cola/)).toBeInTheDocument();

    await userEvent.type(screen.getByRole('searchbox'), 'pizza');
    expect(screen.queryByText(/Cola/)).not.toBeInTheDocument();
    expect(screen.getByText(/Pizza Mix/)).toBeInTheDocument();
  });

  it('tükendi olan ürün basılı (aria-pressed) görünür', () => {
    render(<SoldOutDrawer open onClose={() => {}} />);
    expect(screen.getByRole('button', { name: /Pizza Mix/ })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Drehspieß Sandwich/ })).toHaveAttribute('aria-pressed', 'false');
  });

  it('ürüne dokununca tükendi anahtarı ters çevrilir', async () => {
    render(<SoldOutDrawer open onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Drehspieß Sandwich/ }));
    expect(mutate).toHaveBeenCalledWith({ productId: 'p1', soldOut: true });
  });
});

/** M4 tasarım kapısı O10 — panel tüm mutfak ekranını kapatıyordu, sayaç ve süzgeç yoktu. */
describe('SoldOutDrawer — M4 tasarım kapısı', () => {
  it('"Yalnız tükendiler" süzgeci yalnız tükendi ürünleri bırakır', async () => {
    render(<SoldOutDrawer open onClose={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /Yalnız tükendiler/ }));
    expect(screen.getByText(/Pizza Mix/)).toBeInTheDocument();
    expect(screen.queryByText(/Drehspieß Sandwich/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Cola/)).not.toBeInTheDocument();
  });

  it('panelde tükendi sayacı var', () => {
    render(<SoldOutDrawer open onClose={() => {}} />);
    expect(screen.getByText('1 ürün tükendi')).toBeInTheDocument();
  });

  it('ürün listesi kendi yüksekliği sınırlı kutuda kaydırılır — panel ekranı kaplamaz', () => {
    render(<SoldOutDrawer open onClose={() => {}} />);
    const list = screen.getByTestId('sold-out-list');
    expect(list.className).toMatch(/max-h-\[\d+dvh\]/);
    expect(list.className).toContain('overflow-y-auto');
  });
});
