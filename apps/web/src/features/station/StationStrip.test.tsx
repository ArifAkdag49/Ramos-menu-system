import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import type { SettingsRow } from '../../data/settings';

// Canlı ayara dokunulmaz: rota ve yazıcı bilgisi sahte. Döngü (stationBoot) sahte — gerçek
// döngü stationRunner.test.ts'te sınanır; burada yalnız ne zaman başlatılıp durdurulduğu ölçülür.
const h = vi.hoisted(() => ({
  row: undefined as SettingsRow | undefined,
  startStation: vi.fn(),
  stop: vi.fn(),
}));
vi.mock('../../data/settings', () => ({ useSettings: () => h.row }));
vi.mock('./stationBoot', () => ({ startStation: h.startStation }));

import { KitchenHeader } from '../kitchen/KitchenHeader';
import { StationStrip } from './StationStrip';
import { INITIAL_SNAPSHOT, stationBadge, STATION_ON_KEY, useStationStore } from './stationStore';

vi.mock('../../data/menu', () => ({
  useMenu: () => ({ categories: [], products: [], byId: new Map() }),
}));

type W = Window & { Capacitor?: unknown };
const printer = { send: vi.fn(), status: vi.fn() };

function native(plugins: Record<string, unknown> = { RamosPrinter: printer }) {
  (window as W).Capacitor = { isNativePlatform: () => true, Plugins: plugins };
}

const settings = (route: string) =>
  ({
    print_route: route,
    printer_host: '192.168.1.50',
    printer_port: 9100,
    printer_codepage: 'cp857',
    printer_codepage_number: 61,
    printer_transliterate: false,
  }) as unknown as SettingsRow;

beforeEach(() => {
  h.row = settings('station');
  h.stop.mockReset();
  h.startStation.mockReset().mockImplementation(() => ({ stop: h.stop }));
  localStorage.removeItem(STATION_ON_KEY);
  useStationStore.setState({ on: false, snapshot: INITIAL_SNAPSHOT });
});

afterEach(() => {
  delete (window as W).Capacitor;
});

describe('<StationStrip />', () => {
  it('tarayıcıda (yerel uygulama değil): anahtar yok; rota istasyonsa "bu cihaz basamaz" uyarısı', () => {
    render(<StationStrip />);
    expect(screen.queryByRole('switch')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(/bu cihaz Ramo's Android uygulaması değil/);
    expect(h.startStation).not.toHaveBeenCalled();
  });

  it('tarayıcıda rota başkaysa hiçbir şey çizmez', () => {
    h.row = settings('agent');
    const { container } = render(<StationStrip />);
    expect(container).toBeEmptyDOMElement();
  });

  it('yerel uygulamada rota başkaysa anahtar KALIR, rozet "Baskı yolu farklı" der, döngü başlamaz', async () => {
    native();
    h.row = settings('agent');
    useStationStore.setState({ on: true });
    const user = userEvent.setup();
    render(<StationStrip />);
    const toggle = screen.getByRole('switch', { name: /Yazıcı istasyonu/ });
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Baskı yolu farklı')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/Admin → Ayarlar → Baskı yolu/);
    expect(screen.queryByText(/Ekranı açık tutun/)).toBeNull();
    expect(h.startStation).not.toHaveBeenCalled();

    // Anahtar yine de kapatılıp açılabilir (kalıcı yazılır); döngü hâlâ başlamaz.
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Kapalı')).toBeInTheDocument();
    await user.click(toggle);
    expect(localStorage.getItem(STATION_ON_KEY)).toBe('1');
    expect(h.startStation).not.toHaveBeenCalled();
  });

  it('ayar henüz gelmediyse (rota bilinmiyor) uyarı çizilmez', () => {
    native();
    h.row = undefined;
    render(<StationStrip />);
    expect(screen.getByRole('switch')).toBeInTheDocument();
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('rota station: anahtar kapalı görünür; açınca kalıcı yazılır, döngü başlar, ipucu çıkar', async () => {
    native();
    const user = userEvent.setup();
    render(<StationStrip />);
    const toggle = screen.getByRole('switch', { name: /Yazıcı istasyonu/ });
    expect(toggle).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByText('Kapalı')).toBeInTheDocument();
    expect(screen.queryByText(/Ekranı açık tutun/)).toBeNull();

    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'true');
    expect(localStorage.getItem(STATION_ON_KEY)).toBe('1');
    expect(screen.getByText(/Ekranı açık tutun, uygulamayı kapatmayın/)).toBeInTheDocument();
    await waitFor(() => expect(h.startStation).toHaveBeenCalledOnce());

    // Döngüye verilen bağımlılıklar: gerçek eklenti ve güncel ayar.
    const args = h.startStation.mock.calls[0]![0] as {
      printer: unknown;
      getSettings: () => unknown;
    };
    expect(args.printer).toBe(printer);
    expect(args.getSettings()).toBe(h.row);

    await user.click(toggle);
    expect(h.stop).toHaveBeenCalledOnce();
    expect(localStorage.getItem(STATION_ON_KEY)).toBeNull();
  });

  it('durum rozeti: son baskı saati / yazıcıya ulaşılamıyor / son hata', async () => {
    native();
    useStationStore.setState({ on: true });
    render(<StationStrip />);
    await waitFor(() => expect(h.startStation).toHaveBeenCalledOnce());
    expect(screen.getByText('Açık')).toBeInTheDocument();

    const printedAt = new Date(2026, 8, 17, 14, 32).getTime();
    act(() => useStationStore.getState().patch({ reachable: true, lastPrintedAt: printedAt }));
    expect(screen.getByText('Açık · son baskı 14:32')).toBeInTheDocument();

    act(() =>
      useStationStore.getState().patch({ reachable: false, lastError: 'offline: timeout' }),
    );
    expect(screen.getByText('Yazıcıya ulaşılamıyor')).toBeInTheDocument();
    expect(screen.getByText('Son hata: offline: timeout')).toBeInTheDocument();
  });

  it('uygulama arka plana geçince döngü durur, öne gelince yeniden başlar', async () => {
    native();
    useStationStore.setState({ on: true });
    render(<StationStrip />);
    await waitFor(() => expect(h.startStation).toHaveBeenCalledOnce());

    const setVisibility = (v: 'hidden' | 'visible') => {
      Object.defineProperty(document, 'visibilityState', { value: v, configurable: true });
      act(() => void document.dispatchEvent(new Event('visibilitychange')));
    };
    setVisibility('hidden');
    expect(h.stop).toHaveBeenCalledOnce();
    setVisibility('visible');
    await waitFor(() => expect(h.startStation).toHaveBeenCalledTimes(2));
  });

  it('rota başka yola çevrilince döngü durur; şerit kalır ve nedenini söyler, yol dönünce döngü yeniden başlar', async () => {
    native();
    useStationStore.setState({ on: true });
    const { rerender } = render(<StationStrip />);
    await waitFor(() => expect(h.startStation).toHaveBeenCalledOnce());
    h.row = settings('epson_sdp');
    rerender(<StationStrip />);
    expect(h.stop).toHaveBeenCalledOnce();
    expect(screen.getByRole('switch')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Baskı yolu farklı')).toBeInTheDocument();
    expect(screen.getByRole('note')).toHaveTextContent(/bu tablet fiş basmaz/);

    h.row = settings('station');
    rerender(<StationStrip />);
    await waitFor(() => expect(h.startStation).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('note')).toBeNull();
  });

  it('eklentisiz eski APK: döngü başlamaz, neden gösterilir', () => {
    native({});
    useStationStore.setState({ on: true });
    render(<StationStrip />);
    expect(h.startStation).not.toHaveBeenCalled();
    expect(screen.getByText('Yazıcıya ulaşılamıyor')).toBeInTheDocument();
    expect(screen.getByText(/plugin_missing/)).toBeInTheDocument();
  });

  it('Mutfak başlığında başlık çubuğunun altında çizilir', () => {
    native();
    render(<KitchenHeader onOpenSoldOut={() => {}} />);
    expect(screen.getByRole('banner')).not.toContainElement(screen.getByRole('switch'));
    expect(screen.getByRole('switch', { name: /Yazıcı istasyonu/ })).toBeInTheDocument();
  });
});

describe('stationBadge', () => {
  it('öncelik: kapalı > adres yok > ulaşılamıyor > son baskı > açık', () => {
    const s = INITIAL_SNAPSHOT;
    expect(stationBadge(false, { ...s, reachable: false })).toMatchObject({
      key: 'kitchen.station.off',
    });
    expect(stationBadge(true, { ...s, missingPrinter: true, reachable: false })).toMatchObject({
      key: 'kitchen.station.noPrinter',
      tone: 'warning',
    });
    expect(stationBadge(true, { ...s, reachable: false, lastPrintedAt: 1 })).toMatchObject({
      key: 'kitchen.station.unreachable',
      tone: 'danger',
    });
    expect(stationBadge(true, { ...s, reachable: true, lastPrintedAt: 5 })).toEqual({
      key: 'kitchen.station.onLastPrint',
      tone: 'open',
      lastPrintedAt: 5,
    });
    expect(stationBadge(true, s)).toMatchObject({ key: 'kitchen.station.on', tone: 'open' });
  });

  it('baskı yolu istasyon değilse açık anahtar "Açık" demez: "Baskı yolu farklı" (uyarı); kapalıysa yine Kapalı', () => {
    const s = INITIAL_SNAPSHOT;
    expect(stationBadge(true, { ...s, reachable: true, lastPrintedAt: 5 }, false)).toEqual({
      key: 'kitchen.station.routeOffBadge',
      tone: 'warning',
    });
    expect(stationBadge(false, s, false)).toMatchObject({ key: 'kitchen.station.off' });
  });

  it('store değişmeyen yamada yeni nesne üretmez', () => {
    const before = useStationStore.getState().snapshot;
    useStationStore.getState().patch({ missingPrinter: false, running: false });
    expect(useStationStore.getState().snapshot).toBe(before);
  });
});
