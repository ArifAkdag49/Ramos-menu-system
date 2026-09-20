import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { BackgroundStationStatus } from '../../native/capacitor';

// Sunucuya ASLA gidilmez: RPC'ler sahte. Test, hangi RPC'nin hangi sırayla çağrıldığını ve düz
// anahtarın yalnız yerel eklentiye verildiğini ölçer.
const h = vi.hoisted(() => ({ callRpc: vi.fn() }));
vi.mock('../../lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/rpc')>()),
  callRpc: h.callRpc,
}));

import { RpcError } from '../../lib/rpc';
import {
  __resetBackgroundStationForTests,
  detectBackgroundSupport,
  disableBackgroundStation,
  enableBackgroundStation,
  knownBackgroundSupport,
  readBackgroundStatus,
  STATION_BG_DEVICE_KEY,
  stationDeviceName,
  stationErrorKey,
  stationFeedUrl,
} from './backgroundStation';

type W = Window & { Capacitor?: unknown };

const TOKEN = 'f0'.repeat(32);

const bgStatus = (over: Partial<BackgroundStationStatus> = {}): BackgroundStationStatus => ({
  enabled: false,
  running: false,
  deviceId: null,
  lastPrintedAt: null,
  printed: 0,
  lastError: null,
  reachable: null,
  lastPollAt: null,
  missingPrinter: false,
  route: 'station',
  activeHost: null,
  activePort: null,
  autoSwitched: false,
  notificationsGranted: true,
  ignoringBatteryOptimizations: true,
  ...over,
});

function nativeWith(plugin: Record<string, unknown>) {
  (window as W).Capacitor = { isNativePlatform: () => true, Plugins: { RamosPrinter: plugin } };
  return plugin;
}

/** Yeni APK: dört arka plan yöntemi var ve hiçbiri reddetmez. */
function newApk(status: Partial<BackgroundStationStatus> = {}) {
  return nativeWith({
    send: vi.fn(),
    status: vi.fn(),
    getBackgroundStation: vi.fn(async () => bgStatus(status)),
    startBackgroundStation: vi.fn(async () => ({ ok: true })),
    stopBackgroundStation: vi.fn(async () => ({ ok: true })),
    openBatteryOptimizationSettings: vi.fn(async () => ({ ok: true })),
  }) as {
    getBackgroundStation: ReturnType<typeof vi.fn>;
    startBackgroundStation: ReturnType<typeof vi.fn>;
    stopBackgroundStation: ReturnType<typeof vi.fn>;
  };
}

const rpcCalls = () => h.callRpc.mock.calls.map(([fn, args]) => [fn, args] as const);

beforeEach(() => {
  __resetBackgroundStationForTests();
  h.callRpc.mockReset();
  localStorage.clear();
  vi.stubEnv('VITE_SUPABASE_URL', 'https://abc.supabase.co/');
});

afterEach(() => {
  delete (window as W).Capacitor;
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('detectBackgroundSupport', () => {
  it('tarayıcıda ve eklentisiz APK’da hemen false', async () => {
    expect(knownBackgroundSupport()).toBe(false);
    expect(await detectBackgroundSupport()).toBe(false);
    (window as W).Capacitor = { isNativePlatform: () => true, Plugins: {} };
    expect(knownBackgroundSupport()).toBe(false);
  });

  it('eski APK (yöntem hiç yok — JSExport yalnız yerel yöntemleri verir) → eski kip, sormadan', async () => {
    nativeWith({ send: vi.fn(), status: vi.fn() });
    expect(knownBackgroundSupport()).toBe(false);
    expect(await detectBackgroundSupport()).toBe(false);
  });

  it('eski APK (vekil "not implemented" ile reddeder) → eski kip; sonuç önbelleğe alınır', async () => {
    const getBackgroundStation = vi.fn(async () => {
      throw new Error('"RamosPrinter.getBackgroundStation()" is not implemented on android');
    });
    nativeWith({ send: vi.fn(), status: vi.fn(), getBackgroundStation });
    expect(knownBackgroundSupport()).toBeNull();
    expect(await detectBackgroundSupport()).toBe(false);
    expect(await detectBackgroundSupport()).toBe(false);
    expect(getBackgroundStation).toHaveBeenCalledOnce();
    expect(knownBackgroundSupport()).toBe(false);
  });

  it('yeni APK → arka plan kipi; eşzamanlı sorular tek yerel çağrı paylaşır', async () => {
    const p = newApk();
    const [a, b] = await Promise.all([detectBackgroundSupport(), detectBackgroundSupport()]);
    expect([a, b]).toEqual([true, true]);
    expect(p.getBackgroundStation).toHaveBeenCalledOnce();
    expect(knownBackgroundSupport()).toBe(true);
  });

  it('beklenmeyen yanıt biçimi desteklenmiyor sayılır', async () => {
    nativeWith({ getBackgroundStation: vi.fn(async () => ({})) });
    expect(await detectBackgroundSupport()).toBe(false);
  });
});

describe('readBackgroundStatus', () => {
  it('yerel durumu okur; eksik alanlar güvenli varsayılan alır', async () => {
    nativeWith({
      getBackgroundStation: vi.fn(async () => ({ enabled: true, running: true, printed: 3 })),
    });
    expect(await readBackgroundStatus()).toEqual(
      bgStatus({ enabled: true, running: true, printed: 3, route: null }),
    );
  });

  it('okunamazsa null (asla reddetmez)', async () => {
    nativeWith({ getBackgroundStation: vi.fn(async () => Promise.reject(new Error('x'))) });
    expect(await readBackgroundStatus()).toBeNull();
  });
});

describe('enableBackgroundStation', () => {
  it('kaydet → hizmeti anahtarla başlat → cihaz kimliğini sakla; anahtar hiçbir yerde saklanmaz', async () => {
    const p = newApk();
    h.callRpc.mockResolvedValueOnce({ id: 'dev-1', token: TOKEN });
    const log = vi.spyOn(console, 'log');
    const warn = vi.spyOn(console, 'warn');

    await expect(enableBackgroundStation({ name: 'Android · SM-X200' })).resolves.toEqual({
      ok: true,
    });
    expect(rpcCalls()).toEqual([['register_station_device', { p_name: 'Android · SM-X200' }]]);
    expect(p.startBackgroundStation).toHaveBeenCalledWith({
      feedUrl: 'https://abc.supabase.co/functions/v1/station-feed',
      token: TOKEN,
      deviceId: 'dev-1',
    });
    expect(localStorage.getItem(STATION_BG_DEVICE_KEY)).toBe('dev-1');
    const stored = Object.keys(localStorage).map((k) => localStorage.getItem(k) ?? '');
    expect(stored.some((v) => v.includes(TOKEN))).toBe(false);
    for (const spy of [log, warn]) expect(JSON.stringify(spy.mock.calls)).not.toContain(TOKEN);
  });

  it('ad verilmezse WebView kullanıcı ajanından üretilir', async () => {
    newApk();
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(
      'Mozilla/5.0 (Linux; Android 13; SM-X200 Build/TP1A.220624.014; wv) AppleWebKit/537.36',
    );
    h.callRpc.mockResolvedValueOnce({ id: 'dev-1', token: TOKEN });
    await enableBackgroundStation();
    expect(h.callRpc).toHaveBeenCalledWith('register_station_device', {
      p_name: 'Android · SM-X200',
    });
  });

  it('hizmet başlamazsa az önce oluşturulan kayıt silinir ve neden döner', async () => {
    const p = newApk();
    p.startBackgroundStation.mockResolvedValueOnce({
      ok: false,
      error: 'notifications_denied',
      message: 'POST_NOTIFICATIONS denied',
    });
    h.callRpc.mockResolvedValueOnce({ id: 'dev-1', token: TOKEN }).mockResolvedValueOnce(null);

    await expect(enableBackgroundStation({ name: 'Android' })).resolves.toEqual({
      ok: false,
      reason: 'notifications_denied',
      message: 'POST_NOTIFICATIONS denied',
    });
    expect(rpcCalls()).toEqual([
      ['register_station_device', { p_name: 'Android' }],
      ['revoke_station_device', { p_id: 'dev-1' }],
    ]);
    expect(localStorage.getItem(STATION_BG_DEVICE_KEY)).toBeNull();
  });

  it('eklenti reddederse start_failed sayılır, kayıt yine silinir', async () => {
    const p = newApk();
    p.startBackgroundStation.mockRejectedValueOnce(new Error('boom'));
    h.callRpc.mockResolvedValueOnce({ id: 'dev-1', token: TOKEN }).mockResolvedValueOnce(null);
    await expect(enableBackgroundStation({ name: 'Android' })).resolves.toEqual({
      ok: false,
      reason: 'start_failed',
      message: 'boom',
    });
    expect(h.callRpc).toHaveBeenLastCalledWith('revoke_station_device', { p_id: 'dev-1' });
  });

  it('kayıt reddedilirse hizmet başlatılmaz; RPC anahtarı döner', async () => {
    const p = newApk();
    h.callRpc.mockRejectedValueOnce(new RpcError('station_device_name_invalid'));
    await expect(enableBackgroundStation({ name: 'x' })).resolves.toEqual({
      ok: false,
      reason: 'rpc',
      key: 'station_device_name_invalid',
    });
    expect(p.startBackgroundStation).not.toHaveBeenCalled();
  });

  it('önceki kaydın kalıntısı yeni kayıttan önce silinir', async () => {
    newApk();
    localStorage.setItem(STATION_BG_DEVICE_KEY, 'old-dev');
    h.callRpc.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'dev-2', token: TOKEN });
    await expect(enableBackgroundStation({ name: 'Android' })).resolves.toEqual({ ok: true });
    expect(rpcCalls()).toEqual([
      ['revoke_station_device', { p_id: 'old-dev' }],
      ['register_station_device', { p_name: 'Android' }],
    ]);
    expect(localStorage.getItem(STATION_BG_DEVICE_KEY)).toBe('dev-2');
  });

  it('eski APK’da hiçbir RPC çağrılmaz', async () => {
    nativeWith({ send: vi.fn(), status: vi.fn() });
    await expect(enableBackgroundStation()).resolves.toEqual({ ok: false, reason: 'unsupported' });
    expect(h.callRpc).not.toHaveBeenCalled();
  });
});

describe('disableBackgroundStation', () => {
  it('hizmeti durdurur, yereldeki cihaz kaydını siler, saklanan kimliği temizler', async () => {
    const p = newApk({ enabled: true, running: true, deviceId: 'dev-1' });
    localStorage.setItem(STATION_BG_DEVICE_KEY, 'dev-1');
    h.callRpc.mockResolvedValueOnce(null);
    await expect(disableBackgroundStation()).resolves.toEqual({ revoked: true });
    expect(p.stopBackgroundStation).toHaveBeenCalledOnce();
    expect(rpcCalls()).toEqual([['revoke_station_device', { p_id: 'dev-1' }]]);
    expect(localStorage.getItem(STATION_BG_DEVICE_KEY)).toBeNull();
  });

  it('kayıt zaten silinmişse (Admin’den kaldırıldı) başarı sayılır — paylaşılan anahtar listesi eski olsa da', async () => {
    newApk({ enabled: true, deviceId: 'dev-1' });
    h.callRpc.mockRejectedValueOnce(new RpcError('unknown', 'P0001: station_device_not_found'));
    await expect(disableBackgroundStation()).resolves.toEqual({ revoked: true });

    localStorage.setItem(STATION_BG_DEVICE_KEY, 'dev-9');
    newApk({ enabled: true, deviceId: null });
    h.callRpc.mockRejectedValueOnce(new RpcError('station_device_not_found'));
    await expect(disableBackgroundStation()).resolves.toEqual({ revoked: true });
    expect(localStorage.getItem(STATION_BG_DEVICE_KEY)).toBeNull();
  });

  it('ağ yoksa hizmet yine durur; kimlik sonraki açılışta silinmek üzere saklanır', async () => {
    const p = newApk({ enabled: true, deviceId: 'dev-1' });
    h.callRpc.mockRejectedValueOnce(new RpcError('network'));
    await expect(disableBackgroundStation()).resolves.toEqual({ revoked: false });
    expect(p.stopBackgroundStation).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STATION_BG_DEVICE_KEY)).toBe('dev-1');
  });
});

describe('saf yardımcılar', () => {
  it('stationDeviceName: model okunur, 60 karakterle sınırlanır', () => {
    expect(
      stationDeviceName('Mozilla/5.0 (Linux; Android 14; Pixel Tablet Build/UQ1A; wv) Chrome/120'),
    ).toBe('Android · Pixel Tablet');
    expect(stationDeviceName('Mozilla/5.0 (Linux; Android 13; SM-T220) Chrome/120')).toBe(
      'Android · SM-T220',
    );
    expect(stationDeviceName('Mozilla/5.0 (Linux; Android 10; K) Chrome/120')).toBe('Android');
    expect(stationDeviceName('Mozilla/5.0 (X11; Linux x86_64)')).toBe('Android');
    const long = stationDeviceName(`Mozilla/5.0 (Linux; Android 13; ${'X'.repeat(80)})`);
    expect(long).toHaveLength(60);
  });

  it('stationFeedUrl: sondaki eğik çizgi tekrarlanmaz', () => {
    expect(stationFeedUrl('https://abc.supabase.co//')).toBe(
      'https://abc.supabase.co/functions/v1/station-feed',
    );
  });

  it('stationErrorKey: eklenti kodları mevcut yazıcı çevirilerine eşlenir', () => {
    expect(stationErrorKey('offline: connect timed out')).toBe('printer.printer_unreachable');
    expect(stationErrorKey('timeout')).toBe('printer.printer_unreachable');
    expect(stationErrorKey('io: broken pipe')).toBe('printer.printer_unreachable');
    expect(stationErrorKey('cover_open: kapak')).toBe('printer.cover_open');
    expect(stationErrorKey('paper_end: kağıt')).toBe('printer.paper_end');
    expect(stationErrorKey('feed_error: 500')).toBeNull();
    expect(stationErrorKey(null)).toBeNull();
  });
});
