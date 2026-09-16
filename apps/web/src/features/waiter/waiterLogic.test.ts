import { describe, expect, it } from 'vitest';
import { formatTime, printBadge, sortReady, tableTone } from './waiterLogic';

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
