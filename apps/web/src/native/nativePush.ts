import { callRpc } from '../lib/rpc';
import { nativePlugin, type NativePushPermission, type PushNotificationsPlugin } from './capacitor';

/**
 * Yerel uygulamada bildirimler: Firebase Cloud Messaging (FCM). WebView'da Web Push/VAPID çalışmaz;
 * Capacitor `PushNotifications` eklentisi cihaz jetonu verir, jeton `save_fcm_token` ile sunucuya
 * yazılır (`push_subscriptions.kind = 'fcm'`, endpoint = jeton). `notify-ready` FCM HTTP v1 ile gönderir.
 *
 * - İzin yalnız dokunuştan (`enableNativePush`) istenir; açılışta sorulmaz.
 * - Firebase dosyası olmadan derlenmiş APK'da `register()` reddeder ya da `registrationError` gelir:
 *   uygulama çökmez, durum `error` ("Bildirimler bu sürümde kapalı") olur.
 * - Ön planda gelen bildirim sistem tepsisinde gösterilmez; uygulama içi "Hazır" şeridi zaten uyarır.
 * - Bildirime dokununca `data.url` uygulama içinde açılır (`setupNativePush`).
 */

const TOKEN_KEY = 'ramos-fcm-token';
/** `registration` olayı bu sürede gelmezse Firebase yok sayılır (sonsuza dek dönen düğme olmasın). */
export const REGISTER_TIMEOUT_MS = 15_000;

export type NativePushState = 'enabled' | 'disabled' | 'denied' | 'unsupported' | 'error';
export type NativeEnableResult =
  | { ok: true }
  | {
      ok: false;
      reason: 'unsupported' | 'denied' | 'dismissed' | 'unavailable' | 'error';
      detail?: string;
    };

let registrationError: string | null = null;
let waiter: { resolve: (token: string) => void; reject: (e: Error) => void } | null = null;
let pending: Promise<string> | null = null;

function readToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

function writeToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token);
    else localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* özel mod: bir sonraki açılışta durum "kapalı" görünür, yeniden açılabilir */
  }
}

function plugin(): PushNotificationsPlugin | null {
  return nativePlugin('PushNotifications');
}

async function saveToken(token: string): Promise<void> {
  await callRpc('save_fcm_token', { p_token: token, p_ua: navigator.userAgent });
  writeToken(token);
}

/** Yalnız uygulama içi yol (`/waiter/ready`); dış adres ya da `//` ile başlayan yol yok sayılır. */
export function notificationPath(data: unknown): string | null {
  const url = (data as { url?: unknown } | null | undefined)?.url;
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') ? url : null;
}

let registrationListeners = false;
let tapListener = false;

/** `registration`/`registrationError` dinleyicileri `register()`'dan ÖNCE kurulmalı (bir kez). */
function ensureRegistrationListeners(push: PushNotificationsPlugin): void {
  if (registrationListeners) return;
  registrationListeners = true;
  void push.addListener('registration', ({ value }) => {
    registrationError = null;
    if (waiter) {
      waiter.resolve(value);
      return;
    }
    // Jeton kendiliğinden yenilendi (FCM): bildirim açıksa yenisini sessizce yaz, eskisini sil.
    const old = readToken();
    if (old && old !== value) {
      void saveToken(value)
        .then(() => callRpc('delete_push_subscription', { p_endpoint: old }))
        .catch(() => {});
    }
  });
  void push.addListener('registrationError', ({ error }) => {
    registrationError = error || 'registration_error';
    waiter?.reject(new Error(registrationError));
  });
}

/**
 * Açılışta bir kez (main.tsx). Uygulama bildirime dokunularak soğuk açıldıysa eklenti olayı
 * dinleyici eklenene kadar saklar ve şimdi teslim eder → `data.url` router ile açılır.
 */
export function setupNativePush(navigate: (path: string) => void): void {
  const push = plugin();
  if (!push || tapListener) return;
  tapListener = true;
  try {
    ensureRegistrationListeners(push);
    void push.addListener('pushNotificationActionPerformed', (action) => {
      const path = notificationPath(action?.notification?.data);
      if (path) navigate(path);
    });
  } catch {
    /* eski APK: eklenti eksik yöntemli — bildirimler kapalı kalır, uygulama çalışır */
  }
}

/** `register()` + `registration` olayını tek sözde bekler; eşzamanlı çağrılar aynı sözü paylaşır. */
function registerForToken(push: PushNotificationsPlugin, timeoutMs: number): Promise<string> {
  if (pending) return pending;
  ensureRegistrationListeners(push);
  pending = new Promise<string>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('registration_timeout')), timeoutMs);
    waiter = {
      resolve: (t) => {
        clearTimeout(timer);
        resolve(t);
      },
      reject: (e) => {
        clearTimeout(timer);
        reject(e);
      },
    };
    push
      .register()
      .catch((e: unknown) => waiter?.reject(e instanceof Error ? e : new Error(String(e))));
  }).finally(() => {
    waiter = null;
    pending = null;
  });
  return pending;
}

/** Yalnız kullanıcı dokunuşundan çağır. */
export async function enableNativePush(
  timeoutMs = REGISTER_TIMEOUT_MS,
): Promise<NativeEnableResult> {
  const push = plugin();
  if (!push) return { ok: false, reason: 'unsupported' };
  let token: string;
  try {
    let perm = await push.checkPermissions();
    if (perm.receive !== 'granted') perm = await push.requestPermissions();
    if (perm.receive === 'denied') return { ok: false, reason: 'denied' };
    if (perm.receive !== 'granted') return { ok: false, reason: 'dismissed' };
    token = await registerForToken(push, timeoutMs);
  } catch (e) {
    registrationError = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: 'unavailable', detail: registrationError };
  }
  registrationError = null;
  try {
    await saveToken(token);
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: 'error', detail: e instanceof Error ? e.message : String(e) };
  }
}

export async function disableNativePush(): Promise<void> {
  const push = plugin();
  const token = readToken();
  writeToken(null);
  if (token) {
    try {
      await callRpc('delete_push_subscription', { p_endpoint: token });
    } catch {
      /* sunucuya ulaşılamadı: jeton FCM'de geçersizleşince notify-ready satırı kendisi siler */
    }
  }
  try {
    await push?.unregister();
  } catch {
    /* Firebase yoksa unregister da reddeder — kapalı sayılır */
  }
}

export async function nativePushState(): Promise<NativePushState> {
  const push = plugin();
  if (!push) return 'unsupported';
  let perm: NativePushPermission;
  try {
    perm = await push.checkPermissions();
  } catch {
    return 'unsupported';
  }
  if (perm.receive === 'denied') return 'denied';
  if (registrationError) return 'error';
  return perm.receive === 'granted' && readToken() ? 'enabled' : 'disabled';
}

/** Açılışta sessiz eşitleme (izin sormaz): bildirim açıksa güncel jetonu bu kullanıcıya yeniden yaz. */
export async function syncNativePush(timeoutMs = REGISTER_TIMEOUT_MS): Promise<void> {
  const push = plugin();
  if (!push) return;
  try {
    if ((await nativePushState()) !== 'enabled') return;
    const token = await registerForToken(push, timeoutMs);
    const old = readToken();
    await saveToken(token);
    if (old && old !== token)
      await callRpc('delete_push_subscription', { p_endpoint: old }).catch(() => {});
  } catch {
    /* sessiz — Profil → Bildirimler'den yeniden açılabilir */
  }
}

/** Yalnız testler: modül durumunu sıfırla. */
export function __resetNativePushForTests(): void {
  registrationError = null;
  waiter = null;
  pending = null;
  registrationListeners = false;
  tapListener = false;
}
