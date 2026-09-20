import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { PrinterDiscoveryResult } from '../../../native/capacitor';
import { PrinterFinder } from './PrinterFinder';

type W = Window & { Capacitor?: unknown };

function mockNative(discover?: (o?: { host?: string }) => Promise<PrinterDiscoveryResult>) {
  (window as W).Capacitor = {
    isNativePlatform: () => true,
    Plugins: { RamosPrinter: { send: vi.fn(), status: vi.fn(), ...(discover ? { discover } : {}) } },
  };
}

afterEach(() => {
  delete (window as W).Capacitor;
});

describe('<PrinterFinder />', () => {
  it('tarayıcıda hiçbir şey çizmez', () => {
    const { container } = render(<PrinterFinder currentHost="" onPick={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('eski APK: düğme yerine sürüm uyarısı', () => {
    mockNative();
    render(<PrinterFinder currentHost="" onPick={vi.fn()} />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByRole('note')).toHaveTextContent(/v2\.3/);
  });

  it('bulunanları listeler, "Kullan" seçileni verir, kayıtlı adres işaretlenir', async () => {
    const discover = vi.fn().mockResolvedValue({
      ok: true,
      networks: [{ address: '192.168.2.17', prefix: 24, transport: 'wifi' }],
      printers: [
        { host: '192.168.2.198', port: 443, kind: 'epson_epos', confirmed: true, status: '121212' },
        { host: '192.168.2.40', port: 9100, kind: 'open', confirmed: false, message: 'cevap yok' },
      ],
      scanned: 254,
      durationMs: 8000,
    });
    mockNative(discover);
    const onPick = vi.fn();
    render(<PrinterFinder currentHost=" 192.168.2.198 " onPick={onPick} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ağdaki yazıcıyı bul' }));
    expect(discover).toHaveBeenCalledWith({ host: '192.168.2.198' });

    expect(await screen.findByText('192.168.2.198:443')).toBeInTheDocument();
    expect(screen.getByText('192.168.2.40:9100')).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('2 yazıcı bulundu');
    expect(screen.getByRole('status')).toHaveTextContent('192.168.2.17/24');
    expect(screen.getByText('Kayıtlı adres')).toBeInTheDocument();
    expect(screen.getByText('cevap yok')).toBeInTheDocument();

    const use = screen.getAllByRole('button', { name: 'Bu yazıcıyı kullan' });
    expect(use).toHaveLength(2);
    await userEvent.click(use[0]!);
    expect(onPick).toHaveBeenCalledWith(
      expect.objectContaining({ host: '192.168.2.198', port: 443, kind: 'epson_epos' }),
    );
  });

  it('yazıcı yoksa taranan adres sayısıyla uyarı; ağ yoksa hata', async () => {
    const discover = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, networks: [], printers: [], scanned: 253 })
      .mockResolvedValueOnce({ ok: false, error: 'no_network' });
    mockNative(discover);
    render(<PrinterFinder currentHost="" onPick={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: 'Ağdaki yazıcıyı bul' }));
    expect(await screen.findByRole('status')).toHaveTextContent('253 adres tarandı');
    expect(discover).toHaveBeenCalledWith({});

    await userEvent.click(screen.getByRole('button', { name: 'Ağdaki yazıcıyı bul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/Wi-Fi/);
  });

  it('eklenti reddederse hata metni, asla fırlatmaz', async () => {
    mockNative(vi.fn().mockRejectedValue(new Error('boom')));
    render(<PrinterFinder currentHost="" onPick={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: 'Ağdaki yazıcıyı bul' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('boom');
  });
});
