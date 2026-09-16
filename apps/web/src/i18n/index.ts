import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import de from './de.json';
import tr from './tr.json';

const stored = (() => {
  try {
    return localStorage.getItem('ramos-locale');
  } catch {
    return null;
  }
})();

void i18n.use(initReactI18next).init({
  resources: { tr: { translation: tr }, de: { translation: de } },
  lng: stored ?? 'tr',
  fallbackLng: 'de',
  interpolation: { escapeValue: false },
});

export function setLanguage(locale: 'tr' | 'de') {
  void i18n.changeLanguage(locale);
  document.documentElement.lang = locale;
  try {
    localStorage.setItem('ramos-locale', locale);
  } catch {
    /* özel mod */
  }
}

export default i18n;
