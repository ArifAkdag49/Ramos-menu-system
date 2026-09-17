import { create } from 'zustand';
import type { Tone } from '../../ui/tone';

/**
 * Tablet yazıcı istasyonunun ekran durumu. Ana pakette yalnız bu küçük dosya durur; fiş kodlayıcı
 * (`@point-of-sale/*`) ve iş döngüsü (`stationRunner`, `stationLogic`) istasyon ilk açıldığında
 * ayrı parça olarak yüklenir — garson ve admin paketleri büyümez.
 */

export const STATION_ON_KEY = 'ramos-station-on';

export interface StationSnapshot {
  /** Döngü şu an çalışıyor mu (anahtar açık + rota station + uygulama ön planda). */
  running: boolean;
  /** Son yoklamada yazıcıya ulaşıldı mı; `null` = henüz bilinmiyor. */
  reachable: boolean | null;
  /** Son başarılı baskının zamanı (ms). */
  lastPrintedAt: number | null;
  /** Art arda başarısız baskı / sahiplenme sayısı (başarılı baskıda sıfırlanır). */
  failures: number;
  lastError: string | null;
  /** Ayarlarda yazıcı adresi yok — iş sahiplenilmez. */
  missingPrinter: boolean;
}

export const INITIAL_SNAPSHOT: StationSnapshot = {
  running: false,
  reachable: null,
  lastPrintedAt: null,
  failures: 0,
  lastError: null,
  missingPrinter: false,
};

export function readStationOn(): boolean {
  try {
    return localStorage.getItem(STATION_ON_KEY) === '1';
  } catch {
    return false;
  }
}

function writeStationOn(on: boolean): void {
  try {
    if (on) localStorage.setItem(STATION_ON_KEY, '1');
    else localStorage.removeItem(STATION_ON_KEY);
  } catch {
    /* özel mod: anahtar bu oturumda açık kalır, uygulama yeniden açılınca kapalı başlar */
  }
}

interface StationStore {
  /** Kullanıcı anahtarı (cihazda kalıcı). */
  on: boolean;
  snapshot: StationSnapshot;
  setOn(on: boolean): void;
  patch(patch: Partial<StationSnapshot>): void;
}

export const useStationStore = create<StationStore>()((set) => ({
  on: readStationOn(),
  snapshot: INITIAL_SNAPSHOT,
  setOn(on) {
    writeStationOn(on);
    set({ on });
  },
  patch(patch) {
    set((s) => {
      // Döngü her turda aynı değerleri yazabilir: değişiklik yoksa yeniden çizim tetiklenmesin.
      const changed = (Object.keys(patch) as (keyof StationSnapshot)[]).some(
        (k) => s.snapshot[k] !== patch[k],
      );
      return changed ? { snapshot: { ...s.snapshot, ...patch } } : s;
    });
  },
}));

export type StationBadgeKey =
  | 'kitchen.station.off'
  | 'kitchen.station.on'
  | 'kitchen.station.onLastPrint'
  | 'kitchen.station.unreachable'
  | 'kitchen.station.noPrinter';

/** Başlıktaki durum rozeti: Kapalı / yazıcı adresi yok / ulaşılamıyor / Açık (· son baskı saati). */
export function stationBadge(
  on: boolean,
  s: StationSnapshot,
): { key: StationBadgeKey; tone: Tone; lastPrintedAt?: number } {
  if (!on) return { key: 'kitchen.station.off', tone: 'empty' };
  if (s.missingPrinter) return { key: 'kitchen.station.noPrinter', tone: 'warning' };
  if (s.reachable === false) return { key: 'kitchen.station.unreachable', tone: 'danger' };
  if (s.lastPrintedAt !== null)
    return { key: 'kitchen.station.onLastPrint', tone: 'open', lastPrintedAt: s.lastPrintedAt };
  return { key: 'kitchen.station.on', tone: 'open' };
}
