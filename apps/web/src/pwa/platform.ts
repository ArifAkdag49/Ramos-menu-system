/**
 * Kurulum rehberi ve bildirim izni için platform tespiti. Saf çekirdek (`readPlatform`) test
 * edilir; `detectPlatform` yalnız tarayıcıdan okuyup ona verir.
 */

export interface PlatformInput {
  userAgent: string;
  platform: string;
  maxTouchPoints: number;
  /** `matchMedia('(display-mode: standalone)')` */
  displayStandalone: boolean;
  /** iOS Safari: ana ekrandan açılınca `navigator.standalone === true` */
  navigatorStandalone: boolean | undefined;
  referrer: string;
  /** Bu sekmede daha önce TWA yönlendireni görüldü mü (`sessionStorage`). */
  twaRemembered: boolean;
}

export interface Platform {
  isIOS: boolean;
  isAndroid: boolean;
  /** Yüklenmiş uygulama olarak açık: ana ekran PWA'sı ya da Android uygulaması (TWA). */
  standalone: boolean;
  /** Ramo's Android uygulaması (Trusted Web Activity) içinde. */
  twa: boolean;
}

const TWA_KEY = 'ramos-twa';
const TWA_REFERRER = 'android-app://';

export function readPlatform(input: PlatformInput): Platform {
  const isIOS =
    /iPad|iPhone|iPod/.test(input.userAgent) ||
    // iPadOS 13+ masaüstü Safari kimliğiyle gelir; dokunmatik ekran onu ele verir.
    (input.platform === 'MacIntel' && input.maxTouchPoints > 1);
  const isAndroid = /Android/i.test(input.userAgent);
  const twa = input.referrer.startsWith(TWA_REFERRER) || input.twaRemembered;
  const standalone = input.displayStandalone || input.navigatorStandalone === true || twa;
  return { isIOS, isAndroid, standalone, twa };
}

function readSession(key: string): string | null {
  try {
    return sessionStorage.getItem(key);
  } catch {
    return null;
  }
}

export function detectPlatform(): Platform {
  if (typeof navigator === 'undefined') {
    return { isIOS: false, isAndroid: false, standalone: false, twa: false };
  }
  let displayStandalone = false;
  try {
    displayStandalone = window.matchMedia?.('(display-mode: standalone)').matches ?? false;
  } catch {
    /* eski tarayıcı */
  }
  const nav = navigator as Navigator & { standalone?: boolean };
  const platform = readPlatform({
    userAgent: nav.userAgent,
    platform: nav.platform ?? '',
    maxTouchPoints: nav.maxTouchPoints ?? 0,
    displayStandalone,
    navigatorStandalone: nav.standalone,
    referrer: typeof document === 'undefined' ? '' : document.referrer,
    twaRemembered: readSession(TWA_KEY) === '1',
  });
  // TWA yönlendireni yalnız ilk sayfa yüklemesinde görünür; sekme (uygulama) açık kaldıkça hatırla.
  // `localStorage` değil: aynı telefonda Chrome sekmesinde açılan site "uygulama" sanılmasın.
  if (platform.twa) {
    try {
      sessionStorage.setItem(TWA_KEY, '1');
    } catch {
      /* özel mod */
    }
  }
  return platform;
}
