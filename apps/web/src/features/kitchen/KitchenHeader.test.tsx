import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';

const products = [
  { id: 'p1', is_sold_out: false },
  { id: 'p2', is_sold_out: true },
  { id: 'p3', is_sold_out: true },
];

const { menu } = vi.hoisted(() => ({ menu: { value: [] as { id: string; is_sold_out: boolean }[] } }));
vi.mock('../../data/menu', () => ({
  useMenu: () => ({ categories: [], products: menu.value, byId: new Map() }),
}));

import { KitchenHeader } from './KitchenHeader';

/**
 * M4 tasarım kapısı O10 — mutfak vardiya boyunca bu ekrana bakıyor; "kaç ürün tükendi"
 * bilgisi paneli açmadan görünmeli (D10 de burada kapanıyor).
 */
describe('KitchenHeader — tükendi sayacı', () => {
  it('tükendi ürün varsa düğmede sayı görünür', () => {
    menu.value = products;
    render(<KitchenHeader onOpenSoldOut={() => {}} />);
    expect(screen.getByRole('button', { name: /Tükendi/ })).toHaveTextContent('2');
  });

  it('sayı ekran okuyucuya tam cümleyle duyurulur', () => {
    menu.value = products;
    render(<KitchenHeader onOpenSoldOut={() => {}} />);
    expect(screen.getByText('2 ürün tükendi')).toBeInTheDocument();
  });

  it('hiç tükendi yoksa rozet hiç çizilmez (sıfır gürültü)', () => {
    menu.value = [{ id: 'p1', is_sold_out: false }];
    render(<KitchenHeader onOpenSoldOut={() => {}} />);
    expect(screen.getByRole('button', { name: /Tükendi/ })).not.toHaveTextContent(/\d/);
  });
});
