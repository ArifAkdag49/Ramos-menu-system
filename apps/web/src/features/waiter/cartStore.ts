import { addLine, type CartLine } from '@ramos/shared';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

type TableId = string;

interface CartState {
  carts: Record<TableId, CartLine[]>;
  notes: Record<TableId, string>;
  pendingOrderId: Record<TableId, string | undefined>;
  add: (tableId: TableId, line: Omit<CartLine, 'key'>) => void;
  update: (tableId: TableId, key: string, line: Omit<CartLine, 'key'>) => void;
  remove: (tableId: TableId, key: string) => void;
  duplicate: (tableId: TableId, key: string) => void;
  setQty: (tableId: TableId, key: string, quantity: number) => void;
  setNote: (tableId: TableId, note: string) => void;
  ensurePendingId: (tableId: TableId) => string;
  clearSubmitted: (tableId: TableId, keys: string[]) => void;
  clear: (tableId: TableId) => void;
}

/**
 * **Satır** işlemleri (ekle/güncelle/sil/çoğalt/adet) `pendingOrderId`'yi geçersiz kılar: sepetin
 * içeriği değiştiyse artık başka bir siparişten söz ediyoruz (idempotency, R36).
 *
 * M2 — `setNote` bilerek buraya dahil DEĞİLDİR: not, gönderilen kalemleri değiştirmez. Notta da
 * geçersiz kılsaydık "gönderdim, cevap gelmedi, notu düzelttim, tekrar gönderdim" akışı yeni bir
 * `order_id` üretir ve sunucudaki idempotency devre dışı kalırdı — yani gerçek bir çift sipariş.
 */
const touch = (tableId: TableId, pendingOrderId: CartState['pendingOrderId']) => ({
  ...pendingOrderId,
  [tableId]: undefined,
});

/**
 * Masa bazlı kalıcı sepet (Zustand + `localStorage`, anahtar `ramos-cart-v1`). Satır işlemleri
 * `@ramos/shared`'daki `addLine`/`lineKey` ile yapılır — birleştirme kuralı sunucuyla aynı yerde
 * tanımlı, burada tekrarlanmaz.
 */
export const useCart = create<CartState>()(
  persist(
    (set, get) => ({
      carts: {},
      notes: {},
      pendingOrderId: {},

      add: (tableId, line) =>
        set((s) => ({
          carts: { ...s.carts, [tableId]: addLine(s.carts[tableId] ?? [], line) },
          pendingOrderId: touch(tableId, s.pendingOrderId),
        })),

      update: (tableId, key, line) =>
        set((s) => {
          const remaining = (s.carts[tableId] ?? []).filter((l) => l.key !== key);
          return {
            carts: { ...s.carts, [tableId]: addLine(remaining, line) },
            pendingOrderId: touch(tableId, s.pendingOrderId),
          };
        }),

      remove: (tableId, key) =>
        set((s) => ({
          carts: { ...s.carts, [tableId]: (s.carts[tableId] ?? []).filter((l) => l.key !== key) },
          pendingOrderId: touch(tableId, s.pendingOrderId),
        })),

      duplicate: (tableId, key) =>
        set((s) => {
          const lines = s.carts[tableId] ?? [];
          const hit = lines.find((l) => l.key === key);
          if (!hit) return s;
          return {
            carts: {
              ...s.carts,
              [tableId]: addLine(lines, {
                productId: hit.productId,
                variantId: hit.variantId,
                optionIds: hit.optionIds,
                removedIngredientIds: hit.removedIngredientIds,
                extraCharges: hit.extraCharges ?? [],
                note: hit.note,
                quantity: 1,
              }),
            },
            pendingOrderId: touch(tableId, s.pendingOrderId),
          };
        }),

      setQty: (tableId, key, quantity) =>
        set((s) => ({
          carts: {
            ...s.carts,
            [tableId]: (s.carts[tableId] ?? []).map((l) => (l.key === key ? { ...l, quantity } : l)),
          },
          pendingOrderId: touch(tableId, s.pendingOrderId),
        })),

      setNote: (tableId, note) => set((s) => ({ notes: { ...s.notes, [tableId]: note } })),

      ensurePendingId: (tableId) => {
        const existing = get().pendingOrderId[tableId];
        if (existing) return existing;
        const id = crypto.randomUUID();
        set((s) => ({ pendingOrderId: { ...s.pendingOrderId, [tableId]: id } }));
        return id;
      },

      /**
       * Başarılı gönderimden sonra **yalnız gönderilen** satırları düşürür (R74). Gönderim
       * uçarken (ağ yeniden denemesinde pencere saniyelere çıkabilir) garson yeni bir kalem
       * eklediyse o kalem sepette kalır; yoksa hiç gönderilmemiş bir ürün sessizce kaybolur ve
       * garson ancak yemek gelmeyince fark eder. Not ve sipariş kimliği her hâlükârda gider:
       * ikisi de gönderilen siparişe aitti.
       */
      clearSubmitted: (tableId, keys) =>
        set((s) => {
          const sent = new Set(keys);
          const rest = (s.carts[tableId] ?? []).filter((l) => !sent.has(l.key));
          const carts = { ...s.carts };
          const notes = { ...s.notes };
          const pendingOrderId = { ...s.pendingOrderId };
          if (rest.length) carts[tableId] = rest;
          else delete carts[tableId];
          delete notes[tableId];
          delete pendingOrderId[tableId];
          return { carts, notes, pendingOrderId };
        }),

      clear: (tableId) =>
        set((s) => {
          const carts = { ...s.carts };
          const notes = { ...s.notes };
          const pendingOrderId = { ...s.pendingOrderId };
          delete carts[tableId];
          delete notes[tableId];
          delete pendingOrderId[tableId];
          return { carts, notes, pendingOrderId };
        }),
    }),
    { name: 'ramos-cart-v1', version: 1 },
  ),
);
