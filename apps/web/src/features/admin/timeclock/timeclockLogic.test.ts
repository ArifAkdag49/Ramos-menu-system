import { describe, expect, it } from 'vitest';
import {
  addDays,
  berlinToday,
  buildWeekRows,
  fmtMinutes,
  fromInput,
  mondayOf,
  pairUrl,
  parseRadius,
  scanUrl,
  toInput,
  type Shift,
  type WeekData,
} from './timeclockLogic';

const shift = (p: Partial<Shift>): Shift => ({
  id: 's',
  staff_id: 'a',
  work_date: '2026-11-09',
  start: '2026-11-09 09:00',
  end: '2026-11-09 17:00',
  minutes: 480,
  missing_end: false,
  edited: false,
  manual: false,
  location_failed: false,
  ...p,
});

describe('timeclockLogic', () => {
  it('tarih hesapları: pazartesi, gün ekleme, Berlin bugünü', () => {
    expect(mondayOf('2026-11-12')).toBe('2026-11-09');
    expect(mondayOf('2026-11-09')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09'); // pazar
    expect(addDays('2026-10-25', 1)).toBe('2026-10-26'); // yaz saati bitişi
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
    // Berlin'de gece 00:30, UTC'de hâlâ önceki gün.
    expect(berlinToday(new Date('2026-11-11T23:30:00Z'))).toBe('2026-11-12');
  });

  it('süre ve girdi biçimleri', () => {
    expect(fmtMinutes(450)).toBe('7:30');
    expect(fmtMinutes(5)).toBe('0:05');
    expect(toInput('2026-11-09 09:05')).toBe('2026-11-09T09:05');
    expect(toInput(null)).toBe('');
    expect(fromInput('2026-11-09T09:05')).toBe('2026-11-09 09:05');
    expect(scanUrl('https://x.de', 'abc')).toBe('https://x.de/mesai/abc');
    expect(pairUrl('https://x.de', 'k')).toBe('https://x.de/mesai/bagla/k');
  });

  it('yarıçap 50–1000 arası tam sayı', () => {
    expect(parseRadius('150')).toBe(150);
    expect(parseRadius(' 50 ')).toBe(50);
    expect(parseRadius('49')).toBeNull();
    expect(parseRadius('1001')).toBeNull();
    expect(parseRadius('12.5')).toBeNull();
    expect(parseRadius('')).toBeNull();
  });

  it('haftalık satırlar: gün gün mesai, açık mesai toplama girmez, pasif ve boş kişi gizlenir', () => {
    const days = Array.from({ length: 7 }, (_, i) => addDays('2026-11-09', i));
    const week: WeekData = {
      days,
      staff: [
        { id: 'a', name: 'Ayşe', active: true },
        { id: 'b', name: 'Bekir', active: true },
        { id: 'c', name: 'Cem (ayrıldı)', active: false },
        { id: 'd', name: 'Derya (ayrıldı)', active: false },
      ],
      shifts: [
        shift({ id: '1', staff_id: 'a' }),
        shift({ id: '2', staff_id: 'a', work_date: '2026-11-10', start: '2026-11-10 18:00', end: '2026-11-11 01:30', minutes: 450 }),
        shift({ id: '3', staff_id: 'a', work_date: '2026-11-12', end: null, minutes: null }),
        shift({ id: '4', staff_id: 'c', work_date: '2026-11-09', minutes: 60 }),
      ],
    };
    const rows = buildWeekRows(week);
    expect(rows.map((r) => r.name)).toEqual(['Ayşe', 'Bekir', 'Cem (ayrıldı)']);
    const a = rows[0]!;
    expect(a.totalMinutes).toBe(930);
    // Gece yarısını geçen mesai başladığı güne yazılır.
    expect(a.days['2026-11-10']!.map((s) => s.id)).toEqual(['2']);
    expect(a.days['2026-11-11']).toEqual([]);
    expect(rows[1]!.totalMinutes).toBe(0);
    expect(Object.keys(rows[1]!.days)).toEqual(days);
  });
});
