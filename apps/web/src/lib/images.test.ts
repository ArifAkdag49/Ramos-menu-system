import { beforeEach, describe, expect, it, vi } from 'vitest';
import { productImageUrl } from './images';

beforeEach(() => vi.stubEnv('VITE_SUPABASE_URL', 'https://x.supabase.co'));
describe('productImageUrl', () => {
  it('boş yol → null', () => expect(productImageUrl(null)).toBeNull());
  it('tam ve küçük sürüm', () => {
    expect(productImageUrl('products/p1-1700.webp')).toBe('https://x.supabase.co/storage/v1/object/public/product-images/products/p1-1700.webp');
    expect(productImageUrl('products/p1-1700.webp', 'thumb')).toBe('https://x.supabase.co/storage/v1/object/public/product-images/products/p1-1700-thumb.webp');
  });
});
