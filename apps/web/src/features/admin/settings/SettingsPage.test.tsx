import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { SettingsRow } from '../../../data/settings';

// Veri katmanı sahte: canlı `settings` satırına ASLA yazılmaz. Test, ekranın kaydetmeye ne
// gönderdiğini (`mutate` argümanı) ve ne zaman göndermediğini ölçer.
const h = vi.hoisted(() => ({
  row: undefined as unknown as SettingsRow,
  mutate: vi.fn(),
  isPending: false,
}));

vi.mock('../../../data/settings', () => ({
  useSettings: () => h.row,
  useUpdateSettings: () => ({ mutate: h.mutate, isPending: h.isPending }),
}));

vi.mock('../../../data/staff', () => ({
  useStaffNames: () => new Map([['me', 'Patron']]),
}));

// Yazıcı kartı kendi testinde (PrinterCard.test.tsx); burada yalnız yerinde durduğu görülür.
vi.mock('../PrinterCard', () => ({
  PrinterCard: () => <section aria-label="printer-card" />,
}));

import { useAuth } from '../../../lib/auth';
import { useToast } from '../../../lib/toast';
import { SettingsPage } from './SettingsPage';

const baseRow = (over: Partial<SettingsRow> = {}): SettingsRow => ({
  id: 1,
  restaurant_name: "Ramo's Döner & Grill House",
  ticket_header: "RAMO'S · KÜCHE",
  ticket_footer: '',
  business_day_start: '05:00:00',
  printer_host: '192.168.1.50',
  printer_port: 9100,
  printer_codepage: 'cp857',
  printer_codepage_number: 61,
  printer_transliterate: false,
  quick_notes: [
    { de: 'gut durch', tr: 'İyi pişmiş' },
    { de: 'wenig Soße', tr: 'Az sos' },
  ],
  cancel_reasons: [{ de: 'Sonstiges', tr: 'Diğer', freeText: true }],
  allergen_legend: [{ code: 'a', de: 'Glutenhaltiges Getreide', tr: 'Glutenli tahıl' }],
  updated_at: '2026-09-17T10:00:00Z',
  updated_by: 'me',
  ...over,
});

const saveButton = () => screen.getByRole('button', { name: 'Kaydet' });
const section = (title: string) => {
  const el = screen.getByRole('heading', { name: title, level: 2 }).closest('section');
  if (!el) throw new Error(`bölüm yok: ${title}`);
  return within(el);
};

describe('<SettingsPage />', () => {
  beforeEach(() => {
    h.row = baseRow();
    h.mutate.mockReset();
    h.isPending = false;
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

  it('değişiklik yokken Kaydet pasif; son kaydı yapan ve saat görünür', () => {
    render(<SettingsPage />);
    expect(saveButton()).toBeDisabled();
    expect(screen.getByText('Tüm değişiklikler kayıtlı')).toBeInTheDocument();
    expect(screen.getByText('Son kayıt: 17.09.2026 12:00 · Patron')).toBeInTheDocument();
    expect(screen.getByLabelText('İş günü başlangıcı')).toHaveValue('05:00');
    expect(screen.getByRole('region', { name: 'printer-card' })).toBeInTheDocument();
  });

  it('ayar gelmeden yükleniyor gösterir', () => {
    h.row = undefined as unknown as SettingsRow;
    render(<SettingsPage />);
    expect(screen.getAllByText('Yükleniyor').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Kaydet' })).toBeNull();
  });

  it('hatalı port ve IP: kaydetmez, alanın altında hata yazar ve ilk hatalı alana odaklanır', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const host = screen.getByLabelText('IP adresi');
    await user.clear(host);
    await user.type(host, '999.1.1.1');
    const port = screen.getByLabelText('Port');
    await user.clear(port);
    await user.type(port, '70000');

    await user.click(saveButton());

    expect(h.mutate).not.toHaveBeenCalled();
    expect(screen.getByText('Adres hatalı — örnek: 192.168.1.50')).toBeInTheDocument();
    expect(screen.getByText('1 ile 65535 arası olmalı (genelde 9100)')).toBeInTheDocument();
    expect(host).toHaveAttribute('aria-invalid', 'true');
    await vi.waitFor(() => expect(host).toHaveFocus());
    // Uyarı kayıt çubuğunda; toast çubuğun üstüne binip "Kaydet"i örtmesin diye çıkmaz.
    expect(screen.getByText('Kırmızı işaretli alanları düzelt, sonra kaydet')).toBeInTheDocument();
    expect(useToast.getState().message).toBeNull();
  });

  it('başlık değişince önizleme anında güncellenir; kayıt kırpılmış değeri ve kaydedeni gönderir', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const header = screen.getByLabelText('Başlık');
    await user.clear(header);
    await user.type(header, '  RAMOS TEST  ');

    expect(screen.getByTestId('ticket-preview')).toHaveTextContent('RAMOS TEST');
    expect(screen.getByText('Kaydedilmemiş değişiklik var')).toBeInTheDocument();
    expect(saveButton()).toBeEnabled();

    await user.click(saveButton());

    expect(h.mutate).toHaveBeenCalledTimes(1);
    const [patch, options] = h.mutate.mock.calls[0] as [
      Record<string, unknown>,
      { onSuccess: () => void },
    ];
    expect(patch).toMatchObject({
      ticket_header: 'RAMOS TEST',
      printer_codepage: 'cp857',
      printer_codepage_number: 61,
      business_day_start: '05:00',
      updated_by: 'me',
    });
    act(() => options.onSuccess());
    expect(useToast.getState().message).toBe('Ayarlar kaydedildi');
  });

  it('karakter tablosu adı ve numarası birlikte seçilir; yazıcı değişince "önce kaydet" uyarısı', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(screen.queryByText(/Test fişi kayıtlı ayarlarla basılır/)).toBeNull();

    await user.selectOptions(screen.getByLabelText('Karakter tablosu'), 'windows1254/91');

    expect(screen.getByText(/Test fişi kayıtlı ayarlarla basılır/)).toBeInTheDocument();
    await user.click(saveButton());
    expect(h.mutate.mock.calls[0]?.[0]).toMatchObject({
      printer_codepage: 'windows1254',
      printer_codepage_number: 91,
    });
  });

  it('yazıcı türü: kayıtlı Xprinter ayarı tanınır; Epson seçilince port 9143 + windows1254/48 dolar, açıklama çıkar ve öyle kaydedilir', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const type = screen.getByLabelText('Yazıcı türü');
    expect(type).toHaveValue('xprinter');
    expect(screen.queryByText(/Secure Printing/)).toBeNull();

    await user.selectOptions(type, 'epson');

    expect(screen.getByLabelText('Port')).toHaveValue('9143');
    expect(screen.getByLabelText('Karakter tablosu')).toHaveValue('windows1254/48');
    expect(
      screen.getByText(
        "Epson'da Secure Printing açıkken baskı şifreli 9143 portundan yapılır; yazıcı ile bilgisayar aynı ağda olmalı.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText(/Test fişi kayıtlı ayarlarla basılır/)).toBeInTheDocument();
    expect(h.mutate).not.toHaveBeenCalled(); // seçim tek başına kaydetmez

    await user.click(saveButton());
    expect(h.mutate.mock.calls[0]?.[0]).toMatchObject({
      printer_host: '192.168.1.50',
      printer_port: 9143,
      printer_codepage: 'windows1254',
      printer_codepage_number: 48,
    });
  });

  it('yazıcı türü: kayıtlı Epson ayarı tanınır; alan elle değişince "Özel" olur; Özel seçimi alanlara dokunmaz', async () => {
    h.row = baseRow({
      printer_port: 9143,
      printer_codepage: 'windows1254',
      printer_codepage_number: 48,
    });
    const user = userEvent.setup();
    render(<SettingsPage />);
    const type = screen.getByLabelText('Yazıcı türü');
    expect(type).toHaveValue('epson');

    await user.selectOptions(screen.getByLabelText('Karakter tablosu'), 'cp857/13');
    expect(type).toHaveValue('custom');
    expect(screen.queryByText(/Secure Printing/)).toBeNull();

    await user.selectOptions(type, 'xprinter');
    expect(screen.getByLabelText('Port')).toHaveValue('9100');
    expect(screen.getByLabelText('Karakter tablosu')).toHaveValue('cp857/61');

    await user.selectOptions(type, 'custom');
    expect(type).toHaveValue('custom');
    expect(screen.getByLabelText('Port')).toHaveValue('9100');
    expect(screen.getByLabelText('Karakter tablosu')).toHaveValue('cp857/61');
  });

  it('transliterasyon açılınca önizlemede Türkçe harfler sadeleşir', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    expect(screen.getByTestId('ticket-preview')).toHaveTextContent('Kuzu Şiş');
    await user.click(screen.getByLabelText(/Türkçe harfleri sadeleştir/));
    expect(screen.getByTestId('ticket-preview')).toHaveTextContent('Kuzu Sis');
  });

  it('iş günü başlangıcı saat olarak kaydedilir', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const time = screen.getByLabelText('İş günü başlangıcı');
    await user.clear(time);
    await user.type(time, '04:30');
    await user.click(saveButton());
    expect(h.mutate.mock.calls[0]?.[0]).toMatchObject({ business_day_start: '04:30' });
  });

  it('hızlı not: ekle (odak yeni satırda), boş DE ile kaydetmez, silinince kaydeder', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const notes = section('Hızlı notlar');
    await user.click(notes.getByRole('button', { name: 'Not ekle' }));

    const deInputs = notes.getAllByLabelText(/Almanca \(fişte\)/);
    expect(deInputs).toHaveLength(3);
    expect(deInputs[2]).toHaveFocus();

    await user.click(saveButton());
    expect(h.mutate).not.toHaveBeenCalled();
    expect(notes.getByText('Almanca metin boş olamaz')).toBeInTheDocument();

    await user.click(notes.getByRole('button', { name: 'Sil – 3. satır' }));
    // Yeni satır silinince form kayıtlı hâle döner: kaydedilecek bir şey kalmaz.
    expect(saveButton()).toBeDisabled();
  });

  it('hızlı not sırası taşı düğmeleriyle değişir ve öyle kaydedilir', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const notes = section('Hızlı notlar');
    const firstRow = notes.getByDisplayValue('gut durch').closest('li') as HTMLElement;
    expect(within(firstRow).getByRole('button', { name: 'Yukarı taşı' })).toBeDisabled();

    await user.click(within(firstRow).getByRole('button', { name: 'Aşağı taşı' }));
    await user.click(saveButton());

    expect(h.mutate.mock.calls[0]?.[0]).toMatchObject({
      quick_notes: [
        { de: 'wenig Soße', tr: 'Az sos' },
        { de: 'gut durch', tr: 'İyi pişmiş' },
      ],
    });
  });

  it('iptal sebebinde serbest metin bayrağı kaldırılınca anahtar yazılmaz', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const reasons = section('İptal sebepleri');
    await user.click(reasons.getByLabelText('Serbest metin iste'));
    await user.click(saveButton());
    expect(h.mutate.mock.calls[0]?.[0]).toMatchObject({
      cancel_reasons: [{ de: 'Sonstiges', tr: 'Diğer' }],
    });
  });

  it('alerjen kodu tekrar ederse satırda hata', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    const allergens = section('Alerjen lejantı');
    await user.click(allergens.getByRole('button', { name: 'Alerjen ekle' }));
    const codes = allergens.getAllByLabelText(/Kod/);
    await user.type(codes[1] as HTMLElement, 'a');
    await user.type(allergens.getAllByLabelText(/Almanca \(fişte\)/)[1] as HTMLElement, 'Eier');
    await user.click(saveButton());
    expect(h.mutate).not.toHaveBeenCalled();
    expect(allergens.getByText('Bu kod listede zaten var')).toBeInTheDocument();
  });

  it('başka cihazdaki değişiklik: form temizse sessizce yenilenir', () => {
    const { rerender } = render(<SettingsPage />);
    h.row = baseRow({ ticket_header: 'NEU', updated_at: '2026-09-17T11:00:00Z' });
    rerender(<SettingsPage />);
    expect(screen.getByLabelText('Başlık')).toHaveValue('NEU');
    expect(screen.queryByText(/başka bir cihazda değiştirildi/)).toBeNull();
  });

  it('başka cihazdaki değişiklik: yerel değişiklik varsa silinmez, uyarı çıkar; yeniden yükle', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SettingsPage />);
    const footer = screen.getByLabelText('Alt yazı');
    await user.type(footer, 'Guten Appetit');

    h.row = baseRow({ ticket_header: 'NEU', updated_at: '2026-09-17T11:00:00Z' });
    rerender(<SettingsPage />);

    expect(screen.getByLabelText('Alt yazı')).toHaveValue('Guten Appetit');
    expect(screen.getByText(/başka bir cihazda değiştirildi/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Yeniden yükle' }));
    expect(screen.getByLabelText('Alt yazı')).toHaveValue('');
    expect(screen.getByLabelText('Başlık')).toHaveValue('NEU');
    expect(screen.queryByText(/başka bir cihazda değiştirildi/)).toBeNull();
  });

  it('kendi kaydımız dönünce form yeni kayda geçer, uyarı çıkmaz', async () => {
    const user = userEvent.setup();
    const { rerender } = render(<SettingsPage />);
    await user.type(screen.getByLabelText('Alt yazı'), 'Danke');
    h.row = baseRow({ ticket_footer: 'Danke', updated_at: '2026-09-17T11:00:00Z' });
    rerender(<SettingsPage />);
    expect(screen.queryByText(/başka bir cihazda değiştirildi/)).toBeNull();
    expect(saveButton()).toBeDisabled();
  });

  it('Vazgeç yerel değişiklikleri geri alır', async () => {
    const user = userEvent.setup();
    render(<SettingsPage />);
    await user.type(screen.getByLabelText('Alt yazı'), 'x');
    await user.click(screen.getByRole('button', { name: 'Vazgeç' }));
    expect(screen.getByLabelText('Alt yazı')).toHaveValue('');
    expect(saveButton()).toBeDisabled();
  });
});
