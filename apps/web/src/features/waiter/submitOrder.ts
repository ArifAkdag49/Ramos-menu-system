import { RpcError } from '../../lib/rpc';

export interface SubmitResult {
  order_id: string;
  order_no: number;
  round_no: number;
  session_id: string;
  total_cents: number;
  duplicate: boolean;
}

const DEFAULT_DELAYS = [1000, 2000, 4000];

/**
 * Gönderimi **aynı** `orderId` ile yeniden dener (R36 / spec §13: "Gönderirken bağlantı koptu,
 * cevap gelmedi" → aynı `order_id` ile 3 kez otomatik tekrar; sunucu idempotent olduğu için çift
 * sipariş oluşmaz).
 *
 * Yalnız taşıma katmanı hatası (`RpcError.key === 'network'`) yeniden denenir. İş kuralı hataları
 * (tükendi, seçim eksik …) tekrar denemekle düzelmez; anında yukarı fırlatılır ki kullanıcı
 * sepetini düzeltebilsin. Son denemeden sonra beklenmez — bekleme yalnız denemeler arasındadır.
 */
export async function submitWithRetry(
  send: (id: string) => Promise<SubmitResult>,
  orderId: string,
  { attempts = 3, delays = DEFAULT_DELAYS }: { attempts?: number; delays?: number[] } = {},
): Promise<SubmitResult> {
  let last: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await send(orderId);
    } catch (e) {
      last = e;
      if (!(e instanceof RpcError) || e.key !== 'network') throw e;
      if (i < attempts - 1) await new Promise((r) => setTimeout(r, delays[i] ?? 4000));
    }
  }
  throw last;
}
