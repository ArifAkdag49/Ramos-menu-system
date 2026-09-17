import { describe, expect, it } from 'vitest';
import {
  buildOrdersFilter,
  OrdersFilterError,
  orderQuantity,
  orderTimeline,
  orderTotalCents,
  parseTicketPayload,
} from './ordersQuery';

describe('buildOrdersFilter', () => {
  it('tarih aralığı + durum → beklenen nesne; boş filtreler eklenmez', () =>
    expect(
      buildOrdersFilter({ from: '2026-09-01', to: '2026-09-15', status: 'cancelled' }),
    ).toEqual({
      business_date_gte: '2026-09-01',
      business_date_lte: '2026-09-15',
      status: 'cancelled',
    }));

  it('masa ve garson filtreleri taşınır; boş dize filtre sayılmaz', () => {
    const f = buildOrdersFilter({
      from: '2026-09-15',
      to: '2026-09-15',
      tableId: 't-1',
      waiterId: 'w-1',
      status: '',
    });
    expect(f).toEqual({
      business_date_gte: '2026-09-15',
      business_date_lte: '2026-09-15',
      session_table: 't-1',
      waiter_id: 'w-1',
    });
    expect(Object.keys(f)).not.toContain('status');
  });

  it('to < from → range_invalid', () => {
    expect(() => buildOrdersFilter({ from: '2026-09-15', to: '2026-09-14' })).toThrow(
      OrdersFilterError,
    );
    expect(() => buildOrdersFilter({ from: '2026-09-15', to: '2026-09-14' })).toThrow(
      'range_invalid',
    );
  });

  it('bozuk ya da boş tarih → range_invalid', () => {
    expect(() => buildOrdersFilter({ from: '', to: '2026-09-14' })).toThrow('range_invalid');
    expect(() => buildOrdersFilter({ from: '2026-02-30', to: '2026-03-01' })).toThrow(
      'range_invalid',
    );
  });

  it('31 gün (iki uç dahil) sınırdır', () =>
    expect(buildOrdersFilter({ from: '2026-09-01', to: '2026-10-01' }).business_date_lte).toBe(
      '2026-10-01',
    ));

  it('32 günlük aralık → range_too_long', () =>
    expect(() => buildOrdersFilter({ from: '2026-09-01', to: '2026-10-02' })).toThrow(
      'range_too_long',
    ));

  it('yaz saati geçişini kapsayan aralık gün sayısını kaydırmaz', () =>
    expect(() => buildOrdersFilter({ from: '2026-10-01', to: '2026-10-31' })).not.toThrow());
});

const item = (
  over: Partial<{ quantity: number; unit_price_cents: number; status: 'active' | 'cancelled' }>,
) => ({ quantity: 1, unit_price_cents: 850, status: 'active' as const, ...over });

describe('orderTotalCents / orderQuantity', () => {
  it('iptal edilen kalemler toplama girmez; birim fiyat ekstra ücretleri zaten içerir', () => {
    const items = [
      item({ quantity: 2, unit_price_cents: 950 }), // 8,50 + 1,00 € ekstra peynir
      item({ quantity: 1, unit_price_cents: 300, status: 'cancelled' }),
      item({ quantity: 3, unit_price_cents: 250 }),
    ];
    expect(orderTotalCents(items)).toBe(2 * 950 + 3 * 250);
    expect(orderQuantity(items)).toBe(5);
  });

  it('kalem yoksa sıfır', () => {
    expect(orderTotalCents([])).toBe(0);
    expect(orderQuantity([])).toBe(0);
  });
});

describe('orderTimeline', () => {
  const base = {
    waiter_id: 'w',
    created_at: '2026-09-17T10:00:00Z',
    ready_at: null,
    ready_by: null,
    served_at: null,
    served_by: null,
    cancelled_at: null,
    order_items: [] as {
      product_name: string;
      quantity: number;
      status: 'active' | 'cancelled';
      cancel_reason: string | null;
      cancelled_at: string | null;
      cancelled_by: string | null;
    }[],
  };

  it('yalnız oluşturulmuş sipariş tek olay verir', () =>
    expect(orderTimeline(base)).toEqual([{ kind: 'created', at: base.created_at, actorId: 'w' }]));

  it('hazır, teslim, kalem iptali ve sipariş iptali zamana göre dizilir', () =>
    expect(
      orderTimeline({
        ...base,
        ready_at: '2026-09-17T10:12:00Z',
        ready_by: 'k',
        served_at: '2026-09-17T10:15:00Z',
        served_by: 'w',
        cancelled_at: '2026-09-17T10:03:00Z',
        order_items: [
          {
            product_name: 'Cola 0,33 l',
            quantity: 2,
            status: 'cancelled',
            cancel_reason: 'Gast will nicht mehr',
            cancelled_at: '2026-09-17T10:02:00Z',
            cancelled_by: 'a',
          },
          {
            product_name: 'Ayran',
            quantity: 1,
            status: 'active',
            cancel_reason: null,
            cancelled_at: null,
            cancelled_by: null,
          },
        ],
      }),
    ).toEqual([
      { kind: 'created', at: '2026-09-17T10:00:00Z', actorId: 'w' },
      {
        kind: 'item_cancelled',
        at: '2026-09-17T10:02:00Z',
        actorId: 'a',
        item: '2× Cola 0,33 l',
        reason: 'Gast will nicht mehr',
      },
      { kind: 'cancelled', at: '2026-09-17T10:03:00Z', actorId: null },
      { kind: 'ready', at: '2026-09-17T10:12:00Z', actorId: 'k' },
      { kind: 'served', at: '2026-09-17T10:15:00Z', actorId: 'w' },
    ]));
});

describe('parseTicketPayload', () => {
  const payload = {
    kind: 'order',
    header: "RAMO'S",
    table: 'Tisch 4',
    orderNo: 47,
    createdAt: '2026-09-17T10:00:00Z',
    items: [
      {
        qty: 1,
        code: '05',
        name: 'Drehspieß Sandwich',
        isBeverage: false,
        variant: 'Kalb',
        without: [],
        groups: [],
        note: null,
      },
    ],
  };

  it('geçerli yük aynen döner', () => expect(parseTicketPayload(payload)).toEqual(payload));

  it('biçimi tutmayan yük null — önizleme çökmez', () => {
    expect(parseTicketPayload(null)).toBeNull();
    expect(parseTicketPayload({ ...payload, items: 'yok' })).toBeNull();
    expect(parseTicketPayload({ ...payload, kind: 'fatura' })).toBeNull();
    expect(parseTicketPayload({ ...payload, items: [{ qty: 1 }] })).toBeNull();
  });
});
