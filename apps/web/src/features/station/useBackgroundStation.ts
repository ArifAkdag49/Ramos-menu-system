import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  detectBackgroundSupport,
  disableBackgroundStation,
  enableBackgroundStation,
  knownBackgroundSupport,
  readBackgroundStatus,
} from './backgroundStation';
import { useStationStore } from './stationStore';

/**
 * İstasyon kipi: `legacy` = eski APK, fişleri WebView'daki JS döngüsü basar (yalnız ön planda);
 * `background` = yeni APK, yerel ön plan hizmeti basar (uygulama kapalıyken de); `unknown` = henüz
 * sorulmadı (birkaç ms) — bu arada hiçbir döngü başlamaz, çift sahiplenme olmasın.
 */
export type StationMode = 'unknown' | 'legacy' | 'background';

/** Arka plan kipinde şerit görünürken yerel durum bu aralıkla okunur. */
export const BG_POLL_MS = 2_000;

function subscribeVisibility(cb: () => void): () => void {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
}

const isVisible = () => document.visibilityState !== 'hidden';

export function useDocumentVisible(): boolean {
  return useSyncExternalStore(subscribeVisibility, isVisible, () => true);
}

export function useStationMode(): StationMode {
  const [supported, setSupported] = useState<boolean | null>(() => knownBackgroundSupport());
  useEffect(() => {
    if (supported !== null) return;
    let alive = true;
    void detectBackgroundSupport().then((ok) => {
      if (alive) setSupported(ok);
    });
    return () => {
      alive = false;
    };
  }, [supported]);
  if (supported === null) return 'unknown';
  return supported ? 'background' : 'legacy';
}

export async function refreshBackgroundStatus(): Promise<void> {
  const status = await readBackgroundStatus();
  if (status) useStationStore.getState().setBg(status);
}

/**
 * Anahtar (arka plan kipi): hizmeti açar ya da kapatır, bitince durumu hemen tazeler. Aynı anda tek
 * işlem. Başarılı her kullanıcı kararı eski kipin anahtarını (`ramos-station-on`) da kapatır: artık
 * yalnız yerel durum (`enabled`) geçerlidir ve tek seferlik taşıma yeniden tetiklenmez.
 */
export async function setBackgroundStation(on: boolean): Promise<void> {
  const store = useStationStore.getState();
  if (store.bgBusy) return;
  useStationStore.setState({ bgBusy: true, bgError: null });
  try {
    if (on) {
      const res = await enableBackgroundStation();
      if (res.ok) store.setOn(false);
      else useStationStore.setState({ bgError: res });
    } else {
      await disableBackgroundStation();
      store.setOn(false);
    }
  } finally {
    await refreshBackgroundStatus();
    useStationStore.setState({ bgBusy: false });
  }
}

let migrationTried = false;

/**
 * Arka plan kipinin yaşam döngüsü (şeritte TEK yerde çağrılır):
 *
 * - Şerit görünürken yerel durum 2 sn'de bir okunur (uygulama arka plandayken okunmaz).
 * - **Tek seferlik taşıma:** eski APK'da anahtar açıktı (`ramos-station-on`), yeni APK geldi ve hizmet
 *   henüz kapalı → istasyon sessizce susmasın diye hizmet bir kez kendiliğinden açılır. Başarılıysa eski
 *   anahtar silinir (Admin'den "Kaldır" sonrası tablet kendini yeniden kaydetmez); başarısızsa hata
 *   şeritte görünür, anahtara dokunarak yeniden denenir.
 */
export function useBackgroundStation(
  active: boolean,
  visible: boolean,
  route: string | null | undefined,
): void {
  useEffect(() => {
    if (!active || !visible) return;
    let alive = true;
    const tick = () =>
      void readBackgroundStatus().then((s) => {
        if (alive && s) useStationStore.getState().setBg(s);
      });
    tick();
    const id = setInterval(tick, BG_POLL_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [active, visible]);

  const enabled = useStationStore((s) => s.bg?.enabled ?? null);
  const legacyOn = useStationStore((s) => s.on);
  useEffect(() => {
    if (!active || enabled !== false || !legacyOn || route !== 'station' || migrationTried) return;
    migrationTried = true;
    void setBackgroundStation(true);
  }, [active, enabled, legacyOn, route]);
}

/** Yalnız testler. */
export function __resetBackgroundMigrationForTests(): void {
  migrationTried = false;
}
