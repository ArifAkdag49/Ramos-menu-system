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

/** HAZIR'ı geri alma penceresi: en fazla 30 sn (global-constraints). */
export const canUndo = (o: Pick<OrderView, 'status' | 'ready_at'>, now: Date): boolean =>
  o.status === 'ready' && !!o.ready_at && now.getTime() - Date.parse(o.ready_at) <= 30_000;

/** Bir önceki listede olmayan sipariş kimlikleri (ses uyarısı için). */
export const newOrderIds = (prev: Set<string>, next: OrderView[]): string[] =>
  next.filter((o) => !prev.has(o.id)).map((o) => o.id);
