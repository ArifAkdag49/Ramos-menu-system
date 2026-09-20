import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import type { SettingsRow } from '../../data/settings';
import type { BackgroundStationStatus } from '../../native/capacitor';

// Arka plan kipi (yeni APK): yerel eklenti ve RPC'ler sahte, canlı sunucuya ASLA gidilmez. JS döngüsü
// (stationBoot) sahte — burada yalnız başlatılmadığı ölçülür.
const h = vi.hoisted(() => ({
  row: undefined as SettingsRow | undefined,
  startStation: vi.fn(),
  callRpc: vi.fn(),
}));
vi.mock('../../data/settings', () => ({ useSettings: () => h.row }));
vi.mock('./stationBoot', () => ({ startStation: h.startStation }));
vi.mock('../../lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../lib/rpc')>()),
  callRpc: h.callRpc,
}));

import { __resetBackgroundStationForTests, STATION_BG_DEVICE_KEY } from './backgroundStation';
import { StationStrip } from './StationStrip';
import { INITIAL_SNAPSHOT, STATION_ON_KEY, useStationStore } from './stationStore';
import { __resetBackgroundMigrationForTests, BG_POLL_MS } from './useBackgroundStation';

type W = Window & { Capacitor?: unknown };
const TOKEN = 'ab'.repeat(32);

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

/** Yeni APK: yerel durum `state`'te tutulur; başlat/durdur onu değiştirir (gerçek hizmet gibi). */
function newApk(initial: Partial<BackgroundStationStatus> = {}) {
  const state = { current: bgStatus(initial) };
  const plugin = {
    send: vi.fn(),
    status: vi.fn(),
    getBackgroundStation: vi.fn(async () => ({ ...state.current })),
    startBackgroundStation: vi.fn(async ({ deviceId }: { deviceId: string }) => {
      state.current = { ...state.current, enabled: true, running: true, deviceId };
      return { ok: true } as { ok: boolean; error?: string; message?: string };
    }),
    stopBackgroundStation: vi.fn(async () => {
      state.current = { ...state.current, enabled: false, running: false, deviceId: null };
      return { ok: true };
    }),
    openBatteryOptimizationSettings: vi.fn(async () => ({ ok: true })),
  };
  (window as W).Capacitor = { isNativePlatform: () => true, Plugins: { RamosPrinter: plugin } };
  return { plugin, state };
}

const settings = (route: string) =>
  ({ print_route: route, printer_host: '192.168.1.50', printer_port: 9100 }) as SettingsRow;

const setVisibility = (v: 'hidden' | 'visible') => {
  Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
  act(() => void document.dispatchEvent(new Event('visibilitychange')));
};

/** Kip belirlenip ilk yerel durum okunana kadar bekle. */
const switchReady = async () => {
  const toggle = await screen.findByRole('switch', { name: /Yazıcı istasyonu/ });
  await waitFor(() => expect(toggle).toBeEnabled());
  return toggle;
};

beforeEach(() => {
  h.row = settings('station');
  h.startStation.mockReset().mockImplementation(() => ({ stop: vi.fn() }));
  h.callRpc.mockReset();
  localStorage.clear();
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  __resetBackgroundStationForTests();
  __resetBackgroundMigrationForTests();
  useStationStore.setState({
    on: false,
    snapshot: INITIAL_SNAPSHOT,
    bg: null,
    bgBusy: false,
    bgError: null,
  });
});

afterEach(() => {
  delete (window as W).Capacitor;
  vi.useRealTimers();
});

describe('<StationStrip /> — arka plan kipi (yeni APK)', () => {
  it('JS döngüsü başlamaz; anahtar yerel hizmetin durumunu yansıtır', async () => {
    newApk({ enabled: true, running: true, printed: 5, deviceId: 'dev-1' });
    // Eski anahtar da açık olsa bile döngü başlamamalı (çift sahiplenme olmasın).
    useStationStore.setState({ on: true });
    render(<StationStrip />);
    const toggle = await switchReady();
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(screen.getByText('Arka planda çalışıyor — uygulama kapalıyken de basar')).toBeVisible();
    expect(screen.getByText('Basılan fiş: 5')).toBeInTheDocument();
    expect(screen.getByText('Açık')).toBeInTheDocument();
    expect(screen.queryByText(/Ekranı açık tutun/)).toBeNull();
    expect(h.startStation).not.toHaveBeenCalled();
  });

  it('hizmet yazıcıyı kendisi bulduysa (kayıtlı adres cevapsız) not gösterir', async () => {
    newApk({
      enabled: true,
      running: true,
      deviceId: 'dev-1',
      activeHost: '192.168.2.199',
      activePort: 443,
      autoSwitched: true,
    });
    render(<StationStrip />);
    await switchReady();
    const note = await screen.findByRole('note');
    expect(note).toHaveTextContent('192.168.2.199:443');
    expect(note).toHaveTextContent(/Ağdaki yazıcıyı bul/);
  });

  it('açınca: cihaz kaydı → hizmet anahtarla başlar → kimlik saklanır; anahtar saklanmaz', async () => {
    const { plugin } = newApk();
    h.callRpc.mockResolvedValueOnce({ id: 'dev-1', token: TOKEN });
    const user = userEvent.setup();
    render(<StationStrip />);
    const toggle = await switchReady();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Kapalı')).toBeInTheDocument();

    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(h.callRpc).toHaveBeenCalledWith('register_station_device', {
      p_name: expect.stringMatching(/^Android/),
    });
    expect(plugin.startBackgroundStation).toHaveBeenCalledWith(
      expect.objectContaining({ token: TOKEN, deviceId: 'dev-1' }),
    );
    expect(localStorage.getItem(STATION_BG_DEVICE_KEY)).toBe('dev-1');
    expect(JSON.stringify({ ...localStorage })).not.toContain(TOKEN);
    expect(h.startStation).not.toHaveBeenCalled();
  });

  it('hizmet açıkken kapatınca: hizmet durur, cihaz kaydı silinir', async () => {
    const { plugin } = newApk({ enabled: true, running: true, deviceId: 'dev-1' });
    localStorage.setItem(STATION_BG_DEVICE_KEY, 'dev-1');
    h.callRpc.mockResolvedValue(null);
    const user = userEvent.setup();
    render(<StationStrip />);
    const toggle = await switchReady();
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));

    await user.click(toggle);
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'false'));
    expect(plugin.stopBackgroundStation).toHaveBeenCalledOnce();
    expect(h.callRpc).toHaveBeenCalledWith('revoke_station_device', { p_id: 'dev-1' });
    expect(localStorage.getItem(STATION_BG_DEVICE_KEY)).toBeNull();
  });

  it('başlatma hatası şeritte görünür ve kayıt geri silinir', async () => {
    const { plugin } = newApk();
    plugin.startBackgroundStation.mockResolvedValueOnce({
      ok: false,
      error: 'notifications_denied',
    });
    h.callRpc.mockResolvedValueOnce({ id: 'dev-1', token: TOKEN }).mockResolvedValueOnce(null);
    const user = userEvent.setup();
    render(<StationStrip />);
    await user.click(await switchReady());
    expect(await screen.findByRole('alert')).toHaveTextContent(/Bildirim izni gerekli/);
    expect(h.callRpc).toHaveBeenLastCalledWith('revoke_station_device', { p_id: 'dev-1' });
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'false');
  });

  it('pil kısıtlaması varsa açıklama ve ayar düğmesi; yoksa gizli', async () => {
    const { plugin, state } = newApk({
      enabled: true,
      running: true,
      ignoringBatteryOptimizations: false,
    });
    const user = userEvent.setup();
    render(<StationStrip />);
    const button = await screen.findByRole('button', { name: 'Pil kısıtlamasını kaldır' });
    expect(screen.getByText(/pil tasarrufu arka planda baskıyı durdurabilir/)).toBeInTheDocument();
    // Kullanıcı ayar ekranında kısıtlamayı kaldırır; dönünce durum hemen yeniden okunur.
    plugin.openBatteryOptimizationSettings.mockImplementationOnce(async () => {
      state.current = { ...state.current, ignoringBatteryOptimizations: true };
      return { ok: true };
    });
    await user.click(button);
    expect(plugin.openBatteryOptimizationSettings).toHaveBeenCalledOnce();
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Pil kısıtlamasını kaldır' })).toBeNull(),
    );
  });

  it('yazıcı adresi yok, yazıcı hatası ve kapalı bildirim izni gösterilir', async () => {
    newApk({
      enabled: true,
      running: true,
      missingPrinter: true,
      lastError: 'paper_end: DLE EOT 4',
      notificationsGranted: false,
    });
    render(<StationStrip />);
    expect(await screen.findByText(/Yazıcı adresi yok/)).toBeInTheDocument();
    expect(screen.getByText('Yazıcıda kağıt bitti — kağıt tak')).toBeInTheDocument();
    expect(
      screen.getByText(/durum bildirimi görünmez ama fişler basılmaya devam eder/),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Pil kısıtlamasını kaldır' })).toBeNull();
  });

  it('bilinmeyen hata kodu ham gösterilir; ulaşılamıyorsa rozet uyarır', async () => {
    newApk({ enabled: true, running: true, reachable: false, lastError: 'feed_error: 503' });
    render(<StationStrip />);
    expect(await screen.findByText('Son hata: feed_error: 503')).toBeInTheDocument();
    expect(screen.getByText('Yazıcıya ulaşılamıyor')).toBeInTheDocument();
  });

  it('baskı yolu değiştiyse şerit uyarıyla kalır — hizmet açıkken de kapalıyken de (anahtar kaybolmaz)', async () => {
    newApk({ enabled: true, running: true, route: 'agent' });
    h.row = settings('agent');
    const { unmount } = render(<StationStrip />);
    expect(await screen.findByText(/Baskı yolu "Tablet yazıcı istasyonu" değil/)).toBeVisible();
    // Açık anahtar "Açık" demez: bu yolda bu tablet basmaz.
    expect(screen.getByText('Baskı yolu farklı')).toBeInTheDocument();
    expect(screen.queryByText('Açık')).toBeNull();
    unmount();

    delete (window as W).Capacitor;
    __resetBackgroundStationForTests();
    useStationStore.setState({ bg: null });
    newApk({ enabled: false, route: 'agent' });
    render(<StationStrip />);
    const toggle = await switchReady();
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Kapalı')).toBeInTheDocument();
    expect(screen.getByText(/Baskı yolu "Tablet yazıcı istasyonu" değil/)).toBeVisible();
  });

  it('hizmet yerelde açık ama sunucu rotası farklıysa da uyarır', async () => {
    newApk({ enabled: true, running: true, route: 'epson_sdp' });
    render(<StationStrip />);
    expect(await screen.findByText(/bu tablet fiş basmaz/)).toBeInTheDocument();
  });

  it('durum yalnız ekran görünürken 2 sn’de bir okunur', async () => {
    vi.useFakeTimers();
    const { plugin } = newApk({ enabled: true, running: true });
    render(<StationStrip />);
    await act(() => vi.advanceTimersByTimeAsync(0));
    const base = plugin.getBackgroundStation.mock.calls.length;
    expect(base).toBeGreaterThanOrEqual(2); // kip tespiti + ilk okuma

    await act(() => vi.advanceTimersByTimeAsync(BG_POLL_MS * 2));
    expect(plugin.getBackgroundStation.mock.calls.length).toBe(base + 2);

    setVisibility('hidden');
    await act(() => vi.advanceTimersByTimeAsync(BG_POLL_MS * 3));
    expect(plugin.getBackgroundStation.mock.calls.length).toBe(base + 2);

    setVisibility('visible');
    await act(() => vi.advanceTimersByTimeAsync(0));
    expect(plugin.getBackgroundStation.mock.calls.length).toBe(base + 3);
  });

  it('eski APK’da açık olan anahtar yeni APK’da bir kez kendiliğinden taşınır', async () => {
    const { plugin } = newApk();
    localStorage.setItem(STATION_ON_KEY, '1');
    useStationStore.setState({ on: true });
    h.callRpc.mockResolvedValueOnce({ id: 'dev-7', token: TOKEN });
    render(<StationStrip />);
    await waitFor(() => expect(plugin.startBackgroundStation).toHaveBeenCalledOnce());
    await waitFor(() => expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true'));
    // Eski anahtar silindi: Admin'den "Kaldır" sonrası tablet kendini yeniden kaydetmez.
    expect(localStorage.getItem(STATION_ON_KEY)).toBeNull();
    expect(useStationStore.getState().on).toBe(false);
    expect(h.startStation).not.toHaveBeenCalled();
  });
});

describe('<StationStrip /> — eski APK', () => {
  it('getBackgroundStation "not implemented" ile reddederse eski JS döngüsü eskisi gibi çalışır', async () => {
    const plugin = {
      send: vi.fn(),
      status: vi.fn(),
      getBackgroundStation: vi.fn(async () => {
        throw new Error('not implemented');
      }),
    };
    (window as W).Capacitor = { isNativePlatform: () => true, Plugins: { RamosPrinter: plugin } };
    useStationStore.setState({ on: true });
    render(<StationStrip />);
    await waitFor(() => expect(h.startStation).toHaveBeenCalledOnce());
    expect(screen.getByText(/Ekranı açık tutun, uygulamayı kapatmayın/)).toBeInTheDocument();
    expect(screen.queryByText(/Arka planda çalışıyor/)).toBeNull();
    expect(h.callRpc).not.toHaveBeenCalled();
  });
});
