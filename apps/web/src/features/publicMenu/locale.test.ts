import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectLocale, initialLocale, MENU_LOCALE_KEY, saveLocale } from './locale';

afterEach(() => {
  vi.restoreAllMocks();
  localStorage.clear();
});

describe('detectLocale', () => {
  it('telefonun ilk tanınan dilini seçer', () => {
    expect(detectLocale(['ar-SA'])).toBe('ar');
    expect(detectLocale(['tr-TR', 'en'])).toBe('tr');
    expect(detectLocale(['en-GB'])).toBe('en');
    expect(detectLocale(['de-AT'])).toBe('de');
  });

  it('tanınmayan dil Almanca’ya düşer', () => {
    expect(detectLocale(['fr'])).toBe('de');
    expect(detectLocale([])).toBe('de');
  });

  it('listede sonra gelen tanınan dili kullanır', () => {
    expect(detectLocale(['fr-FR', 'tr'])).toBe('tr');
  });
});

describe('initialLocale', () => {
  it('kayıtlı seçim telefon dilinden önce gelir', () => {
    localStorage.setItem(MENU_LOCALE_KEY, 'en');
    expect(initialLocale(['tr-TR'])).toBe('en');
  });

  it('geçersiz kayıt yok sayılır', () => {
    localStorage.setItem(MENU_LOCALE_KEY, 'xx');
    expect(initialLocale(['ar'])).toBe('ar');
  });

  it('depo hatası yutulur', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    expect(initialLocale(['tr'])).toBe('tr');
    expect(() => saveLocale('ar')).not.toThrow();
  });

  it('personel dilini (ramos-locale) değiştirmez', () => {
    localStorage.setItem('ramos-locale', 'de');
    saveLocale('tr');
    expect(localStorage.getItem('ramos-locale')).toBe('de');
    expect(localStorage.getItem(MENU_LOCALE_KEY)).toBe('tr');
  });
});
