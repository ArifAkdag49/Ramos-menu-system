import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductImage } from './ProductImage';

beforeEach(() => vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co'));

describe('ProductImage', () => {
  it('görsel yoksa yer tutucu ürün numarasını gösterir, img yok', () => {
    render(<ProductImage path={null} size="thumb" code="71a" alt="Köfte Sandwich" />);
    const placeholder = screen.getByTestId('product-image-placeholder');
    expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    expect(placeholder).toHaveTextContent('71a');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('görsel varsa küçük sürüm src ile lazy yüklenir', () => {
    render(<ProductImage path="products/p1-1700.webp" size="thumb" code="05" alt="Drehspieß Sandwich" />);
    const img = screen.getByRole('img', { hidden: true }) as HTMLImageElement;
    expect(img.src.endsWith('/products/p1-1700-thumb.webp')).toBe(true);
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('img yüklenemezse yer tutucuya düşer', () => {
    render(<ProductImage path="products/p1-1700.webp" size="full" code="05" alt="Drehspieß Sandwich" />);
    const img = screen.getByRole('img', { hidden: true });
    fireEvent.error(img);
    expect(screen.getByTestId('product-image-placeholder')).toBeInTheDocument();
  });
});
