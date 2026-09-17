/** Müşteri menüsünün dilleri. Personel uygulamasının dili (`ramos-locale`, TR/DE) ayrıdır. */
export type PublicLocale = 'de' | 'tr' | 'en' | 'ar';

export const PUBLIC_LOCALES: readonly PublicLocale[] = ['de', 'tr', 'en', 'ar'];

/** Müşterinin seçimi burada durur; personelin `ramos-locale` anahtarına asla yazılmaz. */
export const MENU_LOCALE_KEY = 'ramos-menu-locale';

const isLocale = (v: unknown): v is PublicLocale =>
  typeof v === 'string' && (PUBLIC_LOCALES as readonly string[]).includes(v);

/** Telefonun dil listesinden ilk tanınan dil; hiçbiri yoksa Almanca (restoranın dili). */
export function detectLocale(languages: readonly string[]): PublicLocale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split(/[-_]/)[0];
    if (isLocale(base)) return base;
  }
  return 'de';
}

export function initialLocale(languages: readonly string[]): PublicLocale {
  try {
    const stored = localStorage.getItem(MENU_LOCALE_KEY);
    if (isLocale(stored)) return stored;
  } catch {
    /* özel mod / engelli depo */
  }
  return detectLocale(languages);
}

export function saveLocale(locale: PublicLocale) {
  try {
    localStorage.setItem(MENU_LOCALE_KEY, locale);
  } catch {
    /* özel mod */
  }
}

export const isRtl = (locale: PublicLocale) => locale === 'ar';
