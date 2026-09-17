// notify-ready — saf mantık: bildirim metni, webhook sırrı doğrulama, push yanıtı sınıflandırma.
// Deno'ya bağımlılığı yoktur; Node + Vitest ile test edilir (npm run fn:test).
export type Locale = 'tr' | 'de';

export interface ReadyItem {
  qty: number;
  code: string | null;
  name: string;
}
/** `public.ready_push_targets` dönüşündeki `order` alanı. */
export interface ReadyOrder {
  id: string;
  order_no: number;
  table: string;
  items: ReadyItem[];
}
/**
 * `public.ready_push_targets` dönüşündeki `targets[]` elemanı. `kind = 'fcm'` (0013, yerel Android uygulaması)
 * iken `endpoint` FCM kayıt jetonudur ve `p256dh`/`auth` null'dır.
 */
export interface PushTarget {
  id: string;
  kind: 'webpush' | 'fcm';
  endpoint: string;
  p256dh: string | null;
  auth: string | null;
  locale: string | null;
}
/** Service worker'ın `push` olayında beklediği JSON. */
export interface ReadyNotification {
  title: string;
  body: string;
  tag: string;
  url: string;
}

const MAX_ITEMS = 3;

export const normalizeLocale = (locale: string | null | undefined): Locale => (locale === 'de' ? 'de' : 'tr');

/**
 * `packages/shared/src/domain.ts` → `localTableName` kopyası (Edge Function `@ramos/shared` import edemez).
 * TR'de baştaki "Tisch" kelimesi "Masa" olur; fişte her zaman DB adı kalır.
 */
export const localTableName = (name: string, locale: Locale): string =>
  locale === 'tr' ? name.replace(/^Tisch(?=\s|$)/, 'Masa') : name;

export function buildNotification(order: ReadyOrder, locale: Locale): ReadyNotification {
  const no = `#${String(order.order_no).padStart(3, '0')}`;
  const shown = order.items
    .slice(0, MAX_ITEMS)
    .map((i) => `${i.qty}x ${i.code ? `${i.code} ` : ''}${i.name}`);
  const more = order.items.length > MAX_ITEMS ? ` +${order.items.length - MAX_ITEMS}` : '';
  return {
    title: `${localTableName(order.table, locale)} · ${no} ${locale === 'tr' ? 'hazır' : 'fertig'}`,
    body: shown.join(', ') + more,
    // Günlük sipariş numarası ertesi gün tekrar eder; kimlik benzersizdir.
    tag: order.id,
    url: '/waiter/ready',
  };
}

/**
 * Sabit zamanlı karşılaştırma: süre, ilk farklı bayta göre değişmez. Sunucuda sır tanımlı değilse
 * (boş/undefined) hiçbir istek kabul edilmez.
 */
export function verifyWebhookSecret(provided: string | null | undefined, expected: string | null | undefined): boolean {
  if (!expected) return false;
  const enc = new TextEncoder();
  const a = enc.encode(provided ?? '');
  const b = enc.encode(expected);
  let diff = a.length ^ b.length;
  for (let i = 0; i < b.length; i++) diff |= (a[i] ?? 0) ^ b[i]!;
  return diff === 0;
}

/** Push servisinin HTTP yanıtı: 404/410 → abonelik ölü (silinir), 2xx → başarı, diğerleri geçici. */
export function pushOutcome(status: number): 'ok' | 'gone' | 'failed' {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404 || status === 410) return 'gone';
  return 'failed';
}

// ---------------------------------------------------------------------------------------------------------------
// FCM HTTP v1 (0013) — yerel Android uygulamasının bildirimleri. Deno ve Node'da ortak olan Web Crypto + fetch
// dışında bağımlılık yoktur. Sır: FCM_SERVICE_ACCOUNT (hizmet hesabı JSON'u; ASLA loglanmaz).
// ---------------------------------------------------------------------------------------------------------------
export const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const FCM_CHANNEL_ID = 'ramos_ready';
const JWT_LIFETIME_SECONDS = 3600;
const TOKEN_REFRESH_MARGIN_MS = 60_000;

export interface ServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

/** Sır yoksa, JSON bozuksa ya da alan eksikse null — çağıran FCM hedeflerini atlar. */
export function parseServiceAccount(raw: string | null | undefined): ServiceAccount | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
    const { project_id, client_email, private_key } = v;
    if (typeof project_id !== 'string' || !project_id || typeof client_email !== 'string' || !client_email ||
        typeof private_key !== 'string' || !private_key.includes('PRIVATE KEY')) {
      return null;
    }
    return { project_id, client_email, private_key };
  } catch {
    return null;
  }
}

export const fcmJwtClaims = (sa: ServiceAccount, nowSeconds: number) => ({
  iss: sa.client_email,
  scope: FCM_SCOPE,
  aud: GOOGLE_TOKEN_URL,
  iat: nowSeconds,
  exp: nowSeconds + JWT_LIFETIME_SECONDS,
});

const base64Url = (bytes: Uint8Array): string => {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const base64UrlJson = (v: unknown) => base64Url(new TextEncoder().encode(JSON.stringify(v)));

function pemToPkcs8(pem: string): ArrayBuffer {
  const b64 = pem.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out.buffer;
}

/** Google OAuth "JWT bearer" iddiası: RS256 ile hizmet hesabının özel anahtarıyla imzalanır. */
export async function signFcmJwt(sa: ServiceAccount, nowSeconds: number): Promise<string> {
  const key = await crypto.subtle.importKey('pkcs8', pemToPkcs8(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const unsigned = `${base64UrlJson({ alg: 'RS256', typ: 'JWT' })}.${base64UrlJson(fcmJwtClaims(sa, nowSeconds))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(unsigned));
  return `${unsigned}.${base64Url(new Uint8Array(sig))}`;
}

type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<Response>;

/**
 * OAuth erişim jetonu sağlayıcısı: jeton modül içinde önbelleklenir ve süresinin bitmesine 60 sn kala yenilenir.
 * Hata önbelleğe alınmaz (sonraki bildirim yeniden dener).
 */
export function createFcmAccessTokenProvider(deps: { fetch: FetchLike; nowMs: () => number }) {
  let cached: { email: string; token: string; expiresAtMs: number } | null = null;
  return async (sa: ServiceAccount): Promise<string> => {
    const now = deps.nowMs();
    if (cached && cached.email === sa.client_email && now < cached.expiresAtMs - TOKEN_REFRESH_MARGIN_MS) {
      return cached.token;
    }
    const assertion = await signFcmJwt(sa, Math.floor(now / 1000));
    const res = await deps.fetch(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`fcm_token_failed ${res.status}`);
    const { access_token, expires_in } = JSON.parse(text) as { access_token?: string; expires_in?: number };
    if (!access_token) throw new Error('fcm_token_failed no_access_token');
    cached = { email: sa.client_email, token: access_token, expiresAtMs: now + (expires_in ?? 3600) * 1000 };
    return access_token;
  };
}

export const fcmSendUrl = (projectId: string) =>
  `https://fcm.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/messages:send`;

/** FCM v1 `messages:send` gövdesi. data değerleri FCM kuralı gereği string'dir. */
export function buildFcmMessage(token: string, n: ReadyNotification, orderId: string) {
  return {
    message: {
      token,
      notification: { title: n.title, body: n.body },
      data: { url: n.url, tag: n.tag, order_id: orderId },
      android: { priority: 'HIGH', notification: { channel_id: FCM_CHANNEL_ID, tag: n.tag } },
    },
  };
}

/**
 * FCM yanıtı: 2xx başarı; 404, UNREGISTERED ya da jetona ait INVALID_ARGUMENT → jeton ölü (silinir);
 * diğerleri (401/403 yetki, 429 kota, 5xx) geçici — abonelik korunur.
 */
export function fcmOutcome(status: number, bodyText: string): 'ok' | 'gone' | 'failed' {
  if (status >= 200 && status < 300) return 'ok';
  if (status === 404) return 'gone';
  let error: { status?: string; message?: string; details?: Record<string, unknown>[] } | undefined;
  try {
    error = (JSON.parse(bodyText) as { error?: typeof error }).error;
  } catch {
    return 'failed';
  }
  if (!error) return 'failed';
  const details = Array.isArray(error.details) ? error.details : [];
  if (error.status === 'UNREGISTERED' || details.some((d) => d.errorCode === 'UNREGISTERED')) return 'gone';
  if (error.status === 'INVALID_ARGUMENT') {
    const tokenField = details.some((d) => Array.isArray(d.fieldViolations) &&
      (d.fieldViolations as { field?: string }[]).some((v) => v.field === 'message.token'));
    if (tokenField || /registration token/i.test(error.message ?? '')) return 'gone';
  }
  return 'failed';
}

/** Hedefleri kanala göre ayırır. `kind` alanı olmayan (0013 öncesi) hedef Web Push'tur. */
export function splitTargets(targets: PushTarget[], fcmConfigured: boolean) {
  const webpush = targets.filter((t) => (t.kind ?? 'webpush') === 'webpush');
  const fcm = targets.filter((t) => t.kind === 'fcm');
  return fcmConfigured ? { webpush, fcm, skipped: 0 } : { webpush, fcm: [] as PushTarget[], skipped: fcm.length };
}
