/**
 * Yerel Android uygulaması (Capacitor, `apps/mobile`) ile ince köprü.
 *
 * Uygulama canlı siteyi uzak URL olarak yükler; Capacitor köprüsü sayfaya `window.Capacitor`
 * olarak enjekte edilir ve her yerel eklenti `window.Capacitor.Plugins.<Ad>` altında hazır gelir
 * (Android `JSExport.getPluginJS`: yöntemler `nativePromise`, `addListener` → `{ remove }`).
 * Bu yüzden web paketi `@capacitor/*` İÇE AKTARMAZ: tarayıcı/PWA paketine tek bayt eklenmez,
 * garson ve admin ekranları etkilenmez. Tarayıcıda `window.Capacitor` yoktur → `isNative()` false.
 */

export interface PluginListenerHandle {
  remove(): Promise<void> | void;
}

/* ------------------------------ RamosPrinter (yerel eklenti) ------------------------------ */

export type RamosPrinterErrorCode = 'offline' | 'timeout' | 'io' | 'cover_open' | 'paper_end';

export interface RamosPrinterSendOptions {
  host: string;
  port: number;
  /** ESC/POS baytları, base64. */
  data: string;
  timeoutMs?: number;
  /** Göndermeden önce/sonra DLE EOT ile durum oku; engel varsa (kapak/kâğıt) gönderme. */
  checkStatus?: boolean;
}

export interface RamosPrinterSendResult {
  ok: boolean;
  /** Son okunan durum baytları (onaltılık). */
  status?: string;
  error?: RamosPrinterErrorCode;
  message?: string;
}

export interface RamosPrinterStatusResult {
  reachable: boolean;
  status?: string;
  message?: string;
}

/* ---- Ağda yazıcı arama (v2.3+ APK, `PrinterDiscovery`) ---- */

/**
 * `escpos`: 9100'de DLE EOT'ye ESC/POS cevabı (Xprinter vb.) · `epson_secure`: 9143'te TLS + ESC/POS
 * cevabı (Epson Secure Printing) · `epson_epos`: 443/80'de ePOS-Print yanıtı (TM-m30III) · `open`:
 * port açık ama cevap yok (aday; deneme fişiyle doğrulanır).
 */
export type FoundPrinterKind = 'escpos' | 'epson_secure' | 'epson_epos' | 'open';

export interface FoundPrinter {
  host: string;
  port: number;
  kind: FoundPrinterKind;
  /** Protokol cevabıyla doğrulandı (fiş yazıcısı olduğu kesin). */
  confirmed: boolean;
  /** Son okunan durum baytları (onaltılık). */
  status?: string;
  message?: string;
}

export interface DiscoveredNetwork {
  address: string;
  prefix: number;
  /** `wifi` | `ethernet` */
  transport: string;
}

export type PrinterDiscoveryError = 'no_network' | 'busy' | 'io';

export interface PrinterDiscoveryResult {
  ok: boolean;
  error?: PrinterDiscoveryError;
  message?: string;
  networks?: DiscoveredNetwork[];
  printers?: FoundPrinter[];
  /** Taranan adres sayısı. */
  scanned?: number;
  durationMs?: number;
}

/* ---- Arka plan istasyonu (yerel ön plan hizmeti + `station-feed` Edge Function) ---- */

export interface BackgroundStationStartOptions {
  /** `<SUPABASE_URL>/functions/v1/station-feed` */
  feedUrl: string;
  /** `register_station_device` düz anahtarı — yalnız yerel tarafa verilir, web'de saklanmaz. */
  token: string;
  /** `station_devices.id` */
  deviceId: string;
}

export type BackgroundStationStartError = 'notifications_denied' | 'invalid_args' | 'start_failed';

export interface BackgroundStationStartResult {
  ok: boolean;
  error?: BackgroundStationStartError;
  message?: string;
}

export interface BackgroundStationStatus {
  /** Kullanıcı arka plan istasyonunu açtı mı (yerelde kalıcı). */
  enabled: boolean;
  /** Hizmet şu an çalışıyor mu. */
  running: boolean;
  deviceId: string | null;
  /** Son başarılı baskı (epoch ms). */
  lastPrintedAt: number | null;
  printed: number;
  /** `<kod>: <mesaj>` — kod `RamosPrinterErrorCode` ya da hizmetin kendi kodu. */
  lastError: string | null;
  /** Yazıcıya ulaşıldı mı; `null` = henüz bilinmiyor. */
  reachable: boolean | null;
  /** Son `station-feed` yoklaması (epoch ms). */
  lastPollAt: number | null;
  /** Sunucudaki ayarda yazıcı adresi yok. */
  missingPrinter: boolean;
  /** Sunucunun bildirdiği `settings.print_route`; `null` = henüz bilinmiyor. */
  route: string | null;
  notificationsGranted: boolean;
  ignoringBatteryOptimizations: boolean;
}

/**
 * Sözleşme: `send` asla reddetmez — hata `{ ok: false, error }` olarak döner.
 *
 * Arka plan yöntemleri yalnız yeni APK'da vardır. Eski APK'da `JSExport` yalnız yerel yöntemleri
 * dışa aktardığı için yöntem hiç tanımlı olmaz (ya da bir vekil "not implemented" ile reddeder);
 * bu yüzden isteğe bağlıdır ve yalnız `features/station/backgroundStation` üzerinden çağrılır.
 * Yeni APK'da bu yöntemler de reddetmez.
 */
export interface RamosPrinterPlugin {
  send(options: RamosPrinterSendOptions): Promise<RamosPrinterSendResult>;
  status(options: {
    host: string;
    port: number;
    timeoutMs?: number;
  }): Promise<RamosPrinterStatusResult>;
  startBackgroundStation?(
    options: BackgroundStationStartOptions,
  ): Promise<BackgroundStationStartResult>;
  stopBackgroundStation?(): Promise<{ ok: true }>;
  getBackgroundStation?(): Promise<BackgroundStationStatus>;
  openBatteryOptimizationSettings?(): Promise<{ ok: true }>;
  /**
   * Yerel ağı (Wi-Fi / Ethernet) tarar, fiş yazıcılarını döndürür (v2.3+). `host`: kayıtlı adres — ağ
   * taramasından önce ilk o denenir. 10–20 sn sürebilir; sürerken istasyon baskısı bekler.
   */
  discover?(options?: { host?: string }): Promise<PrinterDiscoveryResult>;
}

/* -------------------------- PushNotifications (@capacitor/push-notifications) -------------------------- */

export type NativePermissionState = 'prompt' | 'prompt-with-rationale' | 'granted' | 'denied';

export interface NativePushPermission {
  receive: NativePermissionState;
}

export interface NativePushNotification {
  id?: string;
  title?: string;
  body?: string;
  /** FCM veri alanı: `{ url, tag, order_id }` (notify-ready). */
  data?: Record<string, unknown> | null;
}

export interface NativePushActionPerformed {
  actionId: string;
  notification: NativePushNotification;
}

export interface PushNotificationsPlugin {
  checkPermissions(): Promise<NativePushPermission>;
  requestPermissions(): Promise<NativePushPermission>;
  register(): Promise<void>;
  unregister(): Promise<void>;
  addListener(
    event: 'registration',
    cb: (token: { value: string }) => void,
  ): Promise<PluginListenerHandle> | PluginListenerHandle;
  addListener(
    event: 'registrationError',
    cb: (err: { error: string }) => void,
  ): Promise<PluginListenerHandle> | PluginListenerHandle;
  addListener(
    event: 'pushNotificationActionPerformed',
    cb: (action: NativePushActionPerformed) => void,
  ): Promise<PluginListenerHandle> | PluginListenerHandle;
}

export interface NativePlugins {
  RamosPrinter: RamosPrinterPlugin;
  PushNotifications: PushNotificationsPlugin;
}

interface CapacitorGlobal {
  isNativePlatform?: () => boolean;
  Plugins?: Partial<Record<string, unknown>>;
}

function capacitor(): CapacitorGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as Window & { Capacitor?: CapacitorGlobal }).Capacitor;
}

/** Yerel uygulamanın içinde mi (tarayıcı, PWA ve TWA'da false). Asla fırlatmaz. */
export function isNative(): boolean {
  try {
    return capacitor()?.isNativePlatform?.() === true;
  } catch {
    return false;
  }
}

/** Eklenti yoksa (eski APK, tarayıcı) `null`. */
export function nativePlugin<K extends keyof NativePlugins>(name: K): NativePlugins[K] | null {
  if (!isNative()) return null;
  const plugin = capacitor()?.Plugins?.[name];
  return plugin ? (plugin as NativePlugins[K]) : null;
}
