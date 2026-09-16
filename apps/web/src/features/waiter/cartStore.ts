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
  clear: (tableId: TableId) => void;
}

/** Sepet değiştiren her işlem `pendingOrderId`'yi de temizler (idempotency, brief Adım 2). */
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
