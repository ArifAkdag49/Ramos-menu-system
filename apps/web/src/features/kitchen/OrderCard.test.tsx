import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OrderView } from '../../data/orders';
import i18n from '../../i18n';
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
});
