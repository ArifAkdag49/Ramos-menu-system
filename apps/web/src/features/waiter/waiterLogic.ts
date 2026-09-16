import type { OrderItemView, OrderView } from '../../data/orders';
import type { TableRow } from '../../data/tables';

/** Masa kartının tonu: boş (gri) · açık (lime) · hazır bekleyen (altın). */
export const tableTone = (r: Pick<TableRow, 'session_id' | 'orders_ready'>): 'free' | 'open' | 'ready' =>
  !r.session_id ? 'free' : r.orders_ready > 0 ? 'ready' : 'open';

/** Hazır sekmesi sırası: önce garsonun kendi siparişleri, sonra hazır olma zamanı. */
export const sortReady = (orders: OrderView[], meId: string): OrderView[] =>
  [...orders].sort(
    (a, b) => Number(b.waiter_id === meId) - Number(a.waiter_id === meId) || (a.ready_at ?? '').localeCompare(b.ready_at ?? ''),
  );

/** Yazdırma durumundan tek bir rozet çıkarır: `pending`/`printing` tek "kuyrukta" görünümüne indirgenir. */
export const printBadge = (p: OrderView['print']): 'printed' | 'queued' | 'failed' | null =>
  !p ? null : p.status === 'printed' ? 'printed' : p.status === 'failed' ? 'failed' : 'queued';

const timeFormatter = new Intl.DateTimeFormat('de-DE', {
  timeZone: 'Europe/Berlin',
  hour: '2-digit',
  minute: '2-digit',
});

/** Saat dilimi her zaman Europe/Berlin (global-constraints §5), biçim "19:42". */
export const formatTime = (iso: string): string => timeFormatter.format(new Date(iso));

/**
 * Masa detayının ana gövdesi. Spinner yalnız **ilk yüklemede** (`firstLoad` = react-query'nin
 * `isLoading`'i: elde hiç veri yok ve sorgu uçuyor); arka plan tazelemesinde boş durum korunur —
 * yoksa boş masada her tazelemede "Bu masada sipariş yok — Sipariş al" yerine dönen bir çember
 * çıkar (R76 / BUILD-PROMPT §10.8).
 */
export const tableBody = (hasSession: boolean, firstLoad: boolean): 'loading' | 'empty' | 'orders' =>
  hasSession ? 'orders' : firstLoad ? 'loading' : 'empty';

const TABLE_ORDER: Record<'free' | 'open' | 'ready', number> = { ready: 0, open: 1, free: 2 };

/**
 * Masa ızgarasının görünüm sırası: **hazır → açık → boş** (M3 tasarım kapısı O1).
 *
 * Sunucu sırası masa numarasıdır; ekranı açan garsonun tek sorusu ise "hangi masam beni
 * bekliyor". Boş masalar çoğunlukta olduğu için varsayılan görünümde açık ve hazır masalar
 * katlamanın altında kalıyordu. Sıralama kararlıdır: grup içinde masa numarası sırası bozulmaz,
 * yoksa garson ızgaradaki yer ezberini kaybeder.
 */
export const sortTables = <T extends Pick<TableRow, 'session_id' | 'orders_ready'>>(rows: T[]): T[] =>
  [...rows].sort((a, b) => TABLE_ORDER[tableTone(a)] - TABLE_ORDER[tableTone(b)]);

/**
 * Kalem listesinin görünüm sırası: iptal edilmiş kalemler **sona** iner (M3 tasarım kapısı Y8).
 *
 * Veri sırası (fiş sırası: içecekler sonda, kategori sırası, kalem sırası) değişmez — yalnız
 * ekranda "yapılmayacak iş" kartın en değerli ilk satırını harcamasın diye kaydırılır.
 */
export const sortOrderItems = <T extends Pick<OrderItemView, 'status'>>(items: T[]): T[] =>
  [...items].sort((a, b) => Number(a.status === 'cancelled') - Number(b.status === 'cancelled'));

/**
 * Sipariş girişinin gövdesi (M3 tasarım kapısı Y1). `tableBody` ile aynı kural: iskelet yalnız
 * **ilk yüklemede** görünür (elde hiç ürün yok ve sorgu uçuyor); arka plan tazelemesinde eldeki
 * menü ekranda kalır, yoksa her tazelemede 107 ürünlük liste iskelete dönüşüp kaydırma yeri
 * kaybolurdu.
 */
export const menuBody = (hasProducts: boolean, firstLoad: boolean): 'loading' | 'menu' =>
  hasProducts || !firstLoad ? 'menu' : 'loading';
