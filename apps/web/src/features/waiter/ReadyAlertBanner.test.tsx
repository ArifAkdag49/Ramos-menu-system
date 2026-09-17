import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import '../../i18n';
import type { OrderView } from '../../data/orders';

const h = vi.hoisted(() => ({
  query: { orders: [] as OrderView[], isSuccess: false },
  beep: vi.fn(),
  unlock: vi.fn(),
}));

vi.mock('../../data/orders', () => ({ useReadyOrdersQuery: () => h.query }));
vi.mock('../kitchen/useSoundAlert', () => ({
  useSoundAlert: () => ({ beep: h.beep, unlock: h.unlock }),
}));

import { useAuth } from '../../lib/auth';
import { ReadyAlertBanner } from './ReadyAlertBanner';
import { resetReadyAlerts } from './useReadyAlerts';

const order = (id: string, no: number, table: string): OrderView => ({
  id,
  order_no: no,
  round_no: 1,
  status: 'ready',
  created_at: new Date().toISOString(),
  ready_at: new Date().toISOString(),
  note: null,
  waiter_id: 'w',
  waiter_name: 'Ahmet',
  table_name: table,
  items: [],
  print: null,
});

const vibrate = vi.fn();

function Harness() {
  return (
    <MemoryRouter initialEntries={['/waiter']}>
      <Routes>
        <Route path="/waiter" element={<ReadyAlertBanner />} />
        <Route
          path="/waiter/ready"
          element={
            <>
              <ReadyAlertBanner />
              <p>hazır listesi</p>
            </>
          }
        />
      </Routes>
    </MemoryRouter>
  );
}

const setReady = (orders: OrderView[], isSuccess = true) => {
  h.query = { orders, isSuccess };
};

beforeEach(() => {
  resetReadyAlerts();
  h.beep.mockReset();
  vibrate.mockReset();
  Object.defineProperty(navigator, 'vibrate', { configurable: true, value: vibrate });
  useAuth.setState({
    profile: {
      id: 'w',
      username: 'ahmet',
      display_name: 'Ahmet',
      role: 'waiter',
      locale: 'tr',
      is_active: true,
      on_duty_since: null,
    },
  });
  setReady([], false);
});

describe('<ReadyAlertBanner /> + useReadyAlerts', () => {
  it('ilk yüklemede zaten hazır olanlar için uyarı yok', () => {
    const { rerender } = render(<Harness />);
    setReady([order('a', 45, 'Tisch 3')]);
    rerender(<Harness />);
    expect(screen.queryByText(/hazır$/)).not.toBeInTheDocument();
    expect(h.beep).not.toHaveBeenCalled();
    expect(vibrate).not.toHaveBeenCalled();
  });

  it('sonradan hazır olan siparişte şerit + ses + titreşim; teslim edilince şerit kapanır', () => {
    setReady([]);
    const { rerender } = render(<Harness />);

    setReady([order('b', 47, 'Tisch 12')]);
    rerender(<Harness />);
    expect(screen.getByText('Masa 12 · #047 hazır')).toBeInTheDocument();
    expect(h.beep).toHaveBeenCalledOnce();
    expect(vibrate).toHaveBeenCalledWith([200, 100, 200]);

    // Teslim edildi → hazır listesinden düştü.
    setReady([]);
    rerender(<Harness />);
    expect(screen.queryByText('Masa 12 · #047 hazır')).not.toBeInTheDocument();
  });

  it('birden çok hazırda en yenisi ve kalan sayı gösterilir', () => {
    setReady([]);
    const { rerender } = render(<Harness />);
    setReady([order('b', 47, 'Tisch 12')]);
    rerender(<Harness />);
    setReady([order('b', 47, 'Tisch 12'), order('c', 48, 'Tisch 4')]);
    rerender(<Harness />);
    expect(screen.getByText('Masa 4 · #048 hazır')).toBeInTheDocument();
    expect(screen.getByText('+1 sipariş daha hazır')).toBeInTheDocument();
    expect(h.beep).toHaveBeenCalledTimes(2);
  });

  it('"Göster" hazır listesine götürür ve şeridi kapatır', async () => {
    setReady([]);
    const { rerender } = render(<Harness />);
    setReady([order('b', 47, 'Tisch 12')]);
    rerender(<Harness />);

    await userEvent.click(screen.getByRole('button', { name: 'Göster' }));
    expect(screen.getByText('hazır listesi')).toBeInTheDocument();
    expect(screen.queryByText('Masa 12 · #047 hazır')).not.toBeInTheDocument();
  });

  it('iskelet yeniden monte olunca (sipariş girişinden dönüş) aradaki hazır sipariş yine uyarır', () => {
    setReady([order('a', 45, 'Tisch 3')]);
    const first = render(<Harness />);
    first.unmount();

    setReady([order('a', 45, 'Tisch 3'), order('b', 47, 'Tisch 12')]);
    render(<Harness />);
    expect(screen.getByText('Masa 12 · #047 hazır')).toBeInTheDocument();
  });

  it('Almanca arayüzde "Tisch 12 · #047 fertig"', async () => {
    const { default: i18n } = await import('../../i18n');
    await act(() => i18n.changeLanguage('de'));
    try {
      setReady([]);
      const { rerender } = render(<Harness />);
      setReady([order('b', 47, 'Tisch 12')]);
      rerender(<Harness />);
      expect(screen.getByText('Tisch 12 · #047 fertig')).toBeInTheDocument();
    } finally {
      await act(() => i18n.changeLanguage('tr'));
    }
  });
});
