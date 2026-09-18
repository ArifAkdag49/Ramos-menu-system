import { describe, expect, it, vi } from 'vitest';

vi.mock('./supabase', () => ({ supabase: { rpc: vi.fn() } }));
import { supabase } from './supabase';
import { callRpc, hasRpcErrorKey, RpcError } from './rpc';

const failsWith = (error: Record<string, unknown>) =>
  vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: null, error } as never);

describe('callRpc', () => {
  it('bilinen anahtarı RpcError.key olarak taşır', async () => {
    failsWith({ message: 'product_sold_out', details: 'p1' });
    await expect(callRpc('submit_order', {})).rejects.toMatchObject({
      key: 'product_sold_out',
      detail: 'p1',
    });
  });

  it('ağ hatasını network, bilinmeyeni unknown yapar', async () => {
    failsWith({ message: 'TypeError: Failed to fetch' });
    await expect(callRpc('x')).rejects.toBeInstanceOf(RpcError);
    // I2: sınıfı değil, anahtarın kendisi doğrulanır — yoksa eşleme bozulunca test yakalamaz.
    failsWith({ message: 'TypeError: Failed to fetch' });
    await expect(callRpc('x')).rejects.toMatchObject({ key: 'network' });
    failsWith({ message: 'weird' });
    await expect(callRpc('x')).rejects.toMatchObject({ key: 'unknown' });
  });

  it('M2: yetki reddini (42501) not_authorized yapar', async () => {
    failsWith({ code: '42501', message: 'new row violates row-level security policy' });
    await expect(callRpc('submit_order', {})).rejects.toMatchObject({ key: 'not_authorized' });
  });

  it('M2: sunucu zaman aşımını (57014) "internet yok" diye sunmaz', async () => {
    failsWith({ code: '57014', message: 'canceling statement due to statement timeout' });
    await expect(callRpc('x')).rejects.toMatchObject({ key: 'unknown' });
  });

  it('M2: eşlenemeyen hata kod ve mesajıyla teşhis edilebilir kalır', async () => {
    failsWith({ code: 'PGRST202', message: 'Could not find the function' });
    await expect(callRpc('x')).rejects.toMatchObject({
      key: 'unknown',
      detail: 'PGRST202: Could not find the function',
    });
  });

  it('RPC anahtarı koddan önce gelir', async () => {
    failsWith({ code: '42501', message: 'not_authorized', details: 'rls' });
    await expect(callRpc('x')).rejects.toMatchObject({ key: 'not_authorized', detail: 'rls' });
  });

  it('başarıda veriyi döndürür', async () => {
    vi.mocked(supabase.rpc).mockResolvedValueOnce({ data: { ok: 1 }, error: null } as never);
    await expect(callRpc('x')).resolves.toEqual({ ok: 1 });
  });
});

describe('hasRpcErrorKey', () => {
  it('anahtar eşlenmişse ya da (paylaşılan liste eskiyse) ham mesajda geçiyorsa true', () => {
    expect(
      hasRpcErrorKey(new RpcError('station_device_not_found'), 'station_device_not_found'),
    ).toBe(true);
    const raw = new RpcError('unknown', 'P0001: station_device_not_found');
    expect(hasRpcErrorKey(raw, 'station_device_not_found')).toBe(true);
    expect(hasRpcErrorKey(raw, 'device_not_found')).toBe(false);
    expect(hasRpcErrorKey(new RpcError('network'), 'station_device_not_found')).toBe(false);
    expect(hasRpcErrorKey(new Error('station_device_not_found'), 'station_device_not_found')).toBe(
      false,
    );
  });
});
