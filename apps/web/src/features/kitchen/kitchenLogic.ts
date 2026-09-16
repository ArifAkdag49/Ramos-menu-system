import type { OrderView } from '../../data/orders';

// Görev 13'te `apps/web/src/features/common/itemLines.ts` olarak zaten yazıldı ve test edildi.
// KDS aynı fonksiyonu kullanır — burada yeniden yazılmaz.
export { itemLines } from '../common/itemLines';

const MIN = 60_000;

/**
 * KDS'nin iki sütunu: `active` (mutfaktaki siparişler, eskiden yeniye) ve `ready`
 * (son 30 dk içinde hazırlanmış siparişler, yeniden eskiye). Daha eski "hazır"lar ekrandan düşer.
 */
export function kitchenColumns(orders: OrderView[], now: Date): { active: OrderView[]; ready: OrderView[] } {
  const t = now.getTime();
  const active = orders
    .filter((o) => o.status === 'in_kitchen')
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
  const ready = orders
    .filter((o) => o.status === 'ready' && o.ready_at && t - Date.parse(o.ready_at) <= 30 * MIN)
    .sort((a, b) => (b.ready_at ?? '').localeCompare(a.ready_at ?? ''));
  return { active, ready };
}

/** Süre tonu: 10 dk'ya kadar yeşil, 10–20 dk sarı, 20 dk'dan sonra kırmızı (global-constraints). */
export function elapsedTone(createdAt: string, now: Date): 'ok' | 'warn' | 'late' {
  const m = (now.getTime() - Date.parse(createdAt)) / MIN;
  return m <= 10 ? 'ok' : m <= 20 ? 'warn' : 'late';
}

/**
 * Kart tonu. Süre eşiklerine `ready` eklenir: hazır olmuş bir sipariş geciken sipariş değildir —
 * iş bitmiştir, bekleyen şey garsonun alması (O12).
 */
export type KitchenTone = 'ok' | 'warn' | 'late' | 'ready';

/**
 * Kartın göstereceği sayaç ve tonu (O12). Mutfaktaki sipariş için "kaç dakikadır bekliyor"
 * (`created_at`); hazır sipariş için "kaç dakikadır tezgâhta" (`ready_at`) — yemek soğurken
 * anlamlı olan sayaç budur ve kırmızı ton yanlış bilgi verir. `ready_at` boşsa (eski kayıt,
 * yarım kalmış geçiş) sayaç kaybolmaz, `created_at`'e düşer.
 */
export function cardElapsed(
  order: Pick<OrderView, 'status' | 'created_at' | 'ready_at'>,
  now: Date,
): { since: string; tone: KitchenTone } {
  if (order.status === 'ready' && order.ready_at) return { since: order.ready_at, tone: 'ready' };
  return { since: order.created_at, tone: elapsedTone(order.created_at, now) };
}

/**
 * Kalemlerin GÖRÜNÜM sırası (Y8): iptal edilmiş kalemler listenin sonuna iner. Kartın en değerli
 * satırı (ilk satır) yapılmayacak işe gitmez. Sunucu sırası (`sort`) her grubun kendi içinde
 * korunur — `Array.prototype.sort` kararlıdır. Girdi dizisi değiştirilmez.
 */
export function visibleItems<T extends { status: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(a.status === 'cancelled') - Number(b.status === 'cancelled'));
}

/** Tükendi işaretli ürün sayısı — KDS başlığındaki "Tükendi" düğmesinin sayacı (O10). */
export const soldOutCount = (products: { is_sold_out: boolean }[]): number =>
  products.reduce((n, p) => n + (p.is_sold_out ? 1 : 0), 0);

/** HAZIR'ı geri alma penceresi: en fazla 30 sn (global-constraints). */
export const canUndo = (o: Pick<OrderView, 'status' | 'ready_at'>, now: Date): boolean =>
  o.status === 'ready' && !!o.ready_at && now.getTime() - Date.parse(o.ready_at) <= 30_000;

/** Bir önceki listede olmayan sipariş kimlikleri (ses uyarısı için). */
export const newOrderIds = (prev: Set<string>, next: OrderView[]): string[] =>
  next.filter((o) => !prev.has(o.id)).map((o) => o.id);
