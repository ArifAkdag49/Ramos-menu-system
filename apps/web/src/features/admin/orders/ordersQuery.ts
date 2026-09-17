import type { TicketPayload } from '@ramos/shared';
import type { OrderItemStatus, OrderStatus } from '../../../data/orderMapper';
import { dateRangeError, type DateRangeError } from '../dashboardLogic';

/** Sipariş listesinin bir sayfası: `range(0, 49)`, "Daha fazla" bir sayfa daha ister. */
export const ORDERS_PAGE_SIZE = 50;

export interface OrdersFilterInput {
  /** İş günü, `yyyy-MM-dd` (Europe/Berlin, 05:00 kuralı — takvim günü değil). */
  from: string;
  to: string;
  tableId?: string;
  waiterId?: string;
  status?: OrderStatus | '';
}

/** PostgREST sorgusuna bire bir çevrilen süzgeç. Boş alanlar nesnede **yer almaz**. */
export interface OrdersFilter {
  business_date_gte: string;
  business_date_lte: string;
  session_table?: string;
  waiter_id?: string;
  status?: OrderStatus;
}

export class OrdersFilterError extends Error {
  readonly key: DateRangeError;

  constructor(key: DateRangeError) {
    super(key);
    this.name = 'OrdersFilterError';
    this.key = key;
  }
}

/**
 * Filtre çubuğundaki değerleri sorgu süzgecine çevirir. Saf fonksiyondur: ekran önce bunu çağırır,
 * hata varsa sorgu hiç gitmez ve alanın altında `admin.orders.errors.<key>` görünür.
 *
 * Sonuç sorgu anahtarının da parçasıdır; boş dize filtreleri atılır ki "Bütün masalar" seçimi ile
 * hiç seçim yapmamak aynı önbellek girdisine düşsün.
 */
export function buildOrdersFilter(f: OrdersFilterInput): OrdersFilter {
  const error = dateRangeError(f.from, f.to);
  if (error) throw new OrdersFilterError(error);
  return {
    business_date_gte: f.from,
    business_date_lte: f.to,
    ...(f.tableId ? { session_table: f.tableId } : {}),
    ...(f.waiterId ? { waiter_id: f.waiterId } : {}),
    ...(f.status ? { status: f.status } : {}),
  };
}

type PricedItem = { quantity: number; unit_price_cents: number; status: OrderItemStatus };

/**
 * Siparişin tutarı: iptal edilmemiş kalemlerin `birim × adet` toplamı. Serbest ekstra ücretler
 * (0009) sunucuda birim fiyata zaten eklenmiştir; hesap özeti, fiş ve rapor da aynı formülü kullanır.
 */
export const orderTotalCents = (items: PricedItem[]): number =>
  items.reduce(
    (sum, i) => (i.status === 'active' ? sum + i.unit_price_cents * i.quantity : sum),
    0,
  );

/** "Kalem" sayısı raporla aynı ölçüdür (`report_range.items`): iptal edilmemiş adetlerin toplamı. */
export const orderQuantity = (items: PricedItem[]): number =>
  items.reduce((sum, i) => (i.status === 'active' ? sum + i.quantity : sum), 0);

export type TimelineEvent =
  | { kind: 'created' | 'ready' | 'served' | 'cancelled'; at: string; actorId: string | null }
  | {
      kind: 'item_cancelled';
      at: string;
      actorId: string | null;
      item: string;
      reason: string | null;
    };

export interface TimelineSource {
  waiter_id: string;
  created_at: string;
  ready_at: string | null;
  ready_by: string | null;
  served_at: string | null;
  served_by: string | null;
  cancelled_at: string | null;
  order_items: {
    product_name: string;
    quantity: number;
    status: OrderItemStatus;
    cancel_reason: string | null;
    cancelled_at: string | null;
    cancelled_by: string | null;
  }[];
}

/**
 * Siparişin zaman çizelgesi. Kalem iptalleri de olaydır: "sipariş iptal" çoğu zaman son kalemin
 * iptalinin sonucudur (`cancel_order_item` son aktif kalemde siparişi kapatır) ve admin'in asıl
 * sorusu "kim, ne zaman, neden" olur. Siparişin kendi iptalinde kişi tutulmaz (`cancelled_by` yok).
 */
export function orderTimeline(o: TimelineSource): TimelineEvent[] {
  const events: TimelineEvent[] = [{ kind: 'created', at: o.created_at, actorId: o.waiter_id }];
  if (o.ready_at) events.push({ kind: 'ready', at: o.ready_at, actorId: o.ready_by });
  if (o.served_at) events.push({ kind: 'served', at: o.served_at, actorId: o.served_by });
  if (o.cancelled_at) events.push({ kind: 'cancelled', at: o.cancelled_at, actorId: null });
  for (const i of o.order_items) {
    if (i.status !== 'cancelled' || !i.cancelled_at) continue;
    events.push({
      kind: 'item_cancelled',
      at: i.cancelled_at,
      actorId: i.cancelled_by,
      item: `${i.quantity}× ${i.product_name}`,
      reason: i.cancel_reason,
    });
  }
  // Kararlı sıralama: aynı andaki olaylar eklenme sırasını korur (oluşturuldu hep önce).
  return events.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
}

const KINDS: readonly TicketPayload['kind'][] = [
  'order',
  'addition',
  'storno',
  'table_move',
  'reprint',
  'test',
];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

const isItem = (v: unknown): boolean =>
  isRecord(v) &&
  typeof v.qty === 'number' &&
  typeof v.name === 'string' &&
  Array.isArray(v.without) &&
  Array.isArray(v.groups);

/**
 * Fiş işinin `payload`'u `jsonb` gelir. Önizleme `renderTicket`'a verilmeden önce biçimi
 * doğrulanır: eski ya da elle yazılmış bir iş çizimi patlatırsa bütün çekmece kapanırdı.
 */
export function parseTicketPayload(v: unknown): TicketPayload | null {
  if (!isRecord(v)) return null;
  if (!KINDS.includes(v.kind as TicketPayload['kind'])) return null;
  if (typeof v.header !== 'string' || typeof v.table !== 'string') return null;
  if (!Array.isArray(v.items) || !v.items.every(isItem)) return null;
  return v as unknown as TicketPayload;
}
