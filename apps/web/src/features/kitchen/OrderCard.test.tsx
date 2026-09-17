import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrderView } from '../../data/orders';
import i18n from '../../i18n';

// Reviewer I2: geçen süre Görev 13'ün paylaşılan `Elapsed` bileşeniyle gösterilmeli, ikinci bir
// dakika-sayacı yazılmamalı. Bu sahte, `OrderCard`'ın gerçekten bu bileşeni çağırdığını kanıtlar.
vi.mock('../common/Elapsed', () => ({
  Elapsed: ({ since, className }: { since: string; className?: string }) => (
    <span data-testid="elapsed-stub" data-since={since} className={className} />
  ),
}));

import { OrderCard } from './OrderCard';

const baseOrder: OrderView = {
  id: 'order-1',
  order_no: 47,
  round_no: 1,
  status: 'in_kitchen',
  created_at: '2026-09-15T17:50:00Z',
  ready_at: null,
  note: null,
  waiter_id: 'w1',
  waiter_name: 'Ahmet',
  table_name: 'Tisch 12',
  print: null,
  items: [
    {
      id: 'item-1',
      product_id: 'p1',
      quantity: 2,
      product_code: '05',
      product_name: 'Drehspieß Sandwich',
      variant_name_de: 'Kalb',
      variant_name_tr: 'Dana',
      removed_ingredients: [{ id: 'ing-1', name_de: 'Zwiebeln', name_tr: 'Soğan' }],
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
    {
      id: 'item-2',
      product_id: 'p2',
      quantity: 1,
      product_code: null,
      product_name: 'Pizza Mix',
      variant_name_de: null,
      variant_name_tr: null,
      removed_ingredients: [],
      selected_options: [],
      extra_charges: [],
      note: null,
      status: 'cancelled',
      cancel_reason: 'Müşteri vazgeçti',
      sort: 2,
      category_sort: 2,
      is_beverage: false,
      unit_price_cents: 700,
    },
  ],
};

const noop = () => {};

afterEach(() => {
  void i18n.changeLanguage('tr');
});

describe('OrderCard', () => {
  it('masa adı büyük harf ve lang="de" kapsayıcıda görünür', () => {
    void i18n.changeLanguage('de');
    render(<OrderCard order={baseOrder} locale="de" onReady={noop} onUndo={noop} onReprint={noop} />);
    const heading = screen.getByText('TISCH 12');
    expect(heading.closest('[lang="de"]')).not.toBeNull();
  });

  it('OHNE satırı data-tone="danger" taşır', () => {
    void i18n.changeLanguage('de');
    render(<OrderCard order={baseOrder} locale="de" onReady={noop} onUndo={noop} onReprint={noop} />);
    const line = screen.getByText('OHNE: Zwiebeln');
    expect(line).toHaveAttribute('data-tone', 'danger');
  });

  it('iptal edilen kalem üstü çizili görünür ve STORNO rozeti taşır', () => {
    void i18n.changeLanguage('de');
    render(<OrderCard order={baseOrder} locale="de" onReady={noop} onUndo={noop} onReprint={noop} />);
    const cancelledLine = screen.getByText(/Pizza Mix/);
    expect(cancelledLine).toHaveClass('line-through');
    expect(screen.getByText('STORNO')).toBeInTheDocument();
  });

  it('HAZIR butonuna basınca onReady(id) çağrılır', async () => {
    void i18n.changeLanguage('de');
    const onReady = vi.fn();
    render(<OrderCard order={baseOrder} locale="de" onReady={onReady} onUndo={noop} onReprint={noop} />);
    await userEvent.click(screen.getByRole('button', { name: 'FERTIG' }));
    expect(onReady).toHaveBeenCalledWith('order-1');
  });

  it('round_no > 1 iken NACHBESTELLUNG etiketi (de) görünür', () => {
    void i18n.changeLanguage('de');
    render(
      <OrderCard order={{ ...baseOrder, round_no: 2 }} locale="de" onReady={noop} onUndo={noop} onReprint={noop} />,
    );
    expect(screen.getByText('NACHBESTELLUNG')).toBeInTheDocument();
  });

  it('round_no > 1 iken EK SİPARİŞ etiketi (tr) görünür', () => {
    void i18n.changeLanguage('tr');
    render(
      <OrderCard order={{ ...baseOrder, round_no: 2 }} locale="tr" onReady={noop} onUndo={noop} onReprint={noop} />,
    );
    expect(screen.getByText('EK SİPARİŞ')).toBeInTheDocument();
  });

  it('geçen süre ortak Elapsed bileşeniyle gösterilir (ikinci bir kopya yazılmaz)', () => {
    void i18n.changeLanguage('de');
    render(<OrderCard order={baseOrder} locale="de" onReady={noop} onUndo={noop} onReprint={noop} />);
    expect(screen.getByTestId('elapsed-stub')).toHaveAttribute('data-since', baseOrder.created_at);
  });
});

/**
 * M4 tasarım kapısı düzeltmeleri. Ekran görüntüsünde 38 dk bekleyen kart ile 14 dk bekleyen kart
 * neredeyse aynı görünüyordu (Y6) ve kartın ilk satırı iptal edilmiş kaleme gidiyordu (Y8).
 */
describe('OrderCard — M4 tasarım kapısı', () => {
  it('Y6: gecikme KART düzeyinde — geç kalan kart kendi tonunu ve zeminini taşır', () => {
    const late = { ...baseOrder, created_at: new Date(Date.now() - 38 * 60_000).toISOString() };
    const { container } = render(<OrderCard order={late} locale="tr" onReady={noop} onUndo={noop} onReprint={noop} />);
    const li = container.querySelector('li[data-tone]');
    expect(li).toHaveAttribute('data-tone', 'late');
    expect(li?.className).toContain('bg-surface-late');
  });

  it('Y6: 14 dk bekleyen kart `warn`, yeni sipariş `ok` — üç durum farklı görünür', () => {
    const at = (min: number) => ({ ...baseOrder, created_at: new Date(Date.now() - min * 60_000).toISOString() });
    const tone = (order: OrderView) =>
      render(<OrderCard order={order} locale="tr" onReady={noop} onUndo={noop} onReprint={noop} />)
        .container.querySelector('li[data-tone]')
        ?.getAttribute('data-tone');
    expect(tone(at(14))).toBe('warn');
    expect(tone(at(2))).toBe('ok');
  });

  it('Y6: süre 1–2 m`den okunur boyutta (30 px) ve renk tek başına anlam taşımaz', () => {
    const late = { ...baseOrder, created_at: new Date(Date.now() - 38 * 60_000).toISOString() };
    render(<OrderCard order={late} locale="tr" onReady={noop} onUndo={noop} onReprint={noop} />);
    expect(screen.getByTestId('elapsed-stub').className).toContain('text-3xl');
    // Renge ek olarak yazı: "GECİKTİ".
    expect(screen.getByTestId('kds-elapsed')).toHaveTextContent('GECİKTİ');
  });

  it('Y8: iptal edilmiş kalem listenin SONUNDA durur', () => {
    render(<OrderCard order={baseOrder} locale="tr" onReady={noop} onUndo={noop} onReprint={noop} />);
    const names = screen.getAllByText(/Drehspieß Sandwich|Pizza Mix/).map((n) => n.textContent ?? '');
    expect(names[names.length - 1]).toMatch(/Pizza Mix/);
  });

  it('Y2: iptal edilmiş kalemde blok opaklık yok — söndürme `text-muted` ile', () => {
    const { container } = render(
      <OrderCard order={baseOrder} locale="tr" onReady={noop} onUndo={noop} onReprint={noop} />,
    );
    const cancelled = container.querySelector('li[data-cancelled]');
    expect(cancelled).not.toBeNull();
    expect(cancelled?.className ?? '').not.toMatch(/opacity-/);
    expect(screen.getByText(/Pizza Mix/).className).toContain('text-muted');
  });

  it('O2: masa adı `display` rolünde, kalem satırı `kds` rolünde (ham piksel yok)', () => {
    render(<OrderCard order={baseOrder} locale="tr" onReady={noop} onUndo={noop} onReprint={noop} />);
    expect(screen.getByText('TISCH 12').className).toContain('text-display');
    expect(screen.getByText(/Drehspieß Sandwich/).className).toContain('text-kds');
  });

  it('O12: hazır sipariş süreyi `ready_at`ten sayar ve tonu `late` DEĞİL', () => {
    const readyOrder: OrderView = {
      ...baseOrder,
      status: 'ready',
      created_at: new Date(Date.now() - 38 * 60_000).toISOString(),
      ready_at: new Date(Date.now() - 2 * 60_000).toISOString(),
    };
    const { container } = render(
      <OrderCard order={readyOrder} locale="tr" compact onReady={noop} onUndo={noop} onReprint={noop} />,
    );
    expect(screen.getByTestId('elapsed-stub')).toHaveAttribute('data-since', readyOrder.ready_at);
    expect(container.querySelector('li[data-tone]')).toHaveAttribute('data-tone', 'ready');
  });
});
