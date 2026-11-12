/**
 * Mesai takibi (0020) — sunucu yanıtlarının şekli ve ekranın saf hesapları. Saatler sunucudan Berlin
 * yerel saatiyle "YYYY-MM-DD HH:MM" metni olarak gelir; tarayıcının saat dilimi hiçbir yerde kullanılmaz.
 */

export interface TimeclockSettings {
  qr_token: string;
  location_check: boolean;
  has_location: boolean;
  radius_m: number;
}

export interface TimeclockStaff {
  id: string;
  name: string;
  active: boolean;
  paired: boolean;
  working: boolean;
  since: string | null;
}

export interface TimeclockOverview {
  settings: TimeclockSettings;
  staff: TimeclockStaff[];
}

export interface Shift {
  id: string;
  staff_id: string;
  work_date: string;
  start: string;
  end: string | null;
  minutes: number | null;
  missing_end: boolean;
  edited: boolean;
  manual: boolean;
  location_failed: boolean;
}

export interface WeekData {
  days: string[];
  staff: { id: string; name: string; active: boolean }[];
  shifts: Shift[];
}

export interface WeekRow {
  id: string;
  name: string;
  totalMinutes: number;
  days: Record<string, Shift[]>;
}

export interface ShiftEdit {
  old_start: string | null;
  old_end: string | null;
  new_start: string;
  new_end: string | null;
  reason: string;
  by: string | null;
  at: string;
}

export interface ScanResult {
  action: 'in' | 'out' | 'ignored';
  name: string;
  open: boolean;
  at: string;
  minutes?: number;
}

/** "YYYY-MM-DD" + n gün (UTC öğlen üzerinden: yaz saati geçişi günü kaydırmaz). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Haftanın pazartesisi. */
export function mondayOf(date: string): string {
  const weekday = new Date(`${date}T12:00:00Z`).getUTCDay(); // 0 = pazar
  return addDays(date, -((weekday + 6) % 7));
}

/** Berlin'de bugünün tarihi. */
export function berlinToday(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Berlin',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
}

/** "2026-11-09" → "09.11.2026". */
export const dmy = (date: string) => date.split('-').reverse().join('.');

/** 450 → "7:30". */
export const fmtMinutes = (m: number) => `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;

/** "YYYY-MM-DD HH:MM" → "HH:MM". */
export const hhmm = (local: string) => local.slice(11, 16);

/**
 * Haftalık tablo satırları: kişi başına gün gün mesailer ve toplam. Pasif ve o hafta hiç mesaisi olmayan
 * kişi gösterilmez (eski personel tabloyu kalabalıklaştırmasın); pasif ama o hafta çalışmış kişi görünür.
 */
export function buildWeekRows(week: WeekData): WeekRow[] {
  const byStaff = new Map<string, Shift[]>();
  for (const sh of week.shifts) {
    const list = byStaff.get(sh.staff_id) ?? [];
    list.push(sh);
    byStaff.set(sh.staff_id, list);
  }
  return week.staff.flatMap((p) => {
    const mine = byStaff.get(p.id) ?? [];
    if (mine.length === 0 && !p.active) return [];
    const days: Record<string, Shift[]> = Object.fromEntries(week.days.map((d) => [d, [] as Shift[]]));
    let totalMinutes = 0;
    for (const sh of mine) {
      totalMinutes += sh.minutes ?? 0;
      (days[sh.work_date] ??= []).push(sh);
    }
    return [{ id: p.id, name: p.name, totalMinutes, days }];
  });
}

/** "YYYY-MM-DD HH:MM" ↔ `<input type="datetime-local">` değeri. */
export const toInput = (local: string | null) => (local ? local.replace(' ', 'T').slice(0, 16) : '');
export const fromInput = (v: string) => v.replace('T', ' ');

export const scanUrl = (origin: string, qr: string) => `${origin}/mesai/${qr}`;
export const pairUrl = (origin: string, code: string) => `${origin}/mesai/bagla/${code}`;

export const RADIUS_MIN = 50;
export const RADIUS_MAX = 1000;

/** Yarıçap girdisi: tam sayı ve 50–1000 m arası; değilse `null`. */
export function parseRadius(input: string): number | null {
  const n = Number(input.trim());
  return Number.isInteger(n) && n >= RADIUS_MIN && n <= RADIUS_MAX ? n : null;
}
