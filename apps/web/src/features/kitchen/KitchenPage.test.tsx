import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '../../i18n';
import { RpcError } from '../../lib/rpc';

const order = {
  id: 'order-1',
  order_no: 47,
  round_no: 1,
  status: 'in_kitchen' as const,
  created_at: new Date().toISOString(),
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
      quantity: 1,
      product_code: '05',
      product_name: 'Drehspieß Sandwich',
      variant_name_de: null,
      variant_name_tr: null,
      removed_ingredients: [],
      selected_options: [],
      note: null,
      status: 'active' as const,
      cancel_reason: null,
      sort: 1,
      category_sort: 1,
      is_beverage: false,
      unit_price_cents: 850,
    },
  ],
};

const { markReadyMutate, useBroadcastInvalidationSpy } = vi.hoisted(() => ({
  markReadyMutate: vi.fn(),
  useBroadcastInvalidationSpy: vi.fn(() => 'connected' as const),
}));

vi.mock('../../data/orders', () => ({
  useKitchenOrders: () => [order],
  useMarkReady: () => ({ mutate: markReadyMutate }),
  useUndoReady: () => ({ mutate: vi.fn() }),
  useRetryJob: () => ({ mutate: vi.fn() }),
  useReprint: () => ({ mutate: vi.fn() }),
  useSetSoldOut: () => ({ mutate: vi.fn() }),
}));
vi.mock('../../data/menu', () => ({
  useMenu: () => ({ categories: [], products: [], byId: new Map() }),
}));
vi.mock('../../data/printer', () => ({
  usePrinterStatus: () => ({ status: undefined, problem: null }),
}));
vi.mock('../../lib/online', () => ({ useOnline: () => true }));
// Yazıcı istasyonu şeridi tarayıcıda da ayarı okur (yol istasyonsa uyarı çizer); burada ayar yok.
vi.mock('../../data/settings', () => ({ useSettings: () => undefined }));
vi.mock('../../lib/realtime', () => ({ useBroadcastInvalidation: useBroadcastInvalidationSpy }));

import { KitchenPage } from './KitchenPage';

describe('KitchenPage', () => {
  it('IMPORTANT 1: sayfa boyunca yalnız TEK bir realtime abonelik seti açılır', () => {
    render(<KitchenPage />);
    // `ConnectionBanners` zaten `useBroadcastInvalidation`'ı çağırıyor; sayfa ikinci bir kez
    // çağırırsa mutfak tableti vardiya boyunca 8 kanal açık tutar (4 yerine) — reviewer I1.
    expect(useBroadcastInvalidationSpy).toHaveBeenCalledTimes(1);
  });

  it('IMPORTANT 3: HAZIR başarısız olursa hata mesajı garsona/mutfağa gösterilir', async () => {
    markReadyMutate.mockImplementation((_id: string, opts?: { onError?: (e: unknown) => void }) =>
      opts?.onError?.(new RpcError('order_not_in_kitchen')),
    );
    render(<KitchenPage />);
    await userEvent.click(screen.getByRole('button', { name: 'HAZIR' }));
    expect(await screen.findByRole('status')).toHaveTextContent(/mutfakta değil/i);
  });

  it('art arda gelen iki hatada ikinci mesaj, birincinin zamanlayıcısıyla erken silinmez', () => {
    // Yeniden incelemenin minor bulgusu: `setTimeout` kimliği tutulmuyordu; birinci hatanın
    // 4 sn'lik zamanlayıcısı, 3. saniyede gösterilen İKİNCİ mesajı 1 sn sonra siliyordu.
    // Mutfakta bu, HAZIR'ın neden çalışmadığını gösteren mesajın kaçırılması demek.
    vi.useFakeTimers();
    try {
      markReadyMutate.mockImplementation((_id: string, opts?: { onError?: (e: unknown) => void }) =>
        opts?.onError?.(new RpcError('order_not_in_kitchen')),
      );
      render(<KitchenPage />);
      const button = screen.getByRole('button', { name: 'HAZIR' });
      act(() => void fireEvent.click(button));
      act(() => vi.advanceTimersByTime(3_000));
      act(() => void fireEvent.click(button));
      act(() => vi.advanceTimersByTime(1_500)); // birinci zamanlayıcının 4 sn'si doldu
      expect(screen.getByRole('status')).toHaveTextContent(/mutfakta değil/i);
    } finally {
      vi.useRealTimers();
    }
  });
});

/** M4 tasarım kapısı O15 / O14 — iki sütun simetrik başlıklı, kartlar satıra gerilmez. */
describe('KitchenPage — sütun başlıkları ve ızgara', () => {
  it('O15: aktif sütunun başlığı görünür (kitchen.columns.active artık kullanılıyor)', () => {
    render(<KitchenPage />);
    expect(screen.getByRole('heading', { name: 'Mutfakta' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Hazır' })).toBeInTheDocument();
  });

  it('O14: kart ızgarası `items-start` — kısa kart uzun kartın boyuna gerilmez', () => {
    const { container } = render(<KitchenPage />);
    const grid = container.querySelector('ul.grid');
    expect(grid?.className).toContain('items-start');
  });
});
