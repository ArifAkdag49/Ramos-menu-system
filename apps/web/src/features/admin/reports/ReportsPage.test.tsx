import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { OrderView } from '../../../data/orderMapper';
import type { ReportRange } from '../../../data/reports';

const h = vi.hoisted(() => ({
  report: undefined as ReportRange | undefined,
  useReportRange: vi.fn(),
  fetchOrdersForExport: vi.fn(),
  downloadTextFile: vi.fn(),
  dayStart: 300,
}));

vi.mock('../../../data/reports', () => ({
  useReportRange: (from: string, to: string) => {
    h.useReportRange(from, to);
    return { report: h.report, isPending: false, isStale: false, isError: false };
  },
}));

vi.mock('../../../data/settings', () => ({ useBusinessDayStart: () => h.dayStart }));

vi.mock('../../../data/staff', () => ({
  staffNamesQuery: { queryKey: ['staff'], queryFn: async () => new Map([['w1', 'Ayşe']]) },
  useAdminStaffList: () => ({
    data: [
      { id: 'w1', username: 'ayse', display_name: 'Ayşe' },
      { id: 'w2', username: 'test-e2e-garson', display_name: 'E2E Garson' },
    ],
  }),
}));

vi.mock('../../../data/adminOrders', () => ({ fetchOrdersForExport: h.fetchOrdersForExport }));

vi.mock('./csv', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./csv')>()),
  downloadTextFile: h.downloadTextFile,
}));

import { useToast } from '../../../lib/toast';
import { ReportsPage } from './ReportsPage';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

const report = (over: Partial<ReportRange> = {}): ReportRange => ({
  from: '2026-09-17',
  to: '2026-09-17',
  orders: 12,
  items: 30,
  value_cents: 24_650,
  cancelled_items: 2,
  cancelled_value_cents: 700,
  by_waiter: [
    { display_name: 'Ayşe', orders: 9, value_cents: 20_000 },
    { display_name: 'E2E Garson', orders: 3, value_cents: 4_650 },
  ],
  top_products: [
    { product_code: '05', product_name: 'Drehspieß Sandwich', qty: 14, value_cents: 11_900 },
    { product_code: null, product_name: 'Cola 0,33 l', qty: 8, value_cents: 2_800 },
  ],
  by_hour: [
    { hour: 1, orders: 1 },
    { hour: 18, orders: 7 },
    { hour: 20, orders: 4 },
  ],
  ...over,
});

const lastRange = () => h.useReportRange.mock.calls.at(-1);

describe('<ReportsPage />', () => {
  beforeEach(() => {
    // Yalnız tarih sahte: React Query'nin zamanlayıcıları gerçek kalır.
    vi.useFakeTimers({ toFake: ['Date'] });
    // Yaz saati: 10:00 UTC → Berlin 12:00 → iş günü 17.09.2026.
    vi.setSystemTime(new Date('2026-09-17T10:00:00Z'));
    h.report = report();
    h.dayStart = 300;
    h.useReportRange.mockReset();
    h.fetchOrdersForExport.mockReset();
    h.downloadTextFile.mockReset();
    useToast.getState().dismiss();
  });

  afterEach(() => vi.useRealTimers());

  it('varsayılan aralık bugünkü iş günü; kutular raporu gösterir', () => {
    render(<ReportsPage />, { wrapper });
    expect(lastRange()).toEqual(['2026-09-17', '2026-09-17']);
    expect(screen.getByRole('button', { name: 'Bugün' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('17.09.2026')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Sipariş başına 20,54 €')).toBeInTheDocument();
    expect(screen.getByText('7,00 € değerinde')).toBeInTheDocument();
    expect(screen.getByText('İş günü her gün saat 05:00 itibarıyla başlar')).toBeInTheDocument();
  });

  it('R86: iş günü başlangıcı ayardan — 04:00 başlangıçta 02:30 Berlin yeni gündür', () => {
    h.dayStart = 240;
    // 16.09 00:30 UTC → Berlin 02:30: 04:00 kuralıyla hâlâ 15.09.
    vi.setSystemTime(new Date('2026-09-16T00:30:00Z'));
    render(<ReportsPage />, { wrapper });
    expect(lastRange()).toEqual(['2026-09-15', '2026-09-15']);
    expect(screen.getByText('İş günü her gün saat 04:00 itibarıyla başlar')).toBeInTheDocument();
  });

  it('hazır aralıklar: Son 7 gün ve Bu ay', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Son 7 gün' }));
    expect(lastRange()).toEqual(['2026-09-11', '2026-09-17']);
    expect(screen.getByRole('button', { name: 'Son 7 gün' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(screen.getByRole('button', { name: 'Bugün' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByText('11.09.2026 – 17.09.2026 · 7 iş günü')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Bu ay' }));
    expect(lastRange()).toEqual(['2026-09-01', '2026-09-17']);
  });

  it('geçersiz aralıkta rapor ve CSV istenmez, hata yazılır', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />, { wrapper });
    const from = screen.getByLabelText('Başlangıç');
    await user.clear(from);
    await user.type(from, '2026-09-18');

    expect(screen.getByRole('alert')).toHaveTextContent('Bitiş tarihi başlangıçtan önce olamaz');
    expect(lastRange()).toEqual(['', '']);
    expect(screen.getByRole('button', { name: 'CSV indir' })).toBeDisabled();
  });

  it('test hesabı garsonu "Test" rozetiyle işaretlenir', () => {
    render(<ReportsPage />, { wrapper });
    const table = screen.getAllByRole('table')[0] as HTMLElement;
    const testRow = within(table).getByRole('rowheader', { name: /E2E Garson/ });
    expect(within(testRow).getByText('Test')).toBeInTheDocument();
    const realRow = within(table).getByRole('rowheader', { name: /Ayşe/ });
    expect(within(realRow).queryByText('Test')).toBeNull();
  });

  it('saatlik dağılım bir tablodur: iş günü sırası, boş saatler 0, değer ve pay okunur', () => {
    render(<ReportsPage />, { wrapper });
    const chart = screen.getByRole('table', { name: 'Saate göre sipariş sayısı' });
    const hours = within(chart)
      .getAllByRole('rowheader')
      .map((c) => c.textContent);
    expect(hours).toEqual(['18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00', '01:00']);
    const row18 = within(chart)
      .getByRole('rowheader', { name: '18:00' })
      .closest('tr') as HTMLElement;
    expect(row18).toHaveTextContent('7 · %58');
  });

  it('boş raporda bölümler yol gösterir', () => {
    h.report = report({
      orders: 0,
      items: 0,
      value_cents: 0,
      by_waiter: [],
      top_products: [],
      by_hour: [],
    });
    render(<ReportsPage />, { wrapper });
    expect(screen.getAllByText('Bu aralıkta satış yok — başka bir tarih seç')).toHaveLength(3);
  });

  it('CSV: aralıktaki siparişleri okur, BOM + başlıkla indirir, bitince bildirir', async () => {
    const user = userEvent.setup();
    const order: OrderView = {
      id: 'o1',
      order_no: 1,
      round_no: 1,
      status: 'served',
      created_at: '2026-09-17T10:00:00Z',
      ready_at: null,
      note: null,
      waiter_id: 'w1',
      waiter_name: 'Ayşe',
      table_name: 'Tisch 1',
      print: null,
      items: [
        {
          id: 'i1',
          product_id: 'p',
          quantity: 1,
          product_code: '05',
          product_name: 'Döner',
          variant_name_de: null,
          variant_name_tr: null,
          removed_ingredients: [],
          selected_options: [],
          extra_charges: [],
          note: null,
          status: 'active',
          cancel_reason: null,
          sort: 1,
          category_sort: 1,
          is_beverage: false,
          unit_price_cents: 850,
        },
      ],
    };
    let resolve: (v: OrderView[]) => void = () => {};
    h.fetchOrdersForExport.mockImplementation(() => new Promise((r) => (resolve = r)));
    render(<ReportsPage />, { wrapper });

    await user.click(screen.getByRole('button', { name: 'Son 7 gün' }));
    const button = screen.getByRole('button', { name: 'CSV indir' });
    await user.click(button);

    // İndirme sürerken düğme meşgul ve basılamaz.
    await vi.waitFor(() => expect(h.fetchOrdersForExport).toHaveBeenCalled());
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute('aria-busy', 'true');
    const [from, to, names] = h.fetchOrdersForExport.mock.calls[0] as [
      string,
      string,
      Map<string, string>,
    ];
    expect([from, to]).toEqual(['2026-09-11', '2026-09-17']);
    expect(names.get('w1')).toBe('Ayşe');

    resolve([order]);
    await vi.waitFor(() => expect(h.downloadTextFile).toHaveBeenCalledTimes(1));
    const [file, text, type] = h.downloadTextFile.mock.calls[0] as [string, string, string];
    expect(file).toBe('ramos-bestellungen-2026-09-11_2026-09-17.csv');
    expect(type).toBe('text/csv;charset=utf-8');
    expect(text.startsWith(`${String.fromCharCode(0xfeff)}Datum;Uhrzeit;Bestellung;`)).toBe(true);
    expect(text).toContain(';Döner;;8,50;8,50;');
    expect(useToast.getState().message).toBe('1 sipariş indirildi');
    await vi.waitFor(() => expect(button).toBeEnabled());
  });

  it('CSV: sipariş yoksa dosya oluşturulmaz; hata olursa bildirilir ve düğme geri gelir', async () => {
    const user = userEvent.setup();
    render(<ReportsPage />, { wrapper });
    const button = screen.getByRole('button', { name: 'CSV indir' });

    h.fetchOrdersForExport.mockResolvedValueOnce([]);
    await user.click(button);
    await vi.waitFor(() =>
      expect(useToast.getState().message).toBe('Bu aralıkta sipariş yok — dosya oluşturulmadı'),
    );
    expect(h.downloadTextFile).not.toHaveBeenCalled();

    h.fetchOrdersForExport.mockRejectedValueOnce(new Error('network'));
    await vi.waitFor(() => expect(button).toBeEnabled());
    await user.click(button);
    await vi.waitFor(() => expect(useToast.getState()).toMatchObject({ tone: 'danger' }));
    expect(h.downloadTextFile).not.toHaveBeenCalled();
    await vi.waitFor(() => expect(button).toBeEnabled());
  });
});
