import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import tr from './tr.json';

export type Locale = 'tr' | 'de';

const stored = (() => {
  try {
    return localStorage.getItem('ramos-locale');
  } catch {
    return null;
  }
})();

const initial: Locale = stored === 'de' ? 'de' : 'tr';

/**
 * `<html lang>` doğru dili göstermelidir: `lang="tr"` altındaki Almanca metin, CSS ile büyük
 * harfe çevrildiğinde "i" harfini "İ" yapar (BUILD-PROMPT §6). Profil çözülene kadar beklenmez.
 */
const setDocumentLang = (locale: Locale) => {
  if (typeof document !== 'undefined') document.documentElement.lang = locale;
};

void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, de: { translation: de } },
  lng: initial,
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
});

setDocumentLang(initial);

export function setLanguage(locale: Locale) {
  void i18n.changeLanguage(locale);
  setDocumentLang(locale);
  try {
    localStorage.setItem('ramos-locale', locale);
  } catch {
    /* özel mod */
  }
}

export default i18n;
