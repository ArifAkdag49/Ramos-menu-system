import { describe, expect, it } from 'vitest';
import { agoParts, businessDate, dashboardStats } from './dashboardLogic';

describe('dashboardStats', () => {
  it('açık masa, mutfak, hazır ve açık tutar toplamı', () => {
    expect(
      dashboardStats([
        { session_id: null, orders_in_kitchen: 0, orders_ready: 0, total_cents: 0 },
        { session_id: 'a', orders_in_kitchen: 2, orders_ready: 0, total_cents: 1950 },
        { session_id: 'b', orders_in_kitchen: 0, orders_ready: 1, total_cents: 2300 },
      ] as never),
    ).toEqual({ openTables: 2, inKitchen: 2, ready: 1, openValueCents: 4250 });
  });

  it('masa yoksa hepsi sıfır', () =>
    expect(dashboardStats([])).toEqual({ openTables: 0, inKitchen: 0, ready: 0, openValueCents: 0 }));
});

describe('businessDate (Europe/Berlin + 05:00)', () => {
  // Yaz saati: Berlin = UTC+2. 16 Eylül 02:30 UTC → 04:30 Berlin → hâlâ önceki iş günü.
  it('05:00 öncesi bir önceki güne sayılır', () =>
    expect(businessDate(new Date('2026-09-16T02:30:00Z'))).toBe('2026-09-15'));

  it('05:00 iş gününü başlatır', () =>
    expect(businessDate(new Date('2026-09-16T03:00:00Z'))).toBe('2026-09-16'));

  it('gece yarısından hemen sonra da önceki gündür', () =>
    expect(businessDate(new Date('2026-09-16T22:10:00Z'))).toBe('2026-09-16'));

  // Kış saati: Berlin = UTC+1. 10 Ocak 04:30 UTC → 05:30 Berlin → yeni iş günü.
  it('kış saatinde de Berlin duvar saatine göre hesaplanır', () => {
    expect(businessDate(new Date('2026-01-10T03:30:00Z'))).toBe('2026-01-09');
    expect(businessDate(new Date('2026-01-10T04:30:00Z'))).toBe('2026-01-10');
  });

  it('ay başında bir gün geri gidince ay da döner', () =>
    expect(businessDate(new Date('2026-03-01T01:00:00Z'))).toBe('2026-02-28'));
});

describe('agoParts', () => {
  const now = new Date('2026-09-16T12:00:00Z');

  it('bir dakikanın altı "az önce"', () =>
    expect(agoParts('2026-09-16T11:59:30Z', now)).toEqual({ unit: 'now', count: 0 }));

  it('dakika', () => expect(agoParts('2026-09-16T11:58:00Z', now)).toEqual({ unit: 'minutes', count: 2 }));

  it('saat', () => expect(agoParts('2026-09-16T09:00:00Z', now)).toEqual({ unit: 'hours', count: 3 }));

  it('gün', () => expect(agoParts('2026-09-14T12:00:00Z', now)).toEqual({ unit: 'days', count: 2 }));

  it('tarih yoksa null', () => expect(agoParts(null, now)).toBeNull());

  // Saatler istemci ile sunucu arasında birkaç saniye kayabilir; ileri tarih "-1 dk önce" olmaz.
  it('gelecekteki bir tarih "az önce" sayılır', () =>
    expect(agoParts('2026-09-16T12:00:20Z', now)).toEqual({ unit: 'now', count: 0 }));
});
