export type ImageSize = 'thumb' | 'full';
export const PRODUCT_BUCKET = 'product-images';

/**
 * Ürün görselinin herkese açık Storage URL'i. Seed `image_path`'e hiç dokunmaz (BUILD-PROMPT §11):
 * `null`/`undefined` normal durumdur, hata değil — çağıran yer tutucuya düşer.
 */
export function productImageUrl(path: string | null | undefined, size: ImageSize = 'full'): string | null {
  if (!path) return null;
  const p = size === 'thumb' ? path.replace(/\.webp$/, '-thumb.webp') : path;
  return `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/object/public/${PRODUCT_BUCKET}/${p}`;
}
