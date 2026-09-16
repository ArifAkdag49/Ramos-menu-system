import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import type { ReactNode } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ callRpc: vi.fn() }));

vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: vi.fn(), order: vi.fn() }) }) }),
    auth: { onAuthStateChange: vi.fn(), getSession: vi.fn() },
    rpc: vi.fn(),
  },
}));
vi.mock('../i18n', () => ({ setLanguage: vi.fn() }));
vi.mock('../lib/rpc', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../lib/rpc')>()),
  callRpc: h.callRpc,
}));

import { useCart } from '../features/waiter/cartStore';
import { useSubmitOrder } from './orders';

const doener = {
  productId: 'p05', variantId: 'k', optionIds: ['kn'], removedIngredientIds: [], quantity: 2, note: '',
};
const cola = {
  productId: 'p-cola', variantId: null, optionIds: [], removedIngredientIds: [], quantity: 1, note: '',
};
const ok = { order_id: 'o', order_no: 47, round_no: 1, session_id: 's', total_cents: 1900, duplicate: false };

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.callRpc.mockReset();
  useCart.setState({ carts: {}, notes: {}, pendingOrderId: {} });
});

describe('useSubmitOrder', () => {
  it('aynı order_id ile gönderir ve başarıda gönderilen satırları düşürür', async () => {
    useCart.getState().add('t1', doener);
    const expectedId = useCart.getState().ensurePendingId('t1');
    h.callRpc.mockResolvedValue(ok);

    const { result } = renderHook(() => useSubmitOrder('t1'), { wrapper });
    await act(async () => {
      await result.current.send();
    });

    expect(h.callRpc).toHaveBeenCalledWith('submit_order', expect.objectContaining({ p_order_id: expectedId, p_table_id: 't1' }));
    expect(useCart.getState().carts.t1).toBeUndefined();
  });

  /**
   * R74(b): ağ yeniden denemesinde gönderim saniyelerce uçabiliyor. O sırada sepete giren kalem
   * hiç gönderilmemiştir; geç gelen başarı sepetin tamamını silerse kalem sessizce kaybolur ve
   * garson ancak yemek gelmeyince fark eder.
   */
  it('R74: gönderim uçarken eklenen kalem başarıdan sonra sepette kalır', async () => {
    useCart.getState().add('t1', doener);
    let finish: (v: unknown) => void = () => {};
    h.callRpc.mockImplementation(() => new Promise((resolve) => (finish = resolve)));

    const { result } = renderHook(() => useSubmitOrder('t1'), { wrapper });
    let sending!: Promise<unknown>;
    // `mutateAsync` mutasyon gövdesini bir mikro görevde çalıştırır: `callRpc` gerçekten
    // çağrılana kadar beklenir, yoksa aşağıdaki `finish` henüz bağlanmamış olur.
    await act(async () => {
      sending = result.current.send();
    });
    expect(h.callRpc).toHaveBeenCalledTimes(1);

    act(() => {
      useCart.getState().add('t1', cola);
    });

    await act(async () => {
      finish(ok);
      await sending;
    });

    expect(useCart.getState().carts.t1).toHaveLength(1);
    expect(useCart.getState().carts.t1![0]!.productId).toBe('p-cola');
  });
});
