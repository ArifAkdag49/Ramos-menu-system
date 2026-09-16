import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from './supabase';
import { callRpc, RpcError } from './rpc';

describe('callRpc', () => {
  it('bilinen anahtarı RpcError.key olarak taşır', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'product_sold_out', details: 'p1' },
    } as never);
    await expect(callRpc('submit_order', {})).rejects.toMatchObject({
      key: 'product_sold_out',
      detail: 'p1',
    });
  });

  it('ağ hatasını network, bilinmeyeni unknown yapar', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'TypeError: Failed to fetch' },
    } as never);
    await expect(callRpc('x')).rejects.toBeInstanceOf(RpcError);
    vi.mocked(supabase.rpc).mockResolvedValueOnce({
      data: null,
      error: { message: 'weird' },
    } as never);
    await expect(callRpc('x')).rejects.toMatchObject({ key: 'unknown' });
  });

  it('başarıda veriyi döndürür', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { ok: 1 }, error: null } as never);
    await expect(callRpc('x')).resolves.toEqual({ ok: 1 });
  });
});
