import { describe, expect, it } from 'vitest';
import { mapOrders, type OrderRow } from './orderMapper';

const row: OrderRow = {
  id: 'o1',
  order_no: 47,
  round_no: 1,
  status: 'in_kitchen',
  created_at: '2026-09-15T18:00:00Z',
  ready_at: null,
  note: null,
  waiter_id: 'w1',
  table_sessions: { id: 's1', dining_tables: { name: 'Tisch 3' } },
  order_items: [
    {
      id: 'i1', product_id: 'p1', quantity: 1, product_code: '08', product_name: 'Drehspieß',
      variant_name_de: 'Kalb', variant_name_tr: 'Dana', removed_ingredients: [], selected_options: [],
      note: null, status: 'active', cancel_reason: null, sort: 2, category_sort: 1, is_beverage: false,
      unit_price_cents: 1350,
    },
    {
      id: 'i2', product_id: 'p2', quantity: 1, product_code: '30', product_name: 'Ayran',
      variant_name_de: null, variant_name_tr: null, removed_ingredients: [], selected_options: [],
      note: null, status: 'active', cancel_reason: null, sort: 1, category_sort: 1, is_beverage: true,
      unit_price_cents: 250,
    },
    {
      id: 'i3', product_id: 'p1', quantity: 1, product_code: '08', product_name: 'Drehspieß',
      variant_name_de: 'Kalb', variant_name_tr: 'Dana', removed_ingredients: [], selected_options: [],
      note: null, status: 'cancelled', cancel_reason: 'Yanlış sipariş', sort: 1, category_sort: 1, is_beverage: false,
      unit_price_cents: 1350,
    },
  ],
  print_jobs: [
    { id: 'j1', type: 'order', status: 'printed', last_error: null, created_at: '2026-09-15T18:00:01Z' },
    { id: 'j2', type: 'addition', status: 'failed', last_error: 'offline', created_at: '2026-09-15T18:05:00Z' },
    { id: 'j3', type: 'test', status: 'printed', last_error: null, created_at: '2026-09-15T18:10:00Z' },
  ],
};

describe('mapOrders', () => {
  it('masa adını table_sessions üzerinden, garson adını staffNames haritasından alır', () => {
    const [o] = mapOrders([row], new Map([['w1', 'Ahmet']]));
    expect(o!.table_name).toBe('Tisch 3');
    expect(o!.waiter_name).toBe('Ahmet');
  });

  it('garson haritada yoksa boş ada düşer', () => {
    const [o] = mapOrders([row], new Map());
    expect(o!.waiter_name).toBe('');
  });

  it('kalemleri is_beverage, category_sort, sort sırasına göre dizer; iptal edilenleri korur', () => {
    const [o] = mapOrders([row], new Map());
    expect(o!.items.map((i) => i.id)).toEqual(['i3', 'i1', 'i2']);
    expect(o!.items.map((i) => i.status)).toEqual(['cancelled', 'active', 'active']);
  });

  it('yazdırma durumunu order/addition/reprint işleri arasından en yeni created_at olanı seçer (test işini yok sayar)', () => {
    const [o] = mapOrders([row], new Map());
    expect(o!.print).toEqual({ status: 'failed', last_error: 'offline', job_id: 'j2' });
  });

  it('hiç uygun iş yoksa print null döner', () => {
    const [o] = mapOrders([{ ...row, print_jobs: [row.print_jobs[2]!] }], new Map());
    expect(o!.print).toBeNull();
  });
});
