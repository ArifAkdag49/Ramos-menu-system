import { describe, expect, it } from 'vitest';
import { PUBLIC_LOCALES } from './locale';
import { LANGUAGE_NAMES, STRINGS, t } from './strings';

describe('müşteri menüsü metinleri', () => {
  it('dört dilde aynı anahtarlar var, hiçbiri boş değil', () => {
    const keys = Object.keys(STRINGS.de).sort();
    for (const locale of PUBLIC_LOCALES) {
      expect(Object.keys(STRINGS[locale]).sort(), locale).toEqual(keys);
      for (const value of Object.values(STRINGS[locale])) expect(value.trim(), locale).not.toBe('');
    }
  });

  it('fiyat kalıbı her dilde yer tutucuyu taşır', () => {
    for (const locale of PUBLIC_LOCALES) expect(STRINGS[locale].priceFrom).toContain('{price}');
    expect(t('de', 'priceFrom', { price: '8,50 €' })).toBe('ab 8,50 €');
    expect(t('tr', 'priceFrom', { price: '8,50 €' })).toBe('8,50 €’dan');
    expect(t('en', 'priceFrom', { price: '8,50 €' })).toBe('from 8,50 €');
    expect(t('ar', 'priceFrom', { price: '8,50 €' })).toBe('من 8,50 €');
  });

  it('dil adları kendi yazımıyla', () => {
    expect(LANGUAGE_NAMES).toEqual({ de: 'Deutsch', tr: 'Türkçe', en: 'English', ar: 'العربية' });
  });
});
