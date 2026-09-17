import { describe, expect, it } from 'vitest';
import {
  addDays,
  agoParts,
  businessDate,
  businessDayStartUtc,
  dashboardStats,
  dateRangeError,
  formatBusinessDay,
} from './dashboardLogic';

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

// M6 kapisi (H3): ekranda tarih her yerde dd.MM.yyyy (BUILD-PROMPT §5); ISO biçim yalnız RPC'ye gider.
describe('formatBusinessDay', () => {
  it('ISO tarihi dd.MM.yyyy yapar', () => expect(formatBusinessDay('2026-09-16')).toBe('16.09.2026'));
  it('beklenmeyen biçimi olduğu gibi bırakır', () => expect(formatBusinessDay('bugün')).toBe('bugün'));
  it('businessDate çıktısıyla birlikte çalışır', () =>
    expect(formatBusinessDay(businessDate(new Date('2026-01-10T03:30:00Z')))).toBe('09.01.2026'));
});

// Görev 23: sipariş ve denetim ekranları tarih aralığını iş günü olarak alır. Denetim kaydında
// `at` bir zaman damgasıdır; iş gününün sınırı (Berlin 05:00) UTC'ye burada çevrilir.
describe('businessDayStartUtc (iş günü Berlin 05:00 → UTC)', () => {
  it('yaz saatinde 03:00 UTC', () =>
    expect(businessDayStartUtc('2026-09-17')).toBe('2026-09-17T03:00:00.000Z'));

  it('kış saatinde 04:00 UTC', () =>
    expect(businessDayStartUtc('2026-01-10')).toBe('2026-01-10T04:00:00.000Z'));

  it('yaz saatine geçilen gün (29.03.2026) 05:00 zaten yaz saatidir', () =>
    expect(businessDayStartUtc('2026-03-29')).toBe('2026-03-29T03:00:00.000Z'));

  it('kış saatine dönülen gün (25.10.2026) 05:00 zaten kış saatidir', () =>
    expect(businessDayStartUtc('2026-10-25')).toBe('2026-10-25T04:00:00.000Z'));

  it('businessDate ile tutarlı: sınırın 1 ms öncesi önceki iş günüdür', () => {
    const start = new Date(businessDayStartUtc('2026-09-17'));
    expect(businessDate(start)).toBe('2026-09-17');
    expect(businessDate(new Date(start.getTime() - 1))).toBe('2026-09-16');
  });
});

describe('addDays', () => {
  it('ay ve yıl sınırını geçer', () => {
    expect(addDays('2026-09-30', 1)).toBe('2026-10-01');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('dateRangeError (en fazla 31 gün, iki uç dahil)', () => {
  it('geçerli aralık → null', () => expect(dateRangeError('2026-09-01', '2026-10-01')).toBeNull());
  it('tek gün → null', () => expect(dateRangeError('2026-09-17', '2026-09-17')).toBeNull());
  it('bitiş başlangıçtan önce → range_invalid', () =>
    expect(dateRangeError('2026-09-17', '2026-09-16')).toBe('range_invalid'));
  it('olmayan tarih → range_invalid', () =>
    expect(dateRangeError('2026-02-30', '2026-03-01')).toBe('range_invalid'));
  it('32 gün → range_too_long', () =>
    expect(dateRangeError('2026-09-01', '2026-10-02')).toBe('range_too_long'));
});
