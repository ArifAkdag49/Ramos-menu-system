import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { MemoryRouter } from 'react-router';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import i18n from '../../../i18n';

const rpc = vi.hoisted(() => ({ callRpc: vi.fn() }));
vi.mock('../../../lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../lib/rpc')>()),
  callRpc: rpc.callRpc,
}));
vi.mock('../../../data/settings', () => ({ useSettings: () => ({ restaurant_name: "Ramo's" }) }));

import { TimeclockAdminPage } from './TimeclockAdminPage';
import { addDays, berlinToday, mondayOf, type TimeclockOverview, type WeekData } from './timeclockLogic';

const monday = mondayOf(berlinToday());
const overview: TimeclockOverview = {
  settings: { qr_token: 'f'.repeat(32), location_check: true, has_location: false, radius_m: 150 },
  staff: [
    { id: 'a', name: 'Ayşe', active: true, paired: true, working: true, since: `${monday} 09:00` },
    { id: 'b', name: 'Bekir', active: true, paired: false, working: false, since: null },
  ],
};
const week: WeekData = {
  days: Array.from({ length: 7 }, (_, i) => addDays(monday, i)),
  staff: [
    { id: 'a', name: 'Ayşe', active: true },
    { id: 'b', name: 'Bekir', active: true },
  ],
  shifts: [
    {
      id: 's1',
      staff_id: 'a',
      work_date: monday,
      start: `${monday} 09:00`,
      end: `${monday} 16:30`,
      minutes: 450,
      missing_end: false,
      edited: false,
      manual: false,
      location_failed: true,
    },
  ],
};

function respond(fn: string, args?: Record<string, unknown>) {
  if (fn === 'timeclock_overview') return Promise.resolve(overview);
  if (fn === 'timeclock_week') return Promise.resolve(week);
  if (fn === 'timeclock_pair_code') return Promise.resolve({ code: 'c0de', expires: '2026-11-13 10:00' });
  if (fn === 'timeclock_add_staff') return Promise.resolve('new');
  if (fn === 'timeclock_edit_shift') return Promise.resolve(null);
  return Promise.reject(new Error(`beklenmeyen ${fn} ${JSON.stringify(args)}`));
}

const show = (path = '/admin/timeclock') => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[path]}>{children}</MemoryRouter>
    </QueryClientProvider>
  );
  return render(<TimeclockAdminPage />, { wrapper });
};

describe('TimeclockAdminPage', () => {
  beforeAll(() => {
    void i18n.changeLanguage('tr');
  });
  beforeEach(() => {
    rpc.callRpc.mockReset();
    rpc.callRpc.mockImplementation(respond);
  });

  it('haftalık tablo: şu an çalışanlar, mesai, toplam, konum uyarısı', async () => {
    show();
    const table = await screen.findByRole('table');
    expect(screen.getByText('Ayşe · 09:00 itibarıyla')).toBeInTheDocument();
    const row = within(table).getByRole('row', { name: /Ayşe/ });
    expect(within(row).getByText('09:00–16:30')).toBeInTheDocument();
    expect(within(row).getAllByText('7:30')).toHaveLength(2); // hücre + toplam
    expect(within(row).getByLabelText('Konum doğrulanamadı')).toBeInTheDocument();
    expect(rpc.callRpc).toHaveBeenCalledWith('timeclock_week', { p_monday: monday });
  });

  it('mesai düzeltme sebep ve yeni saatle kaydedilir', async () => {
    const user = userEvent.setup();
    show();
    await user.click(await screen.findByRole('button', { name: /09:00–16:30/ }));
    const end = screen.getByLabelText('Çıkış');
    await user.clear(end);
    await user.type(end, `${monday}T17:00`);
    await user.type(screen.getByLabelText('Sebep'), 'geç çıktı');
    await user.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(rpc.callRpc).toHaveBeenCalledWith('timeclock_edit_shift', {
      p_id: 's1',
      p_start: `${monday} 09:00`,
      p_end: `${monday} 17:00`,
      p_reason: 'geç çıktı',
    });
  });

  it('personel: ekleme ve telefon eşleştirme linki', async () => {
    const user = userEvent.setup();
    show('/admin/timeclock?v=people');
    await user.type(await screen.findByLabelText('Ad soyad'), 'Cem');
    await user.click(screen.getByRole('button', { name: 'Personel ekle' }));
    expect(rpc.callRpc).toHaveBeenCalledWith('timeclock_add_staff', { p_name: 'Cem' });

    await user.click(screen.getByRole('button', { name: 'Telefon eşleştir' }));
    expect(await screen.findByText(/\/mesai\/bagla\/c0de$/)).toBeInTheDocument();
    expect(screen.getByText(/2026-11-13 10:00 tarihine kadar geçerli/)).toBeInTheDocument();
  });

  it('QR sekmesi: konum kayıtlı değilse söyler', async () => {
    show('/admin/timeclock?v=qr');
    expect(await screen.findByText(/Restoran konumu kayıtlı değil/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'QR kodu yenile' })).toBeInTheDocument();
  });
});
