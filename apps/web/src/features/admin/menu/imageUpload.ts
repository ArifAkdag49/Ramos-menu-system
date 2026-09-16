import { PRODUCT_BUCKET } from '../../../lib/images';
import { supabase } from '../../../lib/supabase';

/** BUILD-PROMPT §11: 1200 px tam sürüm + 320 px küçük sürüm, kalite ≈ 0,82. */
export const FULL_MAX_SIDE = 1200;
export const THUMB_MAX_SIDE = 320;
export const WEBP_QUALITY = 0.82;

/** Bucket'ın kendi sınırı 5 MB (`0002_helpers_rls.sql`); tarayıcıda da aynı sınır uygulanır. */
export const MAX_FILE_BYTES = 5 * 1024 * 1024;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export type ImageFileError = 'too_large' | 'bad_type';

/** Yükleme öncesi sade kontrol: tür ve boyut. Hata sade dille gösterilsin diye anahtar döner. */
export function validateImageFile(file: { type: string; size: number }): ImageFileError | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'bad_type';
  if (file.size > MAX_FILE_BYTES) return 'too_large';
  return null;
}

/** En-boy oranını koruyarak uzun kenarı `maxSide`'a indirir; küçük görsel büyütülmez. */
export function fitWithin(
  width: number,
  height: number,
  maxSide: number,
): { width: number; height: number } {
  const longest = Math.max(width, height);
  if (longest <= maxSide) return { width, height };
  const scale = maxSide / longest;
  return { width: Math.round(width * scale), height: Math.round(height * scale) };
}

/**
 * Tarayıcıda WebP'ye sıkıştırır. Sunucuya iş düşmez: restoranın yüklediği 4 MB'lik telefon
 * fotoğrafı ağa çıkmadan önce ~100 KB'ye iner (Supabase Free'de 1 GB Storage var).
 */
export async function compressToWebp(file: File, maxSide: number, quality = WEBP_QUALITY): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  try {
    const size = fitWithin(bitmap.width, bitmap.height, maxSide);
    const canvas = document.createElement('canvas');
    canvas.width = size.width;
    canvas.height = size.height;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas_unavailable');
    ctx.drawImage(bitmap, 0, 0, size.width, size.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error('encode_failed'))),
        'image/webp',
        quality,
      );
    });
  } finally {
    bitmap.close();
  }
}

/**
 * Zaman damgalı ad: dosyanın üzerine yazmak yerine yeni ad verilir, böylece CDN önbelleği
 * kendiliğinden tazelenir ve `upsert` gerekmez (BUILD-PROMPT §6 "Storage").
 */
export function imagePaths(productId: string, stamp: number): { full: string; thumb: string } {
  return { full: `products/${productId}-${stamp}.webp`, thumb: `products/${productId}-${stamp}-thumb.webp` };
}

/** `full` yolundan küçük sürümün yolu — `lib/images.ts`'teki kuralla aynı. */
const thumbOf = (fullPath: string): string => fullPath.replace(/\.webp$/, '-thumb.webp');

/**
 * Dosya adından ürün numarası: `05.jpg`, `71A.webp`, `M1.png`. Küçültme **daima** `toLowerCase`
 * ile yapılır, `toLocaleLowerCase` ile değil: Türkçe yerelde "I" harfi "ı"ya döner ve "M1" gibi
 * kodlar bir daha eşleşmezdi (BUILD-PROMPT §6 "Büyük harf" tuzağının küçük harf ikizi).
 *
 * Baştaki harf `m` ile sınırlı DEĞİL, tek bir harfe açıktır: menüde bugün yalnız `M1…M9` var ama
 * numaralandırma başka bir harfle genişlerse (ya da testte `T05` gibi bir kod kullanılırsa) araç
 * sessizce eşleştiremez hâle gelmemeli. Kural aynı kalır: **bir harf + rakam**, serbest metin değil —
 * `pizza.jpg` ve `05-final.jpg` hâlâ eşleşmez.
 */
const FILE_CODE = /^([a-z]?\d{1,3}[a-z]?)\.(jpe?g|png|webp)$/;

export function fileNameToCode(name: string): string | null {
  return FILE_CODE.exec(name.toLowerCase())?.[1] ?? null;
}

export interface FileMatch {
  file: File;
  productId: string;
}

/** Toplu yükleme eşleşmesi: dosya adı = ürün numarası. Eşleşmeyenler ayrı listede döner. */
export function matchFilesToProducts(
  files: File[],
  products: { id: string; code: string | null }[],
): { matched: FileMatch[]; unmatched: File[] } {
  const byCode = new Map<string, string>();
  for (const p of products) {
    if (p.code) byCode.set(p.code.toLowerCase(), p.id);
  }

  const matched: FileMatch[] = [];
  const unmatched: File[] = [];
  for (const file of files) {
    const code = fileNameToCode(file.name);
    const productId = code ? byCode.get(code) : undefined;
    if (productId) matched.push({ file, productId });
    else unmatched.push(file);
  }
  return { matched, unmatched };
}

export interface ProductImageRef {
  id: string;
  image_path: string | null;
}

/** Eski iki dosyayı siler. Silinemezse yükleme geçerli sayılır — yetim dosya, bozuk görselden iyidir. */
async function removeFiles(fullPath: string): Promise<void> {
  await supabase.storage.from(PRODUCT_BUCKET).remove([fullPath, thumbOf(fullPath)]);
}

/**
 * Tek ürün görseli yükler: tam + küçük sürüm, `products.image_path` güncellemesi, eski dosyaların
 * silinmesi. Sıra kasıtlı — önce yeni dosyalar, sonra satır, en son eski dosyalar: arada bir hata
 * olursa ürün her zaman **var olan** bir görseli gösterir.
 */
export async function uploadProductImage(product: ProductImageRef, file: File): Promise<string> {
  const stamp = Date.now();
  const paths = imagePaths(product.id, stamp);
  const [full, thumb] = await Promise.all([
    compressToWebp(file, FULL_MAX_SIDE),
    compressToWebp(file, THUMB_MAX_SIDE),
  ]);

  const bucket = supabase.storage.from(PRODUCT_BUCKET);
  const opts = { contentType: 'image/webp', upsert: false };
  const up1 = await bucket.upload(paths.full, full, opts);
  if (up1.error) throw up1.error;
  const up2 = await bucket.upload(paths.thumb, thumb, opts);
  if (up2.error) {
    await bucket.remove([paths.full]);
    throw up2.error;
  }

  const { error } = await supabase.from('products').update({ image_path: paths.full }).eq('id', product.id);
  if (error) {
    await bucket.remove([paths.full, paths.thumb]);
    throw error;
  }

  if (product.image_path && product.image_path !== paths.full) await removeFiles(product.image_path);
  return paths.full;
}

/** Görseli kaldırır: önce satır (kullanıcı anında yer tutucuyu görür), sonra dosyalar. */
export async function removeProductImage(product: ProductImageRef): Promise<void> {
  const { error } = await supabase.from('products').update({ image_path: null }).eq('id', product.id);
  if (error) throw error;
  if (product.image_path) await removeFiles(product.image_path);
}
