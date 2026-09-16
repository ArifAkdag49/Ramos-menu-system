import { describe, expect, it } from 'vitest';
import {
  formatTime,
  menuBody,
  printBadge,
  sortOrderItems,
  sortReady,
  sortTables,
  tableBody,
  tableTone,
} from './waiterLogic';

describe('waiterLogic', () => {
  it('masa tonu', () => {
    expect(tableTone({ session_id: null, orders_ready: 0 } as never)).toBe('free');
    expect(tableTone({ session_id: 's', orders_ready: 0 } as never)).toBe('open');
    expect(tableTone({ session_id: 's', orders_ready: 2 } as never)).toBe('ready');
  });

  it('hazır listesi: önce benimkiler, sonra hazır olma sırası', () => {
    const o = (id: string, waiter_id: string, ready_at: string) => ({ id, waiter_id, ready_at }) as never;
    expect(
      sortReady(
        [o('a', 'x', '2026-09-15T18:01:00Z'), o('b', 'me', '2026-09-15T18:05:00Z'), o('c', 'x', '2026-09-15T18:00:00Z')],
        'me',
      ).map((r: { id: string }) => r.id),
    ).toEqual(['b', 'c', 'a']);
  });

  it('yazdırma rozeti', () => {
    expect(printBadge({ status: 'printed' } as never)).toBe('printed');
    expect(printBadge({ status: 'pending' } as never)).toBe('queued');
    expect(printBadge({ status: 'printing' } as never)).toBe('queued');
    expect(printBadge({ status: 'failed' } as never)).toBe('failed');
    expect(printBadge(null)).toBeNull();
  });

  it('saat: Europe/Berlin dilimine göre biçimlenir (spec §8.2 "19:42" örneği)', () => {
    // Eylülde Almanya CEST'te (UTC+2): 17:42 UTC -> 19:42 yerel.
    expect(formatTime('2026-09-15T17:42:00Z')).toBe('19:42');
  });
});

/**
 * R76: boş masada spinner göstermek BUILD-PROMPT §10.8'i ("boş durumlar yol gösterir") çiğniyordu —
 * her arka plan tazelemesinde "Bu masada sipariş yok — Sipariş al" yerine dönen bir çember
 * çıkıyordu (M3 kapısının referans görüntüsü de bu yüzden boş çıktı). Spinner yalnız ilk yükleme.
 */
describe('tableBody (R76)', () => {
  it('ilk yüklemede (veri hiç gelmemiş, sorgu uçuyor) yükleniyor gösterir', () => {
    expect(tableBody(false, true)).toBe('loading');
  });

  it('arka plan tazelemesinde boş durum korunur', () => {
    expect(tableBody(false, false)).toBe('empty');
  });

  it('oturum varsa ilk yükleme bitmiş sayılır ve siparişler çizilir', () => {
    expect(tableBody(true, false)).toBe('orders');
    expect(tableBody(true, true)).toBe('orders');
  });
});

/**
 * O1 (M3 tasarım kapısı): masa ızgarası sunucu sırasında geliyordu — 12 boş masa önde, açık ve
 * hazır masalar katlamanın altında. Garsonun ekranı açtığı andaki tek sorusu "hangi masam beni
 * bekliyor"; sıralama bunu cevaplar: önce HAZIR (altın), sonra AÇIK (lime), en sonda boş masalar.
 * Grup içi sıra bozulmaz — masa numaraları kendi aralarında yer değiştirirse garson ezberini
 * kaybeder.
 */
describe('sortTables (O1)', () => {
  const row = (name: string, tone: 'free' | 'open' | 'ready') =>
    ({
      name,
      session_id: tone === 'free' ? null : `s-${name}`,
      orders_ready: tone === 'ready' ? 1 : 0,
    }) as never;

  it('hazır → açık → boş sırasına dizer', () => {
    expect(
      sortTables([
        row('1', 'free'),
        row('2', 'open'),
        row('3', 'free'),
        row('4', 'ready'),
      ]).map((r: { name: string }) => r.name),
    ).toEqual(['4', '2', '1', '3']);
  });

  it('aynı gruptaki masalar sunucu sırasını korur (kararlı sıralama)', () => {
    expect(
      sortTables([row('12', 'open'), row('3', 'open'), row('7', 'open')]).map((r: { name: string }) => r.name),
    ).toEqual(['12', '3', '7']);
  });

  it('girdi dizisini değiştirmez', () => {
    const rows = [row('1', 'free'), row('2', 'ready')];
    sortTables(rows);
    expect(rows.map((r: { name: string }) => r.name)).toEqual(['1', '2']);
  });
});

/**
 * Y8 (M3 tasarım kapısı): iptal edilmiş kalem sunucu sırasında ilk sırada duruyordu; kartın en
 * değerli satırı "yapılmayacak iş"e gidiyordu. Görünümde sona alınır — veri sırası değişmez.
 */
describe('sortOrderItems (Y8)', () => {
  const item = (id: string, status: 'active' | 'cancelled') => ({ id, status }) as never;

  it('iptal edilmiş kalemler listenin sonuna iner', () => {
    expect(
      sortOrderItems([
        item('a', 'cancelled'),
        item('b', 'active'),
        item('c', 'cancelled'),
        item('d', 'active'),
      ]).map((i: { id: string }) => i.id),
    ).toEqual(['b', 'd', 'a', 'c']);
  });

  it('grup içi sıra korunur (fiş sırası = mutfak sırası)', () => {
    expect(
      sortOrderItems([item('x', 'active'), item('y', 'active')]).map((i: { id: string }) => i.id),
    ).toEqual(['x', 'y']);
  });

  it('girdi dizisini değiştirmez', () => {
    const items = [item('a', 'cancelled'), item('b', 'active')];
    sortOrderItems(items);
    expect(items.map((i: { id: string }) => i.id)).toEqual(['a', 'b']);
  });
});

/**
 * Y1 (M3 tasarım kapısı): sipariş girişi menü gelene kadar bomboştu (`m3-order-loading-390.png`),
 * oysa masa ızgarasında iskelet vardı. 107 ürünlük menü restoran Wi-Fi'siyle saniyeler sürüyor;
 * garson ekranı "bozuk" sanıp geri çıkıyordu. `tableBody` ile aynı kural: iskelet yalnız ilk
 * yüklemede, arka plan tazelemesinde eldeki menü ekranda kalır.
 */
describe('menuBody (Y1)', () => {
  it('ilk yüklemede iskelet gösterir', () => {
    expect(menuBody(false, true)).toBe('loading');
  });

  it('arka plan tazelemesinde menü ekranda kalır', () => {
    expect(menuBody(true, true)).toBe('menu');
  });

  it('yükleme bitmişse iskelet gösterilmez', () => {
    expect(menuBody(true, false)).toBe('menu');
    expect(menuBody(false, false)).toBe('menu');
  });
});
