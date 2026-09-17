import type { PublicLocale } from './locale';

/**
 * Müşteri menüsünün az sayıdaki metni. Personel i18n dosyaları (tr/de.json) bilerek kullanılmaz:
 * onlar yalnız TR/DE ve bütün uygulamayı kapsıyor, bu sayfa ise dört dilde ve girişsiz açılır.
 * `{price}` yer tutucusu `t()` ile doldurulur.
 */
const de = {
  pageTitle: 'Speisekarte',
  categoriesLabel: 'Kategorien',
  languageLabel: 'Sprache',
  soldOut: 'Ausverkauft',
  priceFrom: 'ab {price}',
  allergens: 'Allergene',
  allergenLegendTitle: 'Allergene und Zusatzstoffe',
  close: 'Schließen',
  loadError: 'Die Speisekarte konnte nicht geladen werden. Prüfen Sie die Internetverbindung.',
  retry: 'Erneut versuchen',
  empty: 'Die Speisekarte ist gerade leer.',
  vatNote: 'Alle Preise inkl. MwSt.',
  sizes: 'Größen',
};

type Strings = typeof de;

const tr: Strings = {
  pageTitle: 'Menü',
  categoriesLabel: 'Kategoriler',
  languageLabel: 'Dil',
  soldOut: 'Tükendi',
  priceFrom: '{price}’dan',
  allergens: 'Alerjenler',
  allergenLegendTitle: 'Alerjenler ve katkı maddeleri',
  close: 'Kapat',
  loadError: 'Menü yüklenemedi. İnternet bağlantısını kontrol edin.',
  retry: 'Tekrar dene',
  empty: 'Menü şu an boş.',
  vatNote: 'Tüm fiyatlara KDV dahildir.',
  sizes: 'Boyutlar',
};

const en: Strings = {
  pageTitle: 'Menu',
  categoriesLabel: 'Categories',
  languageLabel: 'Language',
  soldOut: 'Sold out',
  priceFrom: 'from {price}',
  allergens: 'Allergens',
  allergenLegendTitle: 'Allergens and additives',
  close: 'Close',
  loadError: 'The menu could not be loaded. Check your internet connection.',
  retry: 'Try again',
  empty: 'The menu is empty right now.',
  vatNote: 'All prices include VAT.',
  sizes: 'Sizes',
};

const ar: Strings = {
  pageTitle: 'قائمة الطعام',
  categoriesLabel: 'الفئات',
  languageLabel: 'اللغة',
  soldOut: 'نفدت الكمية',
  priceFrom: 'من {price}',
  allergens: 'مسببات الحساسية',
  allergenLegendTitle: 'مسببات الحساسية والمواد المضافة',
  close: 'إغلاق',
  loadError: 'تعذّر تحميل القائمة. تحقّق من اتصال الإنترنت.',
  retry: 'إعادة المحاولة',
  empty: 'القائمة فارغة حاليًا.',
  vatNote: 'جميع الأسعار شاملة ضريبة القيمة المضافة.',
  sizes: 'الأحجام',
};

export const STRINGS: Record<PublicLocale, Strings> = { de, tr, en, ar };

export type StringKey = keyof Strings;

/** Dil adları her dilde kendi yazımıyla görünür: müşteri kendi dilini tanıyabilsin. */
export const LANGUAGE_NAMES: Record<PublicLocale, string> = {
  de: 'Deutsch',
  tr: 'Türkçe',
  en: 'English',
  ar: 'العربية',
};

export function t(locale: PublicLocale, key: StringKey, vars: Record<string, string> = {}): string {
  return STRINGS[locale][key].replace(/\{(\w+)\}/g, (m, name: string) => vars[name] ?? m);
}
