/**
 * Telefonu personele bağlayan cihaz anahtarı (0020, `timeclock_pair`'in döndürdüğü 256 bit değer).
 *
 * Emir Et'te bu anahtar sunucunun yazdığı HttpOnly çerezdedir; burada sunucu Supabase olduğu (başka alan adı)
 * için birinci taraf çerez yazılamaz, anahtar sitenin kendi `localStorage`'ında durur. Bilinen sınır: iPhone
 * Safari, siteyi 7 gün hiç açılmayan sitelerin betikle yazılmış verisini silebilir; o zaman telefon "eşleşmemiş"
 * der ve admin "Telefonu değiştir" ile yeni link verir (10 saniyelik iş). Ana ekrana eklenen site bu kurala
 * takılmaz. Sunucuda yalnız sha256 özeti var: anahtarın kendisi yalnız bu telefonda.
 */
export const DEVICE_KEY = 'ramos-timeclock-device';

export function readDeviceToken(): string | null {
  try {
    const v = localStorage.getItem(DEVICE_KEY);
    return v && /^[0-9a-f]{64}$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

export function writeDeviceToken(token: string): void {
  try {
    localStorage.setItem(DEVICE_KEY, token);
  } catch {
    // Özel sekme / dolu depo: eşleşme bu oturumda kalmaz, okutma "eşleşmemiş" der.
  }
}
