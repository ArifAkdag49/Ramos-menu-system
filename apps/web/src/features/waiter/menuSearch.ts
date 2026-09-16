import type { MenuProduct } from '@ramos/shared';

/**
 * Türkçe/Almanca aksan ve özel harfleri sadeleştirir: garson "sis" yazınca "Şiş", "doner" yazınca
 * "Döner" bulunur ama "Drehspieß" bulunmaz. `ı`/`İ` normal Unicode ayrıştırmayla açılmadığı için
 * (NFD'de kendi kod noktalarında kalırlar) elle eşlenir; `ß` de "ss" olarak açılır (BUILD-PROMPT §6).
 */
const MAP: Record<string, string> = { ß: 'ss', ı: 'i', İ: 'i' };
export const normalize = (s: string): string =>
  s.replace(/[ßıİ]/g, (c) => MAP[c] ?? c).normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase().trim();

/**
 * Garsonun yazdığı gibi arar: önce ürün kodu ön eki ("05", "71a", "m1"), sonra aksansız ad içinde
 * arama. Kod eşleşmeleri arasında tam eşleşme öne alınır.
 */
export function searchProducts<T extends Pick<MenuProduct, 'code' | 'name'>>(products: T[], query: string): T[] {
  const q = normalize(query);
  if (!q) return products;
  const byCode = products.filter((p) => p.code && normalize(p.code).startsWith(q));
  const byName = products.filter((p) => !byCode.includes(p) && normalize(p.name).includes(q));
  const exact = byCode.filter((p) => normalize(p.code ?? '') === q);
  return [...exact, ...byCode.filter((p) => !exact.includes(p)), ...byName];
}
