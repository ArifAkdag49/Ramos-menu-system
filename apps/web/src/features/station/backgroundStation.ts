import { callRpc, hasRpcErrorKey, RpcError, type ErrorKey } from '../../lib/rpc';
import {
  nativePlugin,
  type BackgroundStationStartError,
  type BackgroundStationStartResult,
  type BackgroundStationStatus,
  type RamosPrinterPlugin,
} from '../../native/capacitor';

/**
 * Arka plan yazıcı istasyonu — yeni APK'daki yerel ön plan hizmetiyle köprü.
 *
 * Yeni APK'da fişleri WebView'daki JS döngüsü (`stationBoot`) değil, yerel hizmet basar: hizmet
 * `station-feed` Edge Function'ından işi kendi cihaz anahtarıyla alır, uygulama kapalıyken de çalışır.
 * Web tarafı yalnız cihazı kaydeder (`register_station_device`), anahtarı DOĞRUDAN yerel tarafa
 * verir ve durumu okur. Düz anahtar hiçbir yerde saklanmaz ve günlüğe yazılmaz.
 *
 * Eski APK'da arka plan yöntemleri yoktur → "eski" kip: JS döngüsü eskisi gibi çalışır.
 * Bu dosya ana pakettedir; fiş kodlayıcıyı (`stationLogic`) İÇE AKTARMAZ.
 */

/** Hizmeti başlatılmış cihazın `station_devices.id`'si (anahtar değil). */
export const STATION_BG_DEVICE_KEY = 'ramos-station-bg-device';
/** `register_station_device.p_name` üst sınırı (`station_device_name_invalid`). */
export const DEVICE_NAME_MAX = 60;

/** Önbellek: APK sayfa ömrü boyunca değişmez; eşzamansız sonuç bir kez sorulur. */
let support: boolean | null = null;
let detecting: Promise<boolean> | null = null;

function printer(): RamosPrinterPlugin | null {
  return nativePlugin('RamosPrinter');
}

/**
 * Hemen bilinebilen yanıt: tarayıcı / eklentisiz ya da yöntemsiz eski APK → `false`, daha önce
 * sorulduysa önbellekteki sonuç; aksi hâlde `null` (`detectBackgroundSupport` sorulmalı).
 */
export function knownBackgroundSupport(): boolean | null {
  if (support !== null) return support;
  const p = printer();
  if (!p || typeof p.getBackgroundStation !== 'function') return false;
  return null;
}

/** Yerel yanıtın beklenen biçimde olduğunu doğrular; eksik alanlar güvenli varsayılan alır. */
function normalizeStatus(raw: unknown): BackgroundStationStatus | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.enabled !== 'boolean') return null;
  const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const str = (v: unknown) => (typeof v === 'string' && v !== '' ? v : null);
  return {
    enabled: r.enabled,
    running: r.running === true,
    deviceId: str(r.deviceId),
    lastPrintedAt: num(r.lastPrintedAt),
    printed: num(r.printed) ?? 0,
    lastError: str(r.lastError),
    reachable: typeof r.reachable === 'boolean' ? r.reachable : null,
    lastPollAt: num(r.lastPollAt),
    missingPrinter: r.missingPrinter === true,
    route: str(r.route),
    // Bilinmiyorsa uyarı gösterilmesin.
    notificationsGranted: r.notificationsGranted !== false,
    ignoringBatteryOptimizations: r.ignoringBatteryOptimizations !== false,
  };
}

/**
 * Bu APK arka plan istasyonunu destekliyor mu. `getBackgroundStation` yoksa ya da reddederse
 * (eski APK: "not implemented") → `false`. Sonuç önbelleğe alınır; asla reddetmez.
 */
export function detectBackgroundSupport(): Promise<boolean> {
  const known = knownBackgroundSupport();
  if (known !== null) return Promise.resolve(known);
  detecting ??= (async () => {
    try {
      support = normalizeStatus(await printer()?.getBackgroundStation?.()) !== null;
    } catch {
      support = false;
    }
    return support;
  })().finally(() => {
    detecting = null;
  });
  return detecting;
}

/** Hizmetin güncel durumu; desteklenmiyorsa ya da okunamazsa `null`. Asla reddetmez. */
export async function readBackgroundStatus(): Promise<BackgroundStationStatus | null> {
  const p = printer();
  if (typeof p?.getBackgroundStation !== 'function') return null;
  try {
    return normalizeStatus(await p.getBackgroundStation());
  } catch {
    return null;
  }
}

/** Android pil optimizasyonu ekranı (arka planda hizmet kısılmasın). Asla reddetmez. */
export async function openBatteryOptimizationSettings(): Promise<void> {
  try {
    await printer()?.openBatteryOptimizationSettings?.();
  } catch {
    /* ayar ekranı açılamadı — kullanıcı elle açabilir */
  }
}

/** `<SUPABASE_URL>/functions/v1/station-feed` */
export function stationFeedUrl(
  supabaseUrl: string = import.meta.env.VITE_SUPABASE_URL as string,
): string {
  return `${supabaseUrl.replace(/\/+$/, '')}/functions/v1/station-feed`;
}

/**
 * Admin listesinde görünen cihaz adı: `Android · <model>` (WebView kullanıcı ajanından), en çok
 * 60 karakter. Model okunamazsa (ör. kısaltılmış UA'daki "K") yalnız `Android`.
 */
export function stationDeviceName(ua: string = navigator.userAgent): string {
  const m = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build\/[^;)]*)?\s*[;)]/.exec(ua);
  const model = m?.[1]?.trim() ?? '';
  const name =
    model && model !== 'K' && model.toLowerCase() !== 'wv' ? `Android · ${model}` : 'Android';
  return name.slice(0, DEVICE_NAME_MAX);
}

function readDeviceId(): string | null {
  try {
    return localStorage.getItem(STATION_BG_DEVICE_KEY);
  } catch {
    return null;
  }
}

function writeDeviceId(id: string | null): void {
  try {
    if (id) localStorage.setItem(STATION_BG_DEVICE_KEY, id);
    else localStorage.removeItem(STATION_BG_DEVICE_KEY);
  } catch {
    /* özel mod: kimlik yerel durumdan (`getBackgroundStation().deviceId`) yine okunur */
  }
}

/** Cihaz kaydını siler. Kayıt zaten yoksa (`station_device_not_found`) başarı sayılır. */
async function revokeDevice(id: string): Promise<boolean> {
  try {
    await callRpc<void>('revoke_station_device', { p_id: id });
    return true;
  } catch (e) {
    return hasRpcErrorKey(e, 'station_device_not_found');
  }
}

export type BackgroundEnableResult =
  | { ok: true }
  | { ok: false; reason: 'unsupported' }
  | { ok: false; reason: 'rpc'; key: ErrorKey }
  | { ok: false; reason: BackgroundStationStartError; message?: string };

/**
 * Arka plan istasyonunu açar: cihazı kaydeder → hizmeti anahtarla başlatır → cihaz kimliğini saklar.
 * Hizmet başlamazsa az önce oluşturulan kayıt geri silinir (sunucuda geçerli, sahipsiz anahtar kalmaz).
 */
export async function enableBackgroundStation(
  opts: { feedUrl?: string; name?: string } = {},
): Promise<BackgroundEnableResult> {
  const p = printer();
  if (!(await detectBackgroundSupport()) || typeof p?.startBackgroundStation !== 'function')
    return { ok: false, reason: 'unsupported' };

  // Önceki kaydın kalıntısı (hizmet durdu ama kayıt silinemedi): yenisinden önce temizle.
  const status = await readBackgroundStatus();
  const stale = new Set([status?.deviceId, readDeviceId()].filter((id): id is string => !!id));
  for (const id of stale) await revokeDevice(id);
  writeDeviceId(null);

  let reg: { id: string; token: string };
  try {
    const raw = await callRpc<{ id?: unknown; token?: unknown } | null>('register_station_device', {
      p_name: opts.name ?? stationDeviceName(),
    });
    if (typeof raw?.id !== 'string' || typeof raw.token !== 'string' || !raw.token) {
      if (typeof raw?.id === 'string') await revokeDevice(raw.id);
      throw new RpcError('unknown', 'register_station_device: beklenmeyen yanıt');
    }
    reg = { id: raw.id, token: raw.token };
  } catch (e) {
    return { ok: false, reason: 'rpc', key: e instanceof RpcError ? e.key : 'unknown' };
  }

  // Kimlik hizmet başlamadan yazılır: sayfa tam bu arada kapanırsa bir sonraki açılış kaydı temizler.
  writeDeviceId(reg.id);
  let started: BackgroundStationStartResult;
  try {
    started = (await p.startBackgroundStation({
      feedUrl: opts.feedUrl ?? stationFeedUrl(),
      token: reg.token,
      deviceId: reg.id,
    })) ?? { ok: false, error: 'start_failed' };
  } catch (e) {
    started = {
      ok: false,
      error: 'start_failed',
      message: e instanceof Error ? e.message : String(e),
    };
  }
  if (started.ok) return { ok: true };

  if (await revokeDevice(reg.id)) writeDeviceId(null);
  return { ok: false, reason: started.error ?? 'start_failed', message: started.message };
}

/**
 * Arka plan istasyonunu kapatır: hizmeti durdurur → cihaz kaydını siler (yoksa sorun değil).
 * Kayıt silinemezse (ağ yok) kimlik saklanır; bir sonraki açılışta ya da Admin'den silinir.
 */
export async function disableBackgroundStation(): Promise<{ revoked: boolean }> {
  const p = printer();
  const status = await readBackgroundStatus();
  try {
    await p?.stopBackgroundStation?.();
  } catch {
    /* yeni APK'da reddetmez; eski APK'da zaten hizmet yok */
  }
  const ids = new Set([status?.deviceId, readDeviceId()].filter((id): id is string => !!id));
  let leftover: string | null = null;
  for (const id of ids) if (!(await revokeDevice(id))) leftover ??= id;
  writeDeviceId(leftover);
  return { revoked: leftover === null };
}

/** Hizmetin `lastError` kodu → mevcut yazıcı sorunu çevirisi; bilinmeyen kodda `null` (ham gösterilir). */
export function stationErrorKey(
  error: string | null,
): 'printer.printer_unreachable' | 'printer.cover_open' | 'printer.paper_end' | null {
  const code = error?.split(':')[0]?.trim();
  if (code === 'offline' || code === 'timeout' || code === 'io')
    return 'printer.printer_unreachable';
  if (code === 'cover_open') return 'printer.cover_open';
  if (code === 'paper_end') return 'printer.paper_end';
  return null;
}

/** Yalnız testler. */
export function __resetBackgroundStationForTests(): void {
  support = null;
  detecting = null;
}
