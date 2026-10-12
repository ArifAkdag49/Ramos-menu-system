import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';
import type { AdminTableState } from '../../../data/adminTables';

// Veri katmanı sahte: test ekranın **kararlarını** ölçer (kilit, öneri, yalnız değişen satır,
// hangi oturuma hangi çağrı gider), Supabase'e giden yazımı değil — o `tablesLogic.changedTables`
// ve `supabase/tests/lifecycle.test.ts` tarafında.
const h = vi.hoisted(() => ({
  tables: [] as { id: string; name: string; sort: number; is_active: boolean }[],
  states: [] as AdminTableState[],
  saveTables: vi.fn(),
  refetch: vi.fn(),
  openSession: vi.fn(),
  closeSession: vi.fn(),
  resetSession: vi.fn(),
}));

vi.mock('../../../data/adminTables', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../data/adminTables')>()),
  useAdminTables: () => ({ isPending: false, data: h.tables }),
  useAdminTableStates: () => ({
    data: h.states,
    isPending: false,
    isFetching: false,
    refetch: h.refetch,
  }),
  useOpenTableSession: () => ({ mutateAsync: h.openSession, isPending: false }),
  useResetTableSession: () => ({ mutateAsync: h.resetSession, isPending: false }),
  saveTables: h.saveTables,
}));

vi.mock('../../../data/orders', () => ({
  useCloseSession: () => ({ mutateAsync: h.closeSession, isPending: false }),
}));

vi.mock('../../../data/settings', () => ({
  useSettings: () => ({
    cancel_reasons: [
      { de: 'Gast hat storniert', tr: 'Müşteri iptal etti' },
      { de: 'Sonstiges', tr: 'Diğer', freeText: true },
    ],
  }),
}));

import { TablesAdminPage } from './TablesAdminPage';

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>
);

const rowOf = (name: string) => {
  const input = screen.getByDisplayValue(name);
  const row = input.closest('li');
  if (!row) throw new Error(`satır yok: ${name}`);
  return row;
};

/** Masa durumu bölümündeki kart (düzenleme listesinin `li`'leriyle karışmasın diye `data-state`). */
const cardOf = (name: string) => {
  const heading = screen
    .getAllByText(name)
    .map((el) => el.closest('li[data-state]'))
    .find((li): li is HTMLLIElement => li !== null);
  if (!heading) throw new Error(`kart yok: ${name}`);
  return heading;
};

const state = (over: Partial<AdminTableState>): AdminTableState => ({
  table_id: 't1',
  name: 'Tisch 1',
  sort: 10,
  is_active: true,
  session_id: null,
  opened_at: null,
  opened_by_name: null,
  total_cents: 0,
  items: 0,
  orders_in_kitchen: 0,
  orders_ready: 0,
  ...over,
});

describe('<TablesAdminPage />', () => {
  beforeEach(() => {
    h.tables = [
      { id: 't1', name: 'Tisch 1', sort: 10, is_active: true },
      { id: 't2', name: 'Tisch 2', sort: 20, is_active: true },
    ];
    h.states = [
      state({
        table_id: 't1',
        name: 'Tisch 1',
        session_id: 's1',
        opened_at: new Date().toISOString(),
        opened_by_name: 'Ayşe',
        total_cents: 2450,
        items: 3,
        orders_in_kitchen: 1,
      }),
      state({ table_id: 't2', name: 'Tisch 2', sort: 20 }),
    ];
    h.saveTables.mockReset().mockResolvedValue(undefined);
    h.refetch.mockReset().mockImplementation(async () => ({ data: h.states }));
    h.openSession.mockReset().mockResolvedValue({ session_id: 'yeni' });
    h.closeSession.mockReset().mockResolvedValue(undefined);
    h.resetSession.mockReset().mockResolvedValue({ items: 3, value_cents: 2450, storno_jobs: 1 });
  });

  it('açık hesabı olan masanın "Kullanımda" anahtarı kilitli ve nedeni yazılı', () => {
    render(<TablesAdminPage />, { wrapper });

    const open = within(rowOf('Tisch 1'));
    expect(open.getByRole('checkbox', { name: /Kullanımda/ })).toBeDisabled();
    expect(open.getByText('Önce masayı kapat')).toBeInTheDocument();
    expect(open.getByText('Açık hesap var')).toBeInTheDocument();

    expect(within(rowOf('Tisch 2')).getByRole('checkbox', { name: /Kullanımda/ })).toBeEnabled();
  });

  it('+ Masa "Tisch 3" önerir; Kaydet yalnız yeni satırı yazar', async () => {
    render(<TablesAdminPage />, { wrapper });

    await userEvent.click(screen.getAllByRole('button', { name: 'Masa ekle' })[0]!);
    expect(screen.getByDisplayValue('Tisch 3')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(h.saveTables).toHaveBeenCalledWith([{ name: 'Tisch 3', sort: 30, is_active: true }], []);
  });

  it('aynı ad iki masada → kayıt gitmez, alan hatası görünür', async () => {
    render(<TablesAdminPage />, { wrapper });

    const name = within(rowOf('Tisch 2')).getByRole('textbox');
    await userEvent.clear(name);
    await userEvent.type(name, 'tisch 1');
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(h.saveTables).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('İşaretli alanları düzelt');
    expect(screen.getAllByText('Bu ad başka bir masada — farklı bir ad yaz')).toHaveLength(2);
  });

  it('kaydetmeden hemen önce masa açılmışsa pasifleştirme yazılmaz', async () => {
    render(<TablesAdminPage />, { wrapper });

    await userEvent.click(within(rowOf('Tisch 2')).getByRole('checkbox', { name: /Kullanımda/ }));
    // Ekran açıkken garson Tisch 2'yi açtı: kayıt anındaki taze özet bunu görür.
    h.refetch.mockResolvedValue({
      data: [h.states[0]!, { ...h.states[1]!, session_id: 's2' }],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(h.saveTables).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Masa 2 masasında açık hesap var');
  });
});

describe('<TablesAdminPage /> masa durumu (0017)', () => {
  beforeEach(() => {
    h.tables = [
      { id: 't1', name: 'Tisch 1', sort: 10, is_active: true },
      { id: 't2', name: 'Tisch 2', sort: 20, is_active: true },
    ];
    h.states = [
      state({
        table_id: 't1',
        name: 'Tisch 1',
        session_id: 's1',
        opened_at: new Date().toISOString(),
        opened_by_name: 'Ayşe',
        total_cents: 2450,
        items: 3,
        orders_in_kitchen: 1,
      }),
      state({ table_id: 't2', name: 'Tisch 2', sort: 20 }),
    ];
    h.saveTables.mockReset().mockResolvedValue(undefined);
    h.refetch.mockReset().mockImplementation(async () => ({ data: h.states }));
    h.openSession.mockReset().mockResolvedValue({ session_id: 'yeni' });
    h.closeSession.mockReset().mockResolvedValue(undefined);
    h.resetSession.mockReset().mockResolvedValue({ items: 3, value_cents: 2450, storno_jobs: 1 });
  });

  it('dolu masada hesap özeti + kapat/sıfırla, boş masada yalnız "Masayı aç" vardır', () => {
    render(<TablesAdminPage />, { wrapper });

    const busy = within(cardOf('Masa 1'));
    expect(busy.getByText('Dolu')).toBeInTheDocument();
    expect(busy.getByText('24,50 €')).toBeInTheDocument();
    expect(busy.getByText('Ayşe')).toBeInTheDocument();
    expect(busy.getByText('1 sipariş mutfakta')).toBeInTheDocument();
    expect(busy.getByRole('button', { name: 'Hesabı kapat' })).toBeInTheDocument();
    expect(busy.getByRole('button', { name: 'Sıfırla' })).toBeInTheDocument();
    expect(busy.queryByRole('button', { name: 'Masayı aç' })).not.toBeInTheDocument();

    const free = within(cardOf('Masa 2'));
    expect(free.getByText('Boş')).toBeInTheDocument();
    expect(free.getByRole('button', { name: 'Masayı aç' })).toBeInTheDocument();
    expect(free.queryByRole('button', { name: 'Hesabı kapat' })).not.toBeInTheDocument();
  });

  it('"Masayı aç" o masanın kimliğiyle çağrılır', async () => {
    render(<TablesAdminPage />, { wrapper });

    await userEvent.click(within(cardOf('Masa 2')).getByRole('button', { name: 'Masayı aç' }));
    expect(h.openSession).toHaveBeenCalledWith('t2');
  });

  it('hesap kapatma onay panelinden geçer; mutfaktaki sipariş uyarısı yazılı', async () => {
    render(<TablesAdminPage />, { wrapper });

    await userEvent.click(within(cardOf('Masa 1')).getByRole('button', { name: 'Hesabı kapat' }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByText('24,50 €')).toBeInTheDocument();
    expect(sheet.getByText(/mutfakta hazırlanıyor/)).toBeInTheDocument();
    expect(h.closeSession).not.toHaveBeenCalled();

    await userEvent.click(sheet.getByRole('button', { name: 'Hesabı kapat' }));
    expect(h.closeSession).toHaveBeenCalledWith('s1');
  });

  it('sıfırlama sebep seçilmeden gönderilemez; sebep sunucuya Almanca gider', async () => {
    render(<TablesAdminPage />, { wrapper });

    await userEvent.click(within(cardOf('Masa 1')).getByRole('button', { name: 'Sıfırla' }));
    const sheet = within(screen.getByRole('dialog'));
    expect(sheet.getByText(/3 kalem \(24,50 €\) iptal edilecek/)).toBeInTheDocument();
    expect(sheet.getByRole('button', { name: 'Sıfırla' })).toBeDisabled();

    await userEvent.click(sheet.getByRole('button', { name: 'Müşteri iptal etti' }));
    await userEvent.click(sheet.getByRole('button', { name: 'Sıfırla' }));
    expect(h.resetSession).toHaveBeenCalledWith({
      sessionId: 's1',
      reason: 'Gast hat storniert',
    });
  });
});
