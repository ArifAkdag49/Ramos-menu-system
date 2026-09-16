import { describe, expect, it } from 'vitest';
import {
  canUndo,
  cardElapsed,
  elapsedTone,
  itemLines,
  kitchenColumns,
  newOrderIds,
  soldOutCount,
  visibleItems,
} from './kitchenLogic';

const now = new Date('2026-09-15T18:00:00Z');
const o = (id: string, status: string, created: string, ready_at: string | null = null) =>
  ({ id, status, created_at: created, ready_at, items: [] }) as never;

describe('kitchenLogic', () => {
  it('sütunlar: mutfaktakiler eskiden yeniye, hazırlar son 30 dk ve yeniden eskiye', () => {
    const c = kitchenColumns(
      [
        o('b', 'in_kitchen', '2026-09-15T17:50:00Z'),
        o('a', 'in_kitchen', '2026-09-15T17:40:00Z'),
        o('r1', 'ready', '2026-09-15T17:20:00Z', '2026-09-15T17:45:00Z'),
        o('r2', 'ready', '2026-09-15T17:10:00Z', '2026-09-15T17:20:00Z'), // 40 dk önce hazır → gizli
        o('r3', 'ready', '2026-09-15T17:30:00Z', '2026-09-15T17:55:00Z'),
      ],
      now,
    );
    expect(c.active.map((x: { id: string }) => x.id)).toEqual(['a', 'b']);
    expect(c.ready.map((x: { id: string }) => x.id)).toEqual(['r3', 'r1']);
  });
  it('süre tonu 10 / 20 dk eşiklerinde değişir', () => {
    expect(elapsedTone('2026-09-15T17:50:01Z', now)).toBe('ok');
    expect(elapsedTone('2026-09-15T17:49:00Z', now)).toBe('warn');
    expect(elapsedTone('2026-09-15T17:39:59Z', now)).toBe('late');
  });
  it('geri alma yalnız 30 sn içinde', () => {
    expect(canUndo({ status: 'ready', ready_at: '2026-09-15T17:59:31Z' } as never, now)).toBe(true);
    expect(canUndo({ status: 'ready', ready_at: '2026-09-15T17:59:29Z' } as never, now)).toBe(false);
  });
  it('yeni sipariş kimliklerini bulur (ses için)', () => {
    expect(newOrderIds(new Set(['a']), [o('a', 'in_kitchen', ''), o('b', 'in_kitchen', '')])).toEqual(['b']);
  });
  it('kalem satırları kullanıcının dilinde', () => {
    const item = {
      variant_name_de: 'Kalb',
      variant_name_tr: 'Dana',
      note: 'Soße extra',
      removed_ingredients: [{ id: 'z', name_de: 'Zwiebeln', name_tr: 'Soğan' }],
      selected_options: [
        {
          group_id: 's',
          group_name_de: 'Soße',
          group_name_tr: 'Sos',
          ticket_format: 'label_values',
          group_sort: 1,
          option_id: 'a',
          name_de: 'Knoblauch',
          name_tr: 'Sarımsaklı',
          price_delta_cents: 0,
        },
        {
          group_id: 'e',
          group_name_de: 'Extras',
          group_name_tr: 'Ekstralar',
          ticket_format: 'plus_each',
          group_sort: 2,
          option_id: 'w',
          name_de: 'Extra Weichkäse',
          name_tr: 'Ekstra beyaz peynir',
          price_delta_cents: 100,
        },
      ],
    } as never;
    expect(itemLines(item, 'de')).toEqual({
      variant: 'Kalb',
      without: 'OHNE: Zwiebeln',
      options: ['Soße: Knoblauch', '+ Extra Weichkäse'],
      note: 'Soße extra',
    });
    expect(itemLines(item, 'tr')).toEqual({
      variant: 'Dana',
      without: 'ÇIKAR: Soğan',
      options: ['Sos: Sarımsaklı', '+ Ekstra beyaz peynir'],
      note: 'Soße extra',
    });
  });
});

/** Y8 — kartın ilk satırı yapılacak işe ayrılır; iptal edilmiş kalem en sona iner. */
describe('visibleItems — iptal edilmiş kalemler listenin SONUNDA', () => {
  const item = (id: string, status: string) => ({ id, status }) as never;

  it('iptal edilmiş kalem, aktiflerin arkasına geçer', () => {
    const out = visibleItems([
      item('c1', 'cancelled'),
      item('a1', 'active'),
      item('c2', 'cancelled'),
      item('a2', 'active'),
    ]);
    expect(out.map((i: { id: string }) => i.id)).toEqual(['a1', 'a2', 'c1', 'c2']);
  });

  it('kendi grubunun içinde sunucu sırası korunur (kararlı sıralama)', () => {
    const out = visibleItems([item('a1', 'active'), item('a2', 'active'), item('a3', 'active')]);
    expect(out.map((i: { id: string }) => i.id)).toEqual(['a1', 'a2', 'a3']);
  });

  it('girdiyi yerinde değiştirmez', () => {
    const input = [item('c1', 'cancelled'), item('a1', 'active')];
    visibleItems(input);
    expect(input.map((i: { id: string }) => i.id)).toEqual(['c1', 'a1']);
  });
});

/** O12 — hazır sipariş için anlamlı sayaç "kaç dakikadır tezgâhta", ve ton asla `late` değil. */
describe('cardElapsed — hangi zamandan sayılır, hangi tonda', () => {
  it('mutfaktaki sipariş: created_at, tonu süre eşiklerinden', () => {
    expect(cardElapsed({ status: 'in_kitchen', created_at: '2026-09-15T17:20:00Z', ready_at: null } as never, now)).toEqual(
      { since: '2026-09-15T17:20:00Z', tone: 'late' },
    );
    expect(cardElapsed({ status: 'in_kitchen', created_at: '2026-09-15T17:55:00Z', ready_at: null } as never, now)).toEqual(
      { since: '2026-09-15T17:55:00Z', tone: 'ok' },
    );
  });

  it('hazır sipariş: ready_at, 38 dk önce verilmiş olsa bile ton `late` DEĞİL', () => {
    expect(
      cardElapsed(
        { status: 'ready', created_at: '2026-09-15T17:22:00Z', ready_at: '2026-09-15T17:58:00Z' } as never,
        now,
      ),
    ).toEqual({ since: '2026-09-15T17:58:00Z', tone: 'ready' });
  });

  it('ready_at yoksa created_at`e düşer (veri eksikse sayaç kaybolmaz)', () => {
    expect(cardElapsed({ status: 'ready', created_at: '2026-09-15T17:55:00Z', ready_at: null } as never, now)).toEqual({
      since: '2026-09-15T17:55:00Z',
      tone: 'ok',
    });
  });
});

/** O10 — "Tükendi" düğmesindeki sayaç. */
describe('soldOutCount', () => {
  it('yalnız tükendi işaretli ürünleri sayar', () => {
    expect(soldOutCount([{ is_sold_out: true }, { is_sold_out: false }, { is_sold_out: true }])).toBe(2);
  });
  it('boş menüde 0', () => expect(soldOutCount([])).toBe(0));
});
