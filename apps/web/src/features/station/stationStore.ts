import { create } from 'zustand';
import type { BackgroundStationStatus } from '../../native/capacitor';
import type { Tone } from '../../ui/tone';
import type { BackgroundEnableResult } from './backgroundStation';

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

export type BackgroundEnableFailure = Exclude<BackgroundEnableResult, { ok: true }>;

interface StationStore {
  /** Eski (JS döngüsü) kipin kullanıcı anahtarı (cihazda kalıcı). Arka plan kipinde yalnız taşıma içindir. */
  on: boolean;
  snapshot: StationSnapshot;
  /** Arka plan kipi: yerel hizmetin son okunan durumu (`getBackgroundStation`). */
  bg: BackgroundStationStatus | null;
  /** Arka plan hizmeti açılıyor / kapanıyor. */
  bgBusy: boolean;
  /** Son açma denemesinin hatası (bir sonraki denemede temizlenir). */
  bgError: BackgroundEnableFailure | null;
  setOn(on: boolean): void;
  patch(patch: Partial<StationSnapshot>): void;
  setBg(bg: BackgroundStationStatus): void;
}

const sameStatus = (a: BackgroundStationStatus | null, b: BackgroundStationStatus) =>
  a !== null && (Object.keys(b) as (keyof BackgroundStationStatus)[]).every((k) => a[k] === b[k]);

export const useStationStore = create<StationStore>()((set) => ({
  on: readStationOn(),
  snapshot: INITIAL_SNAPSHOT,
  bg: null,
  bgBusy: false,
  bgError: null,
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
  setBg(bg) {
    // 2 sn'lik yoklama çoğunlukla aynı durumu okur: değişiklik yoksa yeniden çizim olmasın.
    set((s) => (sameStatus(s.bg, bg) ? s : { bg }));
  },
}));

/** Arka plan hizmetinin durumu → rozetin anladığı anlık görüntü (`stationBadge`). */
export function backgroundSnapshot(bg: BackgroundStationStatus): StationSnapshot {
  return {
    running: bg.running,
    reachable: bg.reachable,
    lastPrintedAt: bg.lastPrintedAt,
    failures: 0,
    lastError: bg.lastError,
    missingPrinter: bg.missingPrinter,
  };
}

export type StationBadgeKey =
  | 'kitchen.station.off'
  | 'kitchen.station.on'
  | 'kitchen.station.onLastPrint'
  | 'kitchen.station.unreachable'
  | 'kitchen.station.noPrinter'
  | 'kitchen.station.routeOffBadge';

/**
 * Başlıktaki durum rozeti: Kapalı / baskı yolu farklı / yazıcı adresi yok / ulaşılamıyor / Açık
 * (· son baskı saati). `routeOk = false` (Admin'deki baskı yolu "Tablet yazıcı istasyonu" değil):
 * anahtar açık olsa da bu tablet iş almaz — rozet "Açık" demesin.
 */
export function stationBadge(
  on: boolean,
  s: StationSnapshot,
  routeOk = true,
): { key: StationBadgeKey; tone: Tone; lastPrintedAt?: number } {
  if (!on) return { key: 'kitchen.station.off', tone: 'empty' };
  if (!routeOk) return { key: 'kitchen.station.routeOffBadge', tone: 'warning' };
  if (s.missingPrinter) return { key: 'kitchen.station.noPrinter', tone: 'warning' };
  if (s.reachable === false) return { key: 'kitchen.station.unreachable', tone: 'danger' };
  if (s.lastPrintedAt !== null)
    return { key: 'kitchen.station.onLastPrint', tone: 'open', lastPrintedAt: s.lastPrintedAt };
  return { key: 'kitchen.station.on', tone: 'open' };
}
