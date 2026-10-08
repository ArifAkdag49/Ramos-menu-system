import { render, screen } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes, useParams } from 'react-router';
import { describe, expect, it, vi } from 'vitest';

// Ekranların içeriği değil, `/waiter/*` altındaki eşleştirme sınanıyor.
vi.mock('./WaiterLayout', () => ({
  WaiterLayout: () => (
    <div>
      <p>garson düzeni</p>
      <Outlet />
    </div>
  ),
}));
vi.mock('./TablesPage', () => ({ TablesPage: () => <p>masa ızgarası</p> }));
vi.mock('./TableDetailPage', () => ({
  TableDetailPage: () => <p>masa detayı {useParams().tableId}</p>,
}));
vi.mock('./ReadyPage', () => ({ ReadyPage: () => <p>hazır listesi</p> }));
vi.mock('./ProfilePage', () => ({ ProfilePage: () => <p>profil</p> }));
vi.mock('./OrderPage', () => ({ OrderPage: () => <p>sipariş girişi {useParams().tableId}</p> }));
vi.mock('../../app/pages', () => ({ HomeRedirect: () => <p>ana ekrana dönüş</p> }));

import WaiterApp from './WaiterApp';

const renderAt = (path: string) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/waiter/*" element={<WaiterApp />} />
      </Routes>
    </MemoryRouter>,
  );

/**
 * R94 — garson bölümü ayrı parçaya taşındı ve alt rotalar üst düzey tablodan buraya indi. Her
 * sekmenin hâlâ çizildiği ve sipariş girişinin düzenin DIŞINDA kaldığı burada doğrulanır.
 */
describe('<WaiterApp />', () => {
  it('ana yol masa ızgarasını düzenin içinde çizer', () => {
    renderAt('/waiter');
    expect(screen.getByText('garson düzeni')).toBeInTheDocument();
    expect(screen.getByText('masa ızgarası')).toBeInTheDocument();
  });

  it('masa detayı, hazır ve profil sekmeleri düzenin içindedir', () => {
    for (const [path, text] of [
      ['/waiter/table/t1', 'masa detayı t1'],
      ['/waiter/ready', 'hazır listesi'],
      ['/waiter/profile', 'profil'],
    ] as const) {
      const { unmount } = renderAt(path);
      expect(screen.getByText('garson düzeni')).toBeInTheDocument();
      expect(screen.getByText(text)).toBeInTheDocument();
      unmount();
    }
  });

  it('sipariş girişi düzenin DIŞINDA, tam ekran çizilir', () => {
    renderAt('/waiter/table/t1/order');
    // Masa kimliği göreli rotadan hâlâ geçiyor (`useParams().tableId`).
    expect(screen.getByText('sipariş girişi t1')).toBeInTheDocument();
    expect(screen.queryByText('garson düzeni')).not.toBeInTheDocument();
    // Daha belirgin yol kazanır: `table/:tableId` değil `table/:tableId/order` eşleşir.
    expect(screen.queryByText('masa detayı t1')).not.toBeInTheDocument();
  });

  it('bilinmeyen garson adresi rolün ana ekranına döner', () => {
    renderAt('/waiter/olmayan-sayfa');
    expect(screen.getByText('ana ekrana dönüş')).toBeInTheDocument();
  });
});
