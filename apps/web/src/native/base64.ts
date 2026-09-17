/**
 * Bayt dönüşümleri — yerel eklentiye baytlar base64, durum yanıtı onaltılık gelir. `Buffer` yok
 * (tarayıcı/WebView). Büyük fişlerde `String.fromCharCode(...bytes)` yığın sınırını aşmasın diye
 * parça parça çevrilir.
 */

const CHUNK = 0x8000;

export function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

/** "12a0ff" → [0x12, 0xa0, 0xff]. Geçersiz ya da tek uzunluklu girdi → boş dizi (durum "bilinmiyor"). */
export function hexToBytes(hex: string): Uint8Array {
  const clean = hex.replace(/\s+/g, '');
  if (clean.length % 2 !== 0 || /[^0-9a-f]/i.test(clean)) return new Uint8Array(0);
  const out = new Uint8Array(clean.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
  return out;
}
