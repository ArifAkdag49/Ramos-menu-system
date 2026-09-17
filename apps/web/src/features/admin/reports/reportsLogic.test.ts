import { describe, expect, it, vi } from 'vitest';
import { dateRangeError } from '../dashboardLogic';
import {
  activePreset,
  hourAxis,
  hourRows,
  isTestWaiter,
  presetRange,
  RANGE_PRESETS,
  readAllPages,
} from './reportsLogic';

describe('presetRange (iş günü, iki uç dahil)', () => {
  const today = '2026-09-17';

  it('bugün', () => expect(presetRange('today', today)).toEqual({ from: today, to: today }));
  it('dün', () =>
    expect(presetRange('yesterday', today)).toEqual({ from: '2026-09-16', to: '2026-09-16' }));
  it('son 7 gün bugünü de sayar', () =>
    expect(presetRange('last7', today)).toEqual({ from: '2026-09-11', to: today }));
  it('bu ay: ayın 1’inden bugüne', () =>
    expect(presetRange('thisMonth', today)).toEqual({ from: '2026-09-01', to: today }));

  it('ay başında "dün" önceki aya, "son 7 gün" ay sınırını geçer', () => {
    expect(presetRange('yesterday', '2026-03-01')).toEqual({
      from: '2026-02-28',
      to: '2026-02-28',
    });
    expect(presetRange('last7', '2026-03-02')).toEqual({ from: '2026-02-24', to: '2026-03-02' });
    expect(presetRange('thisMonth', '2026-03-01')).toEqual({
      from: '2026-03-01',
      to: '2026-03-01',
    });
  });

  it('hiçbir hazır aralık 31 gün sınırını aşmaz', () => {
    for (const day of ['2026-01-31', '2026-02-28', '2026-12-31', '2028-02-29'])
      for (const p of RANGE_PRESETS) {
        const r = presetRange(p, day);
        expect(dateRangeError(r.from, r.to)).toBeNull();
      }
  });
});

describe('activePreset', () => {
  const today = '2026-09-17';
  it('aralık bir hazır seçeneğe eşitse onu verir', () => {
    expect(activePreset('2026-09-17', '2026-09-17', today)).toBe('today');
    expect(activePreset('2026-09-11', '2026-09-17', today)).toBe('last7');
    expect(activePreset('2026-09-01', '2026-09-17', today)).toBe('thisMonth');
  });
  it('özel aralık → null', () =>
    expect(activePreset('2026-09-02', '2026-09-17', today)).toBeNull());
  // Ayın 1'inde "Bugün" ile "Bu ay" aynı aralıktır; seçili görünen daha dar olanıdır.
  it('çakışmada ilk (daha dar) seçenek kazanır', () =>
    expect(activePreset('2026-09-01', '2026-09-01', '2026-09-01')).toBe('today'));
});

describe('hourRows (saatlik dağılım, iş günü sırası)', () => {
  it('boş rapor → boş liste', () => expect(hourRows([], 300)).toEqual([]));

  it('ilk ve son dolu saat arası boşluklar 0 ile doldurulur', () =>
    expect(
      hourRows(
        [
          { hour: 12, orders: 3 },
          { hour: 15, orders: 1 },
        ],
        300,
      ),
    ).toEqual([
      { hour: 12, orders: 3 },
      { hour: 13, orders: 0 },
      { hour: 14, orders: 0 },
      { hour: 15, orders: 1 },
    ]));

  it('gece yarısını geçen saatler iş günü sonuna dizilir (05:00 başlangıç)', () =>
    expect(
      hourRows(
        [
          { hour: 1, orders: 2 },
          { hour: 23, orders: 4 },
          { hour: 22, orders: 1 },
        ],
        300,
      ),
    ).toEqual([
      { hour: 22, orders: 1 },
      { hour: 23, orders: 4 },
      { hour: 0, orders: 0 },
      { hour: 1, orders: 2 },
    ]));

  it('başlangıç saatin ortasındaysa (05:30) o saat günün ilk saatidir', () =>
    expect(
      hourRows(
        [
          { hour: 4, orders: 1 },
          { hour: 5, orders: 1 },
        ],
        330,
      ).map((r) => r.hour),
    ).toEqual([
      5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23, 0, 1, 2, 3, 4,
    ]));

  it('aynı saat iki kez gelirse toplanır, geçersiz saat atılır', () =>
    expect(
      hourRows(
        [
          { hour: 18, orders: 1 },
          { hour: 18, orders: 2 },
          { hour: 24, orders: 9 },
        ],
        300,
      ),
    ).toEqual([{ hour: 18, orders: 3 }]));
});

describe('hourAxis (yuvarlak eksen işaretleri)', () => {
  it.each([
    [1, 1, [0, 1]],
    [3, 3, [0, 1, 2, 3]],
    [7, 8, [0, 2, 4, 6, 8]],
    [12, 15, [0, 5, 10, 15]],
    [40, 40, [0, 10, 20, 30, 40]],
    [133, 150, [0, 50, 100, 150]],
  ])('en çok %i → eksen %i', (max, axisMax, ticks) =>
    expect(hourAxis(max)).toEqual({ max: axisMax, ticks }),
  );

  it('hiç sipariş yoksa eksen 0–1 (sıfıra bölme yok)', () =>
    expect(hourAxis(0)).toEqual({ max: 1, ticks: [0, 1] }));
});

describe('isTestWaiter', () => {
  const staff = [
    { username: 'ayse', display_name: 'Ayşe' },
    { username: 'test-e2e-garson', display_name: 'E2E Garson' },
    { username: 'demo-garson', display_name: 'Demo' },
  ];
  it('rapordaki ad test/demo hesabına aitse true', () => {
    expect(isTestWaiter('E2E Garson', staff)).toBe(true);
    expect(isTestWaiter('Demo', staff)).toBe(true);
  });
  it('gerçek personel ve bilinmeyen ad false', () => {
    expect(isTestWaiter('Ayşe', staff)).toBe(false);
    expect(isTestWaiter('Kimse', staff)).toBe(false);
  });
});

describe('readAllPages (1000’lik parçalar)', () => {
  const rows = (n: number, start = 0) => Array.from({ length: n }, (_, i) => start + i);

  it('eksik sayfa gelince durur ve sırayı korur', async () => {
    const fetchPage = vi.fn(async (from: number, to: number) =>
      from === 0
        ? rows(1000)
        : from === 1000
          ? rows(1000, 1000)
          : rows(3, 2000).slice(0, to - from + 1),
    );
    const all = await readAllPages(fetchPage, 1000);
    expect(all).toHaveLength(2003);
    expect(all[1500]).toBe(1500);
    expect(fetchPage.mock.calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('tam sayfanın ardından boş sayfa gelirse biter', async () => {
    const fetchPage = vi.fn(async (from: number) => (from === 0 ? rows(2) : []));
    expect(await readAllPages(fetchPage, 2)).toEqual([0, 1]);
    expect(fetchPage).toHaveBeenCalledTimes(2);
  });

  it('hata yayılır (yarım dosya indirilmez)', async () => {
    const fetchPage = vi.fn(async (from: number) => {
      if (from > 0) throw new Error('network');
      return rows(2);
    });
    await expect(readAllPages(fetchPage, 2)).rejects.toThrow('network');
  });
});
