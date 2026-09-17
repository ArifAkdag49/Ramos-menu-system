import type { TableRow } from '../../data/tables';

export interface DashboardStats {
  openTables: number;
  inKitchen: number;
  ready: number;
  openValueCents: number;
}

/** Masa özetinden dört canlı sayıyı tek geçişte çıkarır. Kapalı masalar hiçbir toplamı beslemez. */
export function dashboardStats(tables: TableRow[]): DashboardStats {
  return tables.reduce<DashboardStats>(
    (acc, t) =>
      t.session_id
        ? {
            openTables: acc.openTables + 1,
            inKitchen: acc.inKitchen + t.orders_in_kitchen,
            ready: acc.ready + t.orders_ready,
            openValueCents: acc.openValueCents + t.total_cents,
          }
        : acc,
    { openTables: 0, inKitchen: 0, ready: 0, openValueCents: 0 },
  );
}

/**
 * Berlin duvar saatini `yyyy-MM-dd HH:mm` olarak verir. `sv-SE` yerel ayarı bu biçimi zaten ISO
 * sırasıyla üretir, böylece ayrı ayrı `formatToParts` gezmeye gerek kalmaz.
 */
const BERLIN = new Intl.DateTimeFormat('sv-SE', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Ayar gelmeden önce kullanılan iş günü başlangıcı (dakika). Sunucudaki varsayılanla aynıdır:
 * `settings.business_day_start time not null default '05:00'`.
 */
export const DEFAULT_DAY_START_MINUTES = 5 * 60;

const TIME_OF_DAY = /^([01]\d|2[0-3]):([0-5]\d)(?::[0-5]\d(?:\.\d+)?)?$/;

/**
 * R86 — iş gününün başlangıcı sabit değil, `settings.business_day_start` ayarıdır. Postgres `time`
 * sütunu "05:00:00", form "05:00" verir; ikisi de gece yarısından dakikaya çevrilir. Ayar daha
 * gelmediyse ya da okunamıyorsa varsayılan 05:00 kullanılır — ekran bekletilmez.
 */
export function dayStartMinutes(value: string | null | undefined): number {
  const m = TIME_OF_DAY.exec(value ?? '');
  return m ? Number(m[1]) * 60 + Number(m[2]) : DEFAULT_DAY_START_MINUTES;
}

/** Dakikayı operatörün gördüğü "05:00" biçimine çevirir (iki dilde aynı, 24 saat). */
export function formatDayStart(minutes: number): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/**
 * İş günü (BUILD-PROMPT §5): Europe/Berlin saatiyle iş günü başlangıcından (`dayStart`, dakika;
 * varsayılan 05:00) önce olan her şey bir önceki güne yazılır — sunucudaki `public.business_date`
 * ile aynı kural (Berlin duvar saati − başlangıç). Saat dilimi dönüşümü yaz/kış saatini de
 * kapsasın diye elle ofset eklenmez, `Intl` kullanılır; gün geri alınırken UTC öğlen seçilir,
 * böylece DST geçişinde tarih kaymaz.
 */
export function businessDate(now: Date, dayStart: number): string {
  const [date = '', time = '00:00'] = BERLIN.format(now).split(' ');
  const [hour = 0, minute = 0] = time.split(':').map(Number);
  if (hour * 60 + minute >= dayStart) return date;
  const previous = new Date(`${date}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
}

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** `yyyy-MM-dd` gerçek bir takvim günü mü? "2026-02-30" gibi taşan tarihler reddedilir. */
function parseIsoDate(iso: string): number | null {
  const m = ISO_DATE.exec(iso);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(ms).toISOString().slice(0, 10) === iso ? ms : null;
}

/** Takvim gününe gün ekler (UTC üzerinden: yaz/kış saati gün sayısını kaydırmaz). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type DateRangeError = 'range_invalid' | 'range_too_long';

/** Sipariş ve denetim ekranlarında seçilebilecek en uzun aralık (iki uç dahil). */
export const MAX_RANGE_DAYS = 31;

/**
 * Tarih aralığı denetimi. Sınır sorgu maliyeti içindir: sipariş listesi iç içe kalem ve fiş işi
 * taşır, aylarca geriye bakan bir sorgu telefonda sayfayı kilitlerdi. Uzun dönem için Raporlar var.
 */
export function dateRangeError(from: string, to: string): DateRangeError | null {
  const a = parseIsoDate(from);
  const b = parseIsoDate(to);
  if (a === null || b === null || b < a) return 'range_invalid';
  return Math.round((b - a) / DAY_MS) + 1 > MAX_RANGE_DAYS ? 'range_too_long' : null;
}

/** Europe/Berlin'in verilen andaki UTC farkı (dakika). `Intl` yaz/kış saatini kendisi bilir. */
function berlinOffsetMinutes(at: number): number {
  const parts = BERLIN_PARTS.formatToParts(new Date(at));
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const wall = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour') % 24, get('minute'));
  return Math.round((wall - at) / 60_000);
}

const BERLIN_PARTS = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Europe/Berlin',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  hourCycle: 'h23',
});

/**
 * İş gününün başladığı an (Berlin, `dayStart` dakika) UTC olarak. Denetim kaydı `at` zaman
 * damgasıyla süzülür, `business_date` sütunu yoktur; bu yüzden gün sınırı burada çevrilir. Ofset,
 * tahmin edilen anın **kendisinde** yeniden okunur: geçiş gecesinde 05:00 zaten yeni ofsettedir.
 */
export function businessDayStartUtc(isoDate: string, dayStart: number): string {
  const [y = 0, m = 1, d = 1] = isoDate.split('-').map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, dayStart);
  const guess = wall - berlinOffsetMinutes(wall) * 60_000;
  return new Date(wall - berlinOffsetMinutes(guess) * 60_000).toISOString();
}

/**
 * İş gününü operatöre gösterirken kullanılan biçim. Arayüzde tarih her yerde `dd.MM.yyyy`dir
 * (BUILD-PROMPT §5); `yyyy-MM-dd` yalnız RPC'ye giden değerdir, ekrana yazılmaz.
 */
export function formatBusinessDay(isoDate: string): string {
  const [year, month, day] = isoDate.split('-');
  return year && month && day ? `${day}.${month}.${year}` : isoDate;
}

export type AgoUnit = 'now' | 'minutes' | 'hours' | 'days';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "Ne kadar önce" değerini i18n'in sayabileceği iki parçaya ayırır (`{ unit, count }`).
 * İstemci saati sunucununkinden birkaç saniye ileride olabilir; negatif fark "az önce" sayılır,
 * yoksa ekranda "-1 dk önce" görünürdü.
 */
export function agoParts(
  iso: string | null | undefined,
  now: Date,
): { unit: AgoUnit; count: number } | null {
  if (!iso) return null;
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < MINUTE) return { unit: 'now', count: 0 };
  if (diff < HOUR) return { unit: 'minutes', count: Math.floor(diff / MINUTE) };
  if (diff < DAY) return { unit: 'hours', count: Math.floor(diff / HOUR) };
  return { unit: 'days', count: Math.floor(diff / DAY) };
}
