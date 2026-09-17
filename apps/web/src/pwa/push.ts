import { callRpc } from '../lib/rpc';
import { isNative } from '../native/capacitor';
import {
  disableNativePush,
  enableNativePush,
  nativePushState,
  syncNativePush,
} from '../native/nativePush';
import { detectPlatform } from './platform';

/**
 * Web Push aboneliği (Görev 25/26). Sunucu hattı hazır: `notify-ready` Edge Function, sipariş
 * `ready` olunca mesaideki garsonların aboneliklerine `{ title, body, tag, url }` gönderir.
 *
 * BUILD-PROMPT §6:
 * - iOS'ta push yalnız **ana ekrana eklenmiş** uygulamada (16.4+) vardır.
 * - İzin yalnız **kullanıcı dokunuşunun içinden** istenir: `enablePush()` bir düğmenin `onClick`'inde,
 *   önünde başka bir `await` olmadan çağrılmalı. Uygulama açılışında asla kendiliğinden sorulmaz.
 * - Android uygulaması (TWA) siteyi Chrome ile açar; push orada da bu yoldan çalışır.
 * - Yerel Android uygulaması (Capacitor, `isNative()`): WebView'da Web Push yok → her giriş noktası
 *   FCM yoluna (`native/nativePush.ts`) geçer. Tarayıcı/PWA davranışı değişmez.
 */

export interface PushEnv {
  isIOS: boolean;
  standalone: boolean;
  hasSW: boolean;
  hasPush: boolean;
  hasNotification: boolean;
}

export type PushSupport = 'ok' | 'ios_needs_install' | 'unsupported';
/** `error`: yalnız yerel uygulamada — bildirim kaydı başarısız (ör. Firebase'siz derleme). */
export type PushState = 'enabled' | 'disabled' | 'denied' | 'unsupported' | 'error';
export type EnablePushResult =
  | { ok: true }
  | {
      ok: false;
      /**
       * `dismissed`: izin penceresi karar verilmeden kapatıldı — tekrar sorulabilir.
       * `unavailable`: yerel uygulamada bildirim kaydı yapılamadı (bu sürümde bildirimler kapalı).
       */
      reason:
        'unsupported' | 'ios_needs_install' | 'denied' | 'dismissed' | 'unavailable' | 'error';
      detail?: string;
    };

/** SW hazır olmazsa (ör. geliştirme sunucusu, kayıt hatası) düğme sonsuza kadar dönmesin. */
const SW_READY_TIMEOUT_MS = 10_000;

export function pushSupport(env: PushEnv): PushSupport {
  // Safari sekmesinde push yoktur; ana ekrana eklemek tek yol (API'ler kısmen görünse bile).
  if (env.isIOS && !env.standalone) return 'ios_needs_install';
  if (env.hasSW && env.hasPush && env.hasNotification) return 'ok';
  return 'unsupported';
}

export function detectPushEnv(): PushEnv {
  const { isIOS, standalone } = detectPlatform();
  return {
    isIOS,
    standalone,
    hasSW: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    hasPush: typeof window !== 'undefined' && 'PushManager' in window,
    hasNotification: typeof window !== 'undefined' && 'Notification' in window,
  };
}

/** VAPID public anahtarı (raw, base64url) → `applicationServerKey`. */
export function urlBase64ToUint8Array(b64: string): Uint8Array<ArrayBuffer> {
  const padded = (b64 + '='.repeat((4 - (b64.length % 4)) % 4))
    .replace(/-/g, '+')
    .replace(/_/g, '/');
  const raw = atob(padded);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

function sameKey(current: ArrayBuffer | null | undefined, expected: Uint8Array): boolean {
  if (!current) return false;
  const a = new Uint8Array(current);
  return a.length === expected.length && a.every((v, i) => v === expected[i]);
}

async function readyRegistration(): Promise<ServiceWorkerRegistration | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => {
    timer = setTimeout(() => resolve(null), SW_READY_TIMEOUT_MS);
  });
  try {
    return await Promise.race([navigator.serviceWorker.ready, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

async function currentSubscription(): Promise<PushSubscription | null> {
  if (!('serviceWorker' in navigator)) return null;
  const reg = await navigator.serviceWorker.getRegistration();
  return (await reg?.pushManager.getSubscription()) ?? null;
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const json = sub.toJSON();
  const p256dh = json.keys?.p256dh;
  const auth = json.keys?.auth;
  if (!json.endpoint || !p256dh || !auth) throw new Error('subscription_incomplete');
  await callRpc('save_push_subscription', {
    p_endpoint: json.endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_ua: navigator.userAgent,
  });
}

/** Yalnız kullanıcı dokunuşundan çağır (bkz. dosya başı). */
export async function enablePush(): Promise<EnablePushResult> {
  if (isNative()) return enableNativePush();
  const support = pushSupport(detectPushEnv());
  if (support !== 'ok') return { ok: false, reason: support };

  try {
    // İlk `await` bu: iOS izni ancak dokunuşla aynı görev içinde istenirse gösterir.
    const permission = await Notification.requestPermission();
    if (permission === 'denied') return { ok: false, reason: 'denied' };
    if (permission !== 'granted') return { ok: false, reason: 'dismissed' };

    const vapid = import.meta.env.VITE_VAPID_PUBLIC_KEY;
    if (!vapid) return { ok: false, reason: 'error', detail: 'missing_vapid_key' };
    const key = urlBase64ToUint8Array(vapid);

    const reg = await readyRegistration();
    if (!reg) return { ok: false, reason: 'error', detail: 'service_worker_not_ready' };

    let sub = await reg.pushManager.getSubscription();
    // VAPID anahtarı değiştiyse eski abonelik yeni anahtarla gönderilen push'u almaz.
    if (sub && !sameKey(sub.options.applicationServerKey, key)) {
      await sub.unsubscribe();
      sub = null;
    }
    sub ??= await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });

    await saveSubscription(sub);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function disablePush(): Promise<void> {
  if (isNative()) return disableNativePush();
  const sub = await currentSubscription();
  if (!sub) return;
  try {
    await callRpc('delete_push_subscription', { p_endpoint: sub.endpoint });
  } catch {
    // Sunucuya ulaşılamadı: yerel abonelik yine bırakılır. Bırakılan uç noktaya giden push
    // 404/410 döner ve `notify-ready` o satırı kendisi siler.
  }
  await sub.unsubscribe();
}

export async function pushState(): Promise<PushState> {
  if (isNative()) return nativePushState();
  if (pushSupport(detectPushEnv()) !== 'ok') return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission !== 'granted') return 'disabled';
  try {
    return (await currentSubscription()) ? 'enabled' : 'disabled';
  } catch {
    return 'disabled';
  }
}

/**
 * Açılışta sessiz eşitleme (izin sormaz): cihazda abonelik ve izin zaten varsa sunucuya yeniden
 * yazılır. Böylece aynı telefona başka bir garson giriş yaptığında abonelik ona geçer
 * (`save_push_subscription` uç noktada upsert yapar) ve tarayıcının yenilediği abonelik kaybolmaz.
 */
export async function syncPushSubscription(): Promise<void> {
  if (isNative()) return syncNativePush();
  try {
    if ((await pushState()) !== 'enabled') return;
    const sub = await currentSubscription();
    if (sub) await saveSubscription(sub);
  } catch {
    /* sessiz — kullanıcı Profil → Bildirimler'den yeniden açabilir */
  }
}
