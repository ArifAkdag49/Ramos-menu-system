import type { CartLine } from '@ramos/shared';
import { beforeEach, describe, expect, it } from 'vitest';
import { useCart } from './cartStore';

const line = (over: Partial<Omit<CartLine, 'key'>> = {}): Omit<CartLine, 'key'> => ({
  productId: 'p08',
  variantId: 'h',
  optionIds: ['po'],
  removedIngredientIds: [],
  quantity: 1,
  note: '',
  ...over,
});

beforeEach(() => {
  useCart.setState({ carts: {}, notes: {}, pendingOrderId: {} });
});

describe('useCart', () => {
  it('iki masaya ayrı ekleme sepetleri izole tutar', () => {
    useCart.getState().add('t1', line());
    useCart.getState().add('t2', line({ variantId: 'k' }));
    expect(useCart.getState().carts.t1).toHaveLength(1);
    expect(useCart.getState().carts.t2).toHaveLength(1);
    expect(useCart.getState().carts.t1![0]!.variantId).toBe('h');
    expect(useCart.getState().carts.t2![0]!.variantId).toBe('k');
  });

  it('aynı kombinasyonla ekleme adet artırır', () => {
    useCart.getState().add('t1', line());
    useCart.getState().add('t1', line());
    expect(useCart.getState().carts.t1).toHaveLength(1);
    expect(useCart.getState().carts.t1![0]!.quantity).toBe(2);
  });

  it('duplicate aynı anahtarla adet +1 yapar', () => {
    useCart.getState().add('t1', line());
    const key = useCart.getState().carts.t1![0]!.key;
    useCart.getState().duplicate('t1', key);
    expect(useCart.getState().carts.t1).toHaveLength(1);
    expect(useCart.getState().carts.t1![0]!.quantity).toBe(2);
  });

  it('ensurePendingId iki çağrıda aynı UUID döner; clear sonrası yeni UUID üretir', () => {
    const first = useCart.getState().ensurePendingId('t1');
    const second = useCart.getState().ensurePendingId('t1');
    expect(second).toBe(first);
    useCart.getState().clear('t1');
    const third = useCart.getState().ensurePendingId('t1');
    expect(third).not.toBe(first);
  });

  it('update seçenek değişince satır anahtarını yeniler; varsa aynı anahtarlı satırla birleşir', () => {
    useCart.getState().add('t1', line());
    const key = useCart.getState().carts.t1![0]!.key;
    useCart.getState().update('t1', key, line({ variantId: 'k' }));
    expect(useCart.getState().carts.t1).toHaveLength(1);
    expect(useCart.getState().carts.t1![0]!.variantId).toBe('k');
    expect(useCart.getState().carts.t1![0]!.key).not.toBe(key);

    // Aynı anahtara güncellenirse mevcut satırla birleşir (adet toplanır).
    useCart.getState().add('t1', line({ variantId: 'h' }));
    const hKey = useCart.getState().carts.t1!.find((l) => l.variantId === 'h')!.key;
    const kKey = useCart.getState().carts.t1!.find((l) => l.variantId === 'k')!.key;
    useCart.getState().update('t1', hKey, line({ variantId: 'k' }));
    expect(useCart.getState().carts.t1).toHaveLength(1);
    expect(useCart.getState().carts.t1![0]!.key).toBe(kKey);
    expect(useCart.getState().carts.t1![0]!.quantity).toBe(2);
  });

  it('sepeti değiştiren her işlem pendingOrderId’yi temizler', () => {
    useCart.getState().ensurePendingId('t1');
    expect(useCart.getState().pendingOrderId.t1).toBeDefined();
    useCart.getState().add('t1', line());
    expect(useCart.getState().pendingOrderId.t1).toBeUndefined();

    useCart.getState().ensurePendingId('t1');
    const key = useCart.getState().carts.t1![0]!.key;
    useCart.getState().setQty('t1', key, 3);
    expect(useCart.getState().pendingOrderId.t1).toBeUndefined();

    useCart.getState().ensurePendingId('t1');
    useCart.getState().remove('t1', key);
    expect(useCart.getState().pendingOrderId.t1).toBeUndefined();
  });

  it('setNote ve remove masa bazında çalışır', () => {
    useCart.getState().add('t1', line());
    const key = useCart.getState().carts.t1![0]!.key;
    useCart.getState().setNote('t1', 'çok pişmiş');
    expect(useCart.getState().notes.t1).toBe('çok pişmiş');
    useCart.getState().remove('t1', key);
    expect(useCart.getState().carts.t1).toHaveLength(0);
  });

  it('clear sepeti, notu ve pendingOrderId’yi siler', () => {
    useCart.getState().add('t1', line());
    useCart.getState().setNote('t1', 'not');
    useCart.getState().ensurePendingId('t1');
    useCart.getState().clear('t1');
    expect(useCart.getState().carts.t1 ?? []).toHaveLength(0);
    expect(useCart.getState().notes.t1).toBeUndefined();
    expect(useCart.getState().pendingOrderId.t1).toBeUndefined();
  });

  it('persist deposu adı ramos-cart-v1', () => {
    expect(useCart.persist.getOptions().name).toBe('ramos-cart-v1');
  });
});
