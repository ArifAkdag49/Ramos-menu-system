import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useSettings } from '../../data/settings';
import { isNative, nativePlugin } from '../../native/capacitor';
import { useStationStore } from './stationStore';

function subscribeVisibility(cb: () => void): () => void {
  document.addEventListener('visibilitychange', cb);
  return () => document.removeEventListener('visibilitychange', cb);
}

const isVisible = () => document.visibilityState !== 'hidden';

/**
 * Döngü yalnız şu dördü birlikteyken çalışır: yerel uygulama, `print_route = 'station'`, kullanıcı
 * anahtarı açık (`ramos-station-on`) ve uygulama ön planda. Uygulama arka plana geçince duraklar
 * (WebView zamanlayıcıları zaten kısılır; yarım kalan iş sunucuda 60 sn sonra geri alınır), öne
 * gelince hemen yoklar. Rota başka yola çevrilirse (Realtime `settings`) kendiliğinden durur.
 *
 * Mutfak ekranında TEK yerde çağrılır (`StationStrip`).
 */
export function useStation(): void {
  const row = useSettings();
  const on = useStationStore((s) => s.on);
  const visible = useSyncExternalStore(subscribeVisibility, isVisible, () => true);
  const active = isNative() && row?.print_route === 'station' && on && visible;

  const rowRef = useRef(row);
  useEffect(() => {
    rowRef.current = row;
  }, [row]);

  useEffect(() => {
    if (!active) return;
    const { patch } = useStationStore.getState();
    const printer = nativePlugin('RamosPrinter');
    if (!printer) {
      // Eski APK (eklentisiz): anahtar açık ama basılamaz — nedeni görünsün.
      patch({ running: false, reachable: false, lastError: 'plugin_missing: RamosPrinter' });
      return;
    }
    let cancelled = false;
    let runner: { stop(): void } | null = null;
    import('./stationBoot')
      .then(({ startStation }) => {
        if (cancelled) return;
        runner = startStation({ printer, getSettings: () => rowRef.current, onChange: patch });
      })
      .catch((e: unknown) =>
        patch({ lastError: `load_error: ${e instanceof Error ? e.message : String(e)}` }),
      );
    return () => {
      cancelled = true;
      runner?.stop();
    };
  }, [active]);
}
