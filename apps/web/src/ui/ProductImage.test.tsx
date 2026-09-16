import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductImage } from './ProductImage';

beforeEach(() => vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co'));

describe('ProductImage', () => {
  it('görsel yoksa yer tutucu ürün numarasını gösterir, img yok', () => {
    const { container } = render(<ProductImage path={null} size="thumb" code="71a" />);
    const placeholder = screen.getByTestId('product-image-placeholder');
    expect(placeholder).toHaveAttribute('aria-hidden', 'true');
    expect(placeholder).toHaveTextContent('71a');
    expect(container.querySelector('img')).toBeNull();
  });

  it('görsel varsa küçük sürüm src ile lazy yüklenir', () => {
    const { container } = render(<ProductImage path="products/p1-1700.webp" size="thumb" code="05" />);
    const img = container.querySelector('img') as HTMLImageElement;
    expect(img.src.endsWith('/products/p1-1700-thumb.webp')).toBe(true);
    expect(img.getAttribute('loading')).toBe('lazy');
  });

  it('dekoratiftir: alt boştur, ürün adı ekran okuyucuda tekrarlanmaz', () => {
    const { container } = render(<ProductImage path="products/p1-1700.webp" size="thumb" code="05" />);
    expect(container.querySelector('img')).toHaveAttribute('alt', '');
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('img yüklenemezse yer tutucuya düşer', () => {
    const { container } = render(<ProductImage path="products/p1-1700.webp" size="full" code="05" />);
    fireEvent.error(container.querySelector('img') as HTMLImageElement);
    expect(screen.getByTestId('product-image-placeholder')).toBeInTheDocument();
  });
});
