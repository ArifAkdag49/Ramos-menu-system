import type { ReportHourRow } from '../../../data/reports';
import { addDays } from '../dashboardLogic';
import { isTestAccount } from '../staff/staffLogic';

export type RangePreset = 'today' | 'yesterday' | 'last7' | 'thisMonth';

/** Sıra hem düğme sırası hem de çakışmada öncelik sırasıdır (dar aralık önce). */
export const RANGE_PRESETS: readonly RangePreset[] = ['today', 'yesterday', 'last7', 'thisMonth'];

/**
 * Hazır aralıklar. `today` iş günüdür (`businessDate`), takvim günü değil. Hepsi 31 gün sınırının
 * (`MAX_RANGE_DAYS`) içinde kalır: "Bu ay" en fazla 31, "Son 7 gün" bugünü de sayar.
 */
export function presetRange(preset: RangePreset, today: string): { from: string; to: string } {
  switch (preset) {
    case 'today':
      return { from: today, to: today };
    case 'yesterday': {
      const day = addDays(today, -1);
      return { from: day, to: day };
    }
    case 'last7':
      return { from: addDays(today, -6), to: today };
    case 'thisMonth':
      return { from: `${today.slice(0, 8)}01`, to: today };
  }
}

/** Seçili aralık bir hazır seçeneğe denk geliyorsa onu verir (düğmenin basılı görünmesi için). */
export function activePreset(from: string, to: string, today: string): RangePreset | null {
  return (
    RANGE_PRESETS.find((p) => {
      const r = presetRange(p, today);
      return r.from === from && r.to === to;
    }) ?? null
  );
}

/**
 * Saatlik dağılımın satırları. Saatler iş günü sırasıyla dizilir (05:00 başlangıçta 05 … 23, 00 …
 * 04) — gece yarısını geçen servis grafiğin sonunda kalır, başına atlamaz. İlk ve son dolu saat
 * arasındaki boş saatler 0 ile doldurulur: "o saatte hiç sipariş yok" da bilgidir.
 */
export function hourRows(byHour: ReportHourRow[], dayStart: number): ReportHourRow[] {
  const startHour = Math.floor(dayStart / 60) % 24;
  const slot = (hour: number) => (hour - startHour + 24) % 24;
  const counts = new Map<number, number>();
  for (const r of byHour) {
    if (!Number.isInteger(r.hour) || r.hour < 0 || r.hour > 23) continue;
    counts.set(slot(r.hour), (counts.get(slot(r.hour)) ?? 0) + r.orders);
  }
  if (counts.size === 0) return [];
  const slots = [...counts.keys()];
  const first = Math.min(...slots);
  const last = Math.max(...slots);
  return Array.from({ length: last - first + 1 }, (_, i) => ({
    hour: (startHour + first + i) % 24,
    orders: counts.get(first + i) ?? 0,
  }));
}

/**
 * Yatay eksenin yuvarlak işaretleri (1-2-5 adımları, en fazla ~5 işaret). Sipariş sayısı tam
 * sayıdır; adım 1'in altına inmez. Hiç veri yokken 0–1 döner ki çubuk genişliği sıfıra bölünmesin.
 */
export function hourAxis(maxValue: number): { max: number; ticks: number[] } {
  if (maxValue <= 0) return { max: 1, ticks: [0, 1] };
  const raw = maxValue / 4;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = Math.max(1, ([1, 2, 5, 10].find((m) => m * magnitude >= raw) ?? 10) * magnitude);
  const max = Math.ceil(maxValue / step) * step;
  return { max, ticks: Array.from({ length: max / step + 1 }, (_, i) => i * step) };
}

/**
 * `report_range` garsonları görünen adla gruplar; kullanıcı adı gelmez. Test/demo hesabı (M8'de
 * pasifleştirilecek) personel listesindeki kullanıcı adından tanınır ki gerçek ciroyla karışmasın.
 */
export function isTestWaiter(
  displayName: string,
  staff: readonly { username: string; display_name: string }[],
): boolean {
  return staff.some((p) => p.display_name === displayName && isTestAccount(p.username));
}

/** CSV dışa aktarmanın bir okuması: PostgREST'in varsayılan satır sınırıyla aynı. */
export const EXPORT_PAGE_SIZE = 1000;

/**
 * Sayfalı okumayı sonuna kadar yürütür: `fetchPage(from, to)` iki ucu dahil bir aralık okur
 * (`range`). Eksik (ya da boş) sayfa listenin sonudur. Bir sayfa hata verirse hata yayılır —
 * eksik bir dosyayı "tamam" diye indirmek, hiç indirmemekten kötüdür.
 */
export async function readAllPages<T>(
  fetchPage: (from: number, to: number) => Promise<T[]>,
  pageSize: number = EXPORT_PAGE_SIZE,
): Promise<T[]> {
  const all: T[] = [];
  for (let from = 0; ; from += pageSize) {
    const page = await fetchPage(from, from + pageSize - 1);
    all.push(...page);
    if (page.length < pageSize) return all;
  }
}
