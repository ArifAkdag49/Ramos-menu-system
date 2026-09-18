import { useEffect, useRef } from 'react';
import { useSettings } from '../../data/settings';
import { isNative, nativePlugin } from '../../native/capacitor';
import { useStationStore } from './stationStore';
import { useDocumentVisible, type StationMode } from './useBackgroundStation';

/**
 * Eski kip (arka plan hizmeti olmayan APK) — WebView'daki JS döngüsü. Döngü yalnız şunlar
 * birlikteyken çalışır: yerel uygulama, kip `legacy`, `print_route = 'station'`, kullanıcı anahtarı
 * açık (`ramos-station-on`) ve uygulama ön planda. Uygulama arka plana geçince duraklar (WebView
 * zamanlayıcıları zaten kısılır; yarım kalan iş sunucuda 60 sn sonra geri alınır), öne gelince hemen
 * yoklar. Rota başka yola çevrilirse (Realtime `settings`) kendiliğinden durur.
 *
 * Kip `background` (yerel hizmet basar) ya da henüz `unknown` iken döngü BAŞLAMAZ: aynı tablette iki
 * sahiplenici olmasın.
 *
 * Mutfak ekranında TEK yerde çağrılır (`StationStrip`).
 */
export function useStation(mode: StationMode): void {
  const row = useSettings();
  const on = useStationStore((s) => s.on);
  const visible = useDocumentVisible();
  const active = mode === 'legacy' && isNative() && row?.print_route === 'station' && on && visible;

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
