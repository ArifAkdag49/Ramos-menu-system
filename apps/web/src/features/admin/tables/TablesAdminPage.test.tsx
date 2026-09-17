import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../../i18n';

// Veri katmanı sahte: test ekranın **kararlarını** ölçer (kilit, öneri, yalnız değişen satır),
// Supabase'e giden yazımı değil — o `tablesLogic.changedTables` testinde.
const h = vi.hoisted(() => ({
  tables: [] as { id: string; name: string; sort: number; is_active: boolean }[],
  overview: [] as { table_id: string; session_id: string | null }[],
  saveTables: vi.fn(),
  refetch: vi.fn(),
}));

vi.mock('../../../data/adminTables', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../data/adminTables')>()),
  useAdminTables: () => ({ isPending: false, data: h.tables }),
  saveTables: h.saveTables,
}));

vi.mock('../../../data/tables', () => ({
  useTableOverviewQuery: () => ({ data: h.overview, refetch: h.refetch }),
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

describe('<TablesAdminPage />', () => {
  beforeEach(() => {
    h.tables = [
      { id: 't1', name: 'Tisch 1', sort: 10, is_active: true },
      { id: 't2', name: 'Tisch 2', sort: 20, is_active: true },
    ];
    h.overview = [
      { table_id: 't1', session_id: 's1' },
      { table_id: 't2', session_id: null },
    ];
    h.saveTables.mockReset().mockResolvedValue(undefined);
    h.refetch.mockReset().mockImplementation(async () => ({ data: h.overview }));
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
      data: [
        { table_id: 't1', session_id: 's1' },
        { table_id: 't2', session_id: 's2' },
      ],
    });
    await userEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    expect(h.saveTables).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Masa 2 masasında açık hesap var');
  });
});
