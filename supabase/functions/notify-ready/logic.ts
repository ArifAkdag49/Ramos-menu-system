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
/** `public.ready_push_targets` dönüşündeki `targets[]` elemanı. */
export interface PushTarget {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
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
