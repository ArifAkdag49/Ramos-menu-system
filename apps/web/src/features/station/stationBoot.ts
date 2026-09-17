import { callRpc } from '../../lib/rpc';
import { supabase } from '../../lib/supabase';
import type { RamosPrinterPlugin } from '../../native/capacitor';
import { getStationId, stationPrinterConfig, type StationSettingsLike } from './stationLogic';
import { StationRunner } from './stationRunner';
import type { StationSnapshot } from './stationStore';

/**
 * İstasyon döngüsünün gerçek bağımlılıklarla kurulması. `useStation` bu dosyayı DİNAMİK içe aktarır:
 * fiş kodlayıcı ve döngü yalnız yerel uygulamada, istasyon açılınca indirilir.
 */

/** `station_heartbeat.p_version` — panoda hangi istemcinin bastığı görünsün. */
export const STATION_VERSION = 'ramos-station-web/2.0.0';

/**
 * Realtime `print-jobs` yayını (lib/realtime.ts kalıbı: private kanal, her olayda sinyal). Kanal
 * açılamazsa (ör. rolün bu konuya yetkisi yoksa) döngünün 5 sn'lik yoklaması işi yine alır.
 */
function subscribePrintJobs(onSignal: () => void): () => void {
  const channel = supabase
    .channel('print-jobs', { config: { private: true } })
    .on('broadcast', { event: '*' }, onSignal)
    .subscribe((status) => {
      if (status === 'SUBSCRIBED') onSignal();
    });
  void supabase.realtime.setAuth();
  return () => void supabase.removeChannel(channel);
}

export function startStation(args: {
  printer: RamosPrinterPlugin;
  getSettings: () => StationSettingsLike | null | undefined;
  onChange: (patch: Partial<StationSnapshot>) => void;
}): StationRunner {
  const runner = new StationRunner({
    stationId: getStationId(),
    version: STATION_VERSION,
    printer: args.printer,
    rpc: (fn, params) => callRpc(fn, params),
    getConfig: () => stationPrinterConfig(args.getSettings()),
    subscribeJobs: subscribePrintJobs,
    onChange: args.onChange,
    log: (message, detail) => console.warn('[station]', message, detail),
  });
  runner.start();
  return runner;
}
