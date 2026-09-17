import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectPlatform, readPlatform } from './platform';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1';
const IPAD_DESKTOP_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15';
const ANDROID =
  'Mozilla/5.0 (Linux; Android 15; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36';

const base = {
  userAgent: ANDROID,
  platform: 'Linux armv81',
  maxTouchPoints: 5,
  displayStandalone: false,
  navigatorStandalone: undefined as boolean | undefined,
  referrer: '',
  twaRemembered: false,
};

describe('readPlatform', () => {
  it('iPhone Safari sekmesi', () => {
    expect(readPlatform({ ...base, userAgent: IPHONE, platform: 'iPhone' })).toEqual({
      isIOS: true,
      isAndroid: false,
      standalone: false,
      twa: false,
    });
  });

  it('masaüstü kimliğiyle gelen iPad de iOS sayılır', () => {
    expect(readPlatform({ ...base, userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel' }).isIOS).toBe(
      true,
    );
    expect(
      readPlatform({ ...base, userAgent: IPAD_DESKTOP_UA, platform: 'MacIntel', maxTouchPoints: 0 })
        .isIOS,
    ).toBe(false);
  });

  it('iOS ana ekrandan açılınca standalone', () => {
    expect(
      readPlatform({ ...base, userAgent: IPHONE, platform: 'iPhone', navigatorStandalone: true })
        .standalone,
    ).toBe(true);
  });

  it('Android uygulaması (TWA) yönlendireni ile tanınır ve standalone sayılır', () => {
    const p = readPlatform({ ...base, referrer: 'android-app://com.arxdigital.ramos/' });
    expect(p).toMatchObject({ isAndroid: true, twa: true, standalone: true });
  });

  it('TWA oturum içinde hatırlanır (yönlendiren ilk sayfadan sonra kaybolur)', () => {
    expect(readPlatform({ ...base, twaRemembered: true })).toMatchObject({
      twa: true,
      standalone: true,
    });
  });

  it('Android Chrome sekmesi kurulu değil', () => {
    expect(readPlatform(base)).toEqual({
      isIOS: false,
      isAndroid: true,
      standalone: false,
      twa: false,
    });
  });

  it('yüklenmiş PWA (display-mode: standalone)', () => {
    expect(readPlatform({ ...base, displayStandalone: true }).standalone).toBe(true);
  });
});

describe('detectPlatform (jsdom)', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    try {
      sessionStorage.clear();
    } catch {
      /* yok */
    }
  });

  it('matchMedia olmayan ortamda patlamaz', () => {
    expect(() => detectPlatform()).not.toThrow();
  });

  it('TWA yönlendireni görülünce oturum deposuna yazılır', () => {
    Object.defineProperty(document, 'referrer', {
      configurable: true,
      get: () => 'android-app://com.arxdigital.ramos/',
    });
    expect(detectPlatform().twa).toBe(true);
    Object.defineProperty(document, 'referrer', { configurable: true, get: () => '' });
    expect(detectPlatform().twa).toBe(true);
  });
});
