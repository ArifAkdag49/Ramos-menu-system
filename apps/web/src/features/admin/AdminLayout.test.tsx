import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';

vi.mock('../common/ConnectionBanners', () => ({ ConnectionBanners: () => null }));

import { AdminLayout } from './AdminLayout';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/admin" element={<AdminLayout />}>
          <Route index element={<p>canlı durum içeriği</p>} />
          <Route path="reports" element={<p>rapor içeriği</p>} />
        </Route>
      </Routes>
    </MemoryRouter>,
  );

describe('<AdminLayout />', () => {
  it('bölümleri ve iki ekran kısayolunu listeler', () => {
    renderAt('/admin');
    const nav = screen.getByRole('navigation', { name: 'Yönetim' });
    for (const label of ['Canlı durum', 'Menü', 'Personel', 'Masalar', 'Siparişler', 'Raporlar', 'Ayarlar'])
      expect(within(nav).getByRole('link', { name: label })).toBeInTheDocument();
    expect(within(nav).getByRole('link', { name: 'Garson ekranı' })).toHaveAttribute('href', '/waiter');
    expect(within(nav).getByRole('link', { name: 'Mutfak ekranı' })).toHaveAttribute('href', '/kitchen');
  });

  it('bulunulan bölüm aria-current ile işaretlenir', () => {
    renderAt('/admin/reports');
    const nav = screen.getByRole('navigation', { name: 'Yönetim' });
    expect(within(nav).getByRole('link', { name: 'Raporlar' })).toHaveAttribute('aria-current', 'page');
    expect(within(nav).getByRole('link', { name: 'Canlı durum' })).not.toHaveAttribute('aria-current');
  });

  it('içerik alanı Outlet ile çizilir', () => {
    renderAt('/admin');
    expect(screen.getByText('canlı durum içeriği')).toBeInTheDocument();
  });

  it('mobil çekmece açılır, odak kapanı kurar ve Esc ile kapanır', async () => {
    renderAt('/admin');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }));
    const drawer = screen.getByRole('dialog', { name: 'Yönetim' });
    expect(drawer).toHaveAttribute('aria-modal', 'true');
    expect(within(drawer).getByRole('link', { name: 'Raporlar' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('çekmecedeki bir bağlantıya gidince çekmece kapanır', async () => {
    renderAt('/admin');
    await userEvent.click(screen.getByRole('button', { name: 'Menüyü aç' }));
    const drawer = screen.getByRole('dialog', { name: 'Yönetim' });
    await userEvent.click(within(drawer).getByRole('link', { name: 'Raporlar' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByText('rapor içeriği')).toBeInTheDocument();
  });
});
