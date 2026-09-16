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

const BUSINESS_DAY_START_HOUR = 5;

/**
 * İş günü (BUILD-PROMPT §5): Europe/Berlin saatiyle 05:00'ten önce olan her şey bir önceki güne
 * yazılır — sunucudaki `orders.business_date` ile aynı kural. Saat dilimi dönüşümü yaz/kış
 * saatini de kapsasın diye elle ofset eklenmez, `Intl` kullanılır; gün geri alınırken UTC öğlen
 * seçilir, böylece DST geçişinde tarih kaymaz.
 */
export function businessDate(now: Date): string {
  const [date = '', time = '00'] = BERLIN.format(now).split(' ');
  if (Number(time.slice(0, 2)) >= BUSINESS_DAY_START_HOUR) return date;
  const previous = new Date(`${date}T12:00:00Z`);
  previous.setUTCDate(previous.getUTCDate() - 1);
  return previous.toISOString().slice(0, 10);
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
export function agoParts(iso: string | null | undefined, now: Date): { unit: AgoUnit; count: number } | null {
  if (!iso) return null;
  const diff = now.getTime() - new Date(iso).getTime();
  if (diff < MINUTE) return { unit: 'now', count: 0 };
  if (diff < HOUR) return { unit: 'minutes', count: Math.floor(diff / MINUTE) };
  if (diff < DAY) return { unit: 'hours', count: Math.floor(diff / HOUR) };
  return { unit: 'days', count: Math.floor(diff / DAY) };
}
