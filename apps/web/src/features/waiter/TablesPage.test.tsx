import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';

const rows = [
  {
    table_id: 't-free',
    name: 'Tisch 1',
    sort: 1,
    session_id: null,
    opened_at: null,
    opened_by_name: null,
    orders_in_kitchen: 0,
    orders_ready: 0,
    failed_prints: 0,
    total_cents: 0,
  },
  {
    table_id: 't-open',
    name: 'Tisch 2',
    sort: 2,
    session_id: 's1',
    opened_at: new Date().toISOString(),
    opened_by_name: 'Ahmet',
    orders_in_kitchen: 1,
    orders_ready: 0,
    failed_prints: 0,
    total_cents: 1950,
  },
  {
    table_id: 't-ready',
    name: 'Tisch 3',
    sort: 3,
    session_id: 's2',
    opened_at: new Date().toISOString(),
    opened_by_name: 'Ahmet',
    orders_in_kitchen: 0,
    orders_ready: 1,
    failed_prints: 0,
    total_cents: 2500,
  },
];

vi.mock('../../data/tables', () => ({ useTableOverview: () => rows }));

import { TablesPage } from './TablesPage';

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={['/waiter']}>
      <Routes>
        <Route path="/waiter" element={<TablesPage />} />
        <Route path="/waiter/table/:tableId" element={<p>masa detayı</p>} />
      </Routes>
    </MemoryRouter>,
  );

describe('TablesPage', () => {
  it('kartlar data-tone ile free/open/ready olarak işaretlenir', () => {
    renderPage();
    expect(screen.getByText('Masa 1').closest('[data-tone]')).toHaveAttribute('data-tone', 'free');
    expect(screen.getByText('Masa 2').closest('[data-tone]')).toHaveAttribute('data-tone', 'open');
    expect(screen.getByText('Masa 3').closest('[data-tone]')).toHaveAttribute('data-tone', 'ready');
  });

  it('açık kartta tutar ve masayı açan kişi görünür', () => {
    renderPage();
    const card = screen.getByText('Masa 2').closest('[data-tone]') as HTMLElement;
    expect(within(card).getByText('19,50 €')).toBeInTheDocument();
    expect(within(card).getByText('Ahmet')).toBeInTheDocument();
  });

  it('hazır kartta "Hazır" rozeti görünür', () => {
    renderPage();
    const card = screen.getByText('Masa 3').closest('[data-tone]') as HTMLElement;
    expect(within(card).getByText('Hazır')).toBeInTheDocument();
  });

  it('karta tıklayınca masa detayına gider', async () => {
    renderPage();
    await userEvent.click(screen.getByText('Masa 1'));
    expect(await screen.findByText('masa detayı')).toBeInTheDocument();
  });
});

/**
 * O1 (M3 tasarım kapısı): ızgara sunucu sırasında geliyordu — 12 boş masa önde, açık ve hazır
 * masalar katlamanın altında (`m3-tables-390.png`). Varsayılan görünüm garsonun kendi masalarını
 * göstermiyordu. Sıra: hazır → açık → boş.
 */
describe('TablesPage sırası (O1)', () => {
  it('hazır masa önce, boş masa en sonda çizilir', () => {
    renderPage();
    const names = [...document.querySelectorAll('[data-tone]')].map((el) => el.textContent ?? '');
    expect(names[0]).toContain('Masa 3');
    expect(names[1]).toContain('Masa 2');
    expect(names[2]).toContain('Masa 1');
  });

  it('süzgeç açıkken de aynı sıra geçerlidir', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Tümü' }));
    const tones = [...document.querySelectorAll('[data-tone]')].map((el) => el.getAttribute('data-tone'));
    expect(tones).toEqual(['ready', 'open', 'free']);
  });
});

/**
 * O6 (M3/M4 tasarım kapısı): "Hazır" rozeti `animate-pulse` ile öğenin OPAKLIĞINI gezdiriyordu;
 * düşük noktada altın metin kendi tintiyle birlikte sönüp kontrastı 2,4:1'e indiriyordu (axe bu
 * düğümde `color-contrast` raporladı). `pulse-ring` yalnız dış halkayı hareket ettirir.
 */
describe('TablesPage — "Hazır" nabzı (O6)', () => {
  it('rozet opaklık yerine halka nabzı kullanır', () => {
    renderPage();
    const card = screen.getByText('Masa 3').closest('[data-tone]') as HTMLElement;
    const badge = within(card).getByText('Hazır');
    expect(badge.className).toContain('pulse-ring');
    expect(badge.className).not.toContain('animate-pulse');
  });
});
