import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PublicProductSheet } from './PublicProductSheet';
import type { PublicProduct } from './types';

const NBSP = String.fromCharCode(0xa0);

const base: PublicProduct = {
  id: 'p1',
  category_id: 'c1',
  code: '14',
  name: 'Drehspieß Teller',
  description: 'Mit Reis und Salat',
  base_price_cents: 1250,
  image_path: 'products/p1.webp',
  allergens: 'a',
  is_sold_out: false,
  sort: 1,
  variants: [],
};
const legend = [{ code: 'a', de: 'Glutenhaltiges Getreide', tr: 'Glutenli tahıl' }];

const show = (product: PublicProduct, locale: 'de' | 'tr' | 'en' | 'ar' = 'de') =>
  render(
    <PublicProductSheet product={product} legend={legend} locale={locale} onClose={vi.fn()} />,
  );

describe('<PublicProductSheet />', () => {
  it('başlık ürün adı; büyük kare görsel, kod, fiyat, açıklama, alerjen', () => {
    show(base);
    const dialog = within(screen.getByRole('dialog', { name: 'Drehspieß Teller' }));
    const img = screen.getByRole('dialog').querySelector('img');
    expect(img).toHaveAttribute('src', expect.stringContaining('products/p1.webp'));
    expect(img?.parentElement).toHaveClass('aspect-square', 'max-w-sm');
    expect(dialog.getByText('14')).toBeInTheDocument();
    expect(dialog.getByText(/^12,50\s€$/)).toBeInTheDocument();
    expect(dialog.getByText('Mit Reis und Salat')).toBeInTheDocument();
    expect(dialog.getByText('Allergene')).toBeInTheDocument();
    expect(dialog.getByText('Glutenhaltiges Getreide')).toBeInTheDocument();
    expect(dialog.queryByText('Ausverkauft')).not.toBeInTheDocument();
  });

  it('varyantlar: her biri ad ve fiyat, dile göre ad', () => {
    show(
      {
        ...base,
        base_price_cents: null,
        variants: [
          { name_de: 'Groß', name_tr: 'Büyük', price_cents: 1450, sort: 2 },
          { name_de: 'Normal', name_tr: null, price_cents: 1250, sort: 1 },
        ],
      },
      'tr',
    );
    const list = within(screen.getByRole('list', { name: 'Boyutlar' }));
    const items = list.getAllByRole('listitem').map((li) => li.textContent);
    expect(items).toEqual([`Normal12,50${NBSP}€`, `Büyük14,50${NBSP}€`]);
    expect(screen.getByText('Glutenli tahıl')).toBeInTheDocument();
  });

  it('tükenmiş ürün rozetle; sepet düğmesi ya da adet seçici yok', () => {
    show({ ...base, is_sold_out: true, image_path: null }, 'en');
    const dialog = within(screen.getByRole('dialog'));
    expect(dialog.getByText('Sold out')).toBeInTheDocument();
    expect(dialog.getByTestId('product-image-placeholder')).toBeInTheDocument();
    expect(dialog.getAllByRole('button')).toHaveLength(1);
    expect(dialog.getByRole('button', { name: 'Close' })).toBeInTheDocument();
  });
});
