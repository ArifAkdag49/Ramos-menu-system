import { describe, expect, it, vi } from 'vitest';
import { RpcError } from '../../lib/rpc';
import { submitWithRetry } from './submitOrder';

const ok = { order_id: 'o', order_no: 47, round_no: 1, session_id: 's', total_cents: 950, duplicate: false };

describe('submitWithRetry', () => {
  it('ağ hatasında aynı id ile tekrar dener', async () => {
    const send = vi.fn().mockRejectedValueOnce(new RpcError('network')).mockResolvedValueOnce(ok);
    await expect(submitWithRetry(send, 'id-1', { delays: [0, 0, 0] })).resolves.toEqual(ok);
    expect(send).toHaveBeenNthCalledWith(1, 'id-1');
    expect(send).toHaveBeenNthCalledWith(2, 'id-1');
  });
  it('iş kuralı hatasında tekrar denemez', async () => {
    const send = vi.fn().mockRejectedValue(new RpcError('product_sold_out', 'p1'));
    await expect(submitWithRetry(send, 'id-2', { delays: [0, 0, 0] })).rejects.toMatchObject({ key: 'product_sold_out' });
    expect(send).toHaveBeenCalledTimes(1);
  });
  it('3 ağ hatasından sonra vazgeçer', async () => {
    const send = vi.fn().mockRejectedValue(new RpcError('network'));
    await expect(submitWithRetry(send, 'id-3', { delays: [0, 0, 0] })).rejects.toMatchObject({ key: 'network' });
    expect(send).toHaveBeenCalledTimes(3);
  });

  /**
   * Bekleme yalnız **denemeler arasındadır**: son denemeden sonra da uyusaydı garson hatayı
   * gereksiz yere 4 sn geç görürdü. Üç test de `delays: [0,0,0]` kullandığı için bu davranış
   * ölçülmüyordu; burada gerçek gecikmelerle ve sahte zamanlayıcıyla sabitlenir.
   */
  it('son denemeden sonra beklemez — arada iki kez bekler', async () => {
    vi.useFakeTimers();
    try {
      const send = vi.fn().mockRejectedValue(new RpcError('network'));
      const settled = submitWithRetry(send, 'id-4', { delays: [1000, 2000, 4000] }).catch((e: unknown) => e);

      await vi.advanceTimersByTimeAsync(1000);
      expect(send).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(2000);
      expect(send).toHaveBeenCalledTimes(3);

      // Üçüncü hatadan sonra hiçbir zamanlayıcı kurulmaz ve sonuç hemen elde olur.
      expect(vi.getTimerCount()).toBe(0);
      await expect(settled).resolves.toMatchObject({ key: 'network' });
    } finally {
      vi.useRealTimers();
    }
  });
});
