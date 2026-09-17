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

/** Sözleşme: `send` asla reddetmez — hata `{ ok: false, error }` olarak döner. */
export interface RamosPrinterPlugin {
  send(options: RamosPrinterSendOptions): Promise<RamosPrinterSendResult>;
  status(options: {
    host: string;
    port: number;
    timeoutMs?: number;
  }): Promise<RamosPrinterStatusResult>;
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
