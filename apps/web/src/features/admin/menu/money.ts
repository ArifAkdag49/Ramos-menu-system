/**
 * Admin fiyat girişi. Para her yerde **tam sayı kuruş** tutulur (BUILD-PROMPT §5); kullanıcı ise
 * Almanca yazım alışkanlığıyla virgüllü girer ("7,50"). Nokta da kabul edilir çünkü sayısal
 * klavyeden çoğu zaman nokta çıkar — ikisi de aynı anlama gelir.
 *
 * `Number(...) * 100` kayan nokta bırakır (7.35 * 100 = 734.9999…), bu yüzden sonuç
 * `Math.round` ile kuruşa oturtulur.
 */
const EURO_INPUT = /^\d+([.,]\d{1,2})?$/;

/** "7,50" → 750. Geçersiz giriş (boş, harf, eksi, 3 ondalık) `null` döner — sıfır değil. */
export function parseEuroInput(s: string): number | null {
  const trimmed = s.trim();
  if (!EURO_INPUT.test(trimmed)) return null;
  return Math.round(Number(trimmed.replace(',', '.')) * 100);
}

/** 750 → "7,50". Girdi alanına yazılacak metin; gösterim biçimi için `formatEuro` kullanılır. */
export const centsToInput = (c: number): string => (c / 100).toFixed(2).replace('.', ',');
