import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { SettingsRow } from '../../../data/settings';
import type { SdpPrinter } from '../../../data/sdpPrinters';

// Veri katmanı sahte: canlı ayara ve yazıcı kaydına ASLA yazılmaz. Test, ekranın RPC'ye ne
// gönderdiğini ve dönen tek seferlik adresi nasıl gösterdiğini ölçer.
type MutateOpts<R> = { onSuccess?: (r: R) => void; onError?: (e: unknown) => void };
const h = vi.hoisted(() => ({
  row: { print_route: 'agent' } as unknown as SettingsRow,
  printers: [] as SdpPrinter[],
  updateSettings: vi.fn(),
  create: vi.fn(),
  rotate: vi.fn(),
  setActive: vi.fn(),
}));

vi.mock('../../../data/settings', () => ({
  useSettings: () => h.row,
  useUpdateSettings: () => ({ mutate: h.updateSettings, isPending: false }),
}));
vi.mock('../../../data/sdpPrinters', () => ({
  useSdpPrinters: () => ({ data: h.printers, isLoading: false }),
  useCreateSdpPrinter: () => ({ mutate: h.create, isPending: false, reset: vi.fn() }),
  useRotateSdpToken: () => ({ mutate: h.rotate, isPending: false, reset: vi.fn() }),
  useSetSdpPrinterActive: () => ({ mutate: h.setActive, isPending: false }),
}));

import { useAuth } from '../../../lib/auth';
import { useToast } from '../../../lib/toast';
import { PrintRouteSection } from './PrintRouteSection';

const TOKEN = 'ab'.repeat(32);
const URL_ = `https://abc.supabase.co/functions/v1/epson-sdp?t=${TOKEN}`;
const printer = (over: Partial<SdpPrinter> = {}): SdpPrinter => ({
  id: 'p1',
  name: 'Mutfak TM-m30III',
  is_active: true,
  created_at: '2026-09-17T10:00:00Z',
  last_seen_at: null,
  last_error: null,
  ...over,
});
const renderSection = () => render(<PrintRouteSection supabaseUrl="https://abc.supabase.co" />);

describe('<PrintRouteSection />', () => {
  beforeEach(() => {
    h.row = { print_route: 'agent' } as unknown as SettingsRow;
    h.printers = [];
    for (const m of [h.updateSettings, h.create, h.rotate, h.setActive]) m.mockReset();
    useToast.getState().dismiss();
    useAuth.setState({
      profile: {
        id: 'me',
        username: 'patron',
        display_name: 'Patron',
        role: 'admin',
        locale: 'tr',
        is_active: true,
        on_duty_since: null,
      },
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it('kayıtlı yol seçili; başka yol seçilince "uygula" çıkar ve yalnız print_route yazılır', async () => {
    const user = userEvent.setup();
    h.printers = [printer()];
    renderSection();
    expect(screen.getByRole('heading', { name: 'Baskı yolu', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /Bilgisayar programı/ })).toBeChecked();
    expect(screen.queryByRole('button', { name: 'Baskı yolunu uygula' })).toBeNull();

    await user.click(screen.getByRole('radio', { name: /Epson Server Direct Print/ }));
    expect(screen.getByText(/Uygulanana kadar fişler eski yoldan basılır/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Baskı yolunu uygula' }));
    expect(h.updateSettings).toHaveBeenCalledWith(
      { print_route: 'epson_sdp', updated_by: 'me' },
      expect.anything(),
    );
  });

  it('SDP yolu seçiliyken etkin yazıcı yoksa uyarır; ajanın basmayacağını söyler', () => {
    h.row = { print_route: 'epson_sdp' } as unknown as SettingsRow;
    h.printers = [printer({ is_active: false })];
    renderSection();
    expect(screen.getByRole('radio', { name: /Epson Server Direct Print/ })).toBeChecked();
    expect(screen.getByText(/Etkin Epson yazıcısı yok/)).toBeInTheDocument();
    expect(
      screen.getByText(/Bilgisayar programı açık kalabilir ama bu yolda fiş basmaz/),
    ).toBeInTheDocument();
  });

  it('üç yol listelenir; tablet istasyonu seçilince kurulum notu çıkar ve station yazılır', async () => {
    const user = userEvent.setup();
    renderSection();
    expect(screen.getAllByRole('radio')).toHaveLength(3);
    expect(screen.queryByText(/Yeni Ramo's Android uygulaması \(v2\) gerekir/)).toBeNull();

    await user.click(screen.getByRole('radio', { name: /Tablet yazıcı istasyonu/ }));
    expect(screen.getByText(/Yeni Ramo's Android uygulaması \(v2\) gerekir/)).toBeInTheDocument();
    expect(screen.getByText(/yazıcıyla aynı Wi-Fi'da olmalı/)).toBeInTheDocument();
    expect(screen.getByText(/Uygulanana kadar fişler eski yoldan basılır/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Baskı yolunu uygula' }));
    expect(h.updateSettings).toHaveBeenCalledWith(
      { print_route: 'station', updated_by: 'me' },
      expect.anything(),
    );
  });

  it('kayıtlı yol istasyonsa seçili görünür; ajan ve SDP boşta notu', () => {
    h.row = { print_route: 'station' } as unknown as SettingsRow;
    renderSection();
    expect(screen.getByRole('radio', { name: /Tablet yazıcı istasyonu/ })).toBeChecked();
    expect(screen.getByText(/yalnız tablet istasyonu basar/)).toBeInTheDocument();
    expect(screen.queryByText(/Bilgisayar programı açık kalabilir/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Baskı yolunu uygula' })).toBeNull();
  });

  it('yazıcı listesi: ad, etkin/pasif, bağlantı durumu, son hata', () => {
    h.printers = [
      printer({ last_seen_at: new Date().toISOString(), last_error: 'EPTR_REC_EMPTY' }),
      printer({ id: 'p2', name: 'Bar', is_active: false }),
    ];
    renderSection();
    const list = within(screen.getByRole('list', { name: 'Epson yazıcıları' }));
    const [first, second] = list.getAllByRole('listitem');
    expect(within(first!).getByText('Mutfak TM-m30III')).toBeInTheDocument();
    expect(within(first!).getByText('Bağlı')).toBeInTheDocument();
    expect(within(first!).getByText(/EPTR_REC_EMPTY/)).toBeInTheDocument();
    expect(within(second!).getByText('Pasif')).toBeInTheDocument();
    expect(within(second!).getByText('Hiç bağlanmadı')).toBeInTheDocument();
  });

  it('yazıcı ekle: adres bir kez gösterilir, kopyalanır, kapatınca kaybolur', async () => {
    const user = userEvent.setup();
    const writeText = vi.fn(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    h.create.mockImplementation((_name: string, opts: MutateOpts<{ id: string; token: string }>) =>
      opts.onSuccess?.({ id: 'p9', token: TOKEN }),
    );
    renderSection();

    const add = screen.getByRole('button', { name: 'Yazıcı ekle' });
    expect(add).toBeDisabled();
    await user.type(screen.getByLabelText('Yazıcı adı'), '  Mutfak  ');
    await user.click(add);
    expect(h.create).toHaveBeenCalledWith('Mutfak', expect.anything());

    expect(screen.getByText(URL_)).toBeInTheDocument();
    expect(screen.getByText(/Bu adres bir daha gösterilmez/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adresi kopyala' }));
    expect(writeText).toHaveBeenCalledWith(URL_);
    await user.click(screen.getByRole('button', { name: 'Kaydettim, kapat' }));
    expect(screen.queryByText(URL_)).toBeNull();
    expect(screen.getByLabelText('Yazıcı adı')).toHaveValue('');
  });

  it('anahtarı yenile onay ister ve yeni adresi gösterir; vazgeçilirse çağrılmaz', async () => {
    const user = userEvent.setup();
    h.printers = [printer()];
    h.rotate.mockImplementation((_id: string, opts: MutateOpts<{ id: string; token: string }>) =>
      opts.onSuccess?.({ id: 'p1', token: TOKEN }),
    );
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderSection();

    await user.click(screen.getByRole('button', { name: 'Anahtarı yenile' }));
    expect(h.rotate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Anahtarı yenile' }));
    expect(confirm).toHaveBeenCalledTimes(2);
    expect(h.rotate).toHaveBeenCalledWith('p1', expect.anything());
    expect(screen.getByText(URL_)).toBeInTheDocument();
  });

  it('pasifleştir / etkinleştir', async () => {
    const user = userEvent.setup();
    h.printers = [printer(), printer({ id: 'p2', name: 'Bar', is_active: false })];
    renderSection();
    await user.click(screen.getByRole('button', { name: 'Pasifleştir' }));
    expect(h.setActive).toHaveBeenCalledWith({ id: 'p1', active: false }, expect.anything());
    await user.click(screen.getByRole('button', { name: 'Etkinleştir' }));
    expect(h.setActive).toHaveBeenCalledWith({ id: 'p2', active: true }, expect.anything());
  });

  it('Web Config rehberi adımları görünür', () => {
    renderSection();
    expect(screen.getByText('Epson Web Config adımları')).toBeInTheDocument();
    expect(screen.getByText(/Interval/)).toBeInTheDocument();
  });
});
