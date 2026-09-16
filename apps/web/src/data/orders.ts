import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toSubmitItems, type Json, type Locale } from '@ramos/shared';
import { useCart } from '../features/waiter/cartStore';
import { submitWithRetry, type SubmitResult } from '../features/waiter/submitOrder';
import { setLanguage } from '../i18n';
import { useAuth } from '../lib/auth';
import { callRpc } from '../lib/rpc';
import { supabase } from '../lib/supabase';
import { qk } from './keys';
import { mapOrders, type OrderRow, type OrderView } from './orderMapper';
import { useStaffNames } from './staff';

// Görev 13: garson ekranları `OrderView`/`OrderItemView`'ı bu modülden içe aktarır (veri
// hook'larıyla aynı yerden) — tip burada yeniden dışa verilir, ikinci bir tanım oluşturulmaz.
export type { OrderItemView, OrderView } from './orderMapper';

export const ORDER_SELECT = `id, order_no, round_no, status, created_at, ready_at, note, waiter_id,
  table_sessions!inner(id, dining_tables!inner(name)),
  order_items(id, product_id, quantity, product_code, product_name, variant_name_de, variant_name_tr,
    removed_ingredients, selected_options, note, status, cancel_reason, sort, category_sort, is_beverage, unit_price_cents),
  print_jobs(id, type, status, last_error, created_at)`;

const READY_DISPLAY_WINDOW_MS = 30 * 60 * 1000;
const KITCHEN_LOOKBACK_MS = 24 * 60 * 60 * 1000;

/** Bir oturumun tüm siparişlerini oluşturulma sırasına göre okur. */
export function useSessionOrders(sessionId: string | null | undefined): OrderView[] {
  const staffNames = useStaffNames();
  const { data } = useQuery({
    queryKey: qk.sessionOrders(sessionId ?? ''),
    enabled: !!sessionId,
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .eq('session_id', sessionId as string)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });
  return mapOrders(data ?? [], staffNames);
}

/** Mutfaktaki (`in_kitchen`) ve son 30 dk'da hazırlanan siparişleri okur. */
export function useKitchenOrders(): OrderView[] {
  const staffNames = useStaffNames();
  const { data } = useQuery({
    queryKey: qk.kitchen,
    refetchInterval: 30_000,
    queryFn: async (): Promise<OrderRow[]> => {
      const since = new Date(Date.now() - KITCHEN_LOOKBACK_MS).toISOString();
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_SELECT)
        .in('status', ['in_kitchen', 'ready'])
        .gte('created_at', since)
        .order('created_at');
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });
  const now = new Date().getTime();
  const rows = (data ?? []).filter(
    (r) =>
      r.status !== 'ready' ||
      !r.ready_at ||
      now - new Date(r.ready_at).getTime() <= READY_DISPLAY_WINDOW_MS,
  );
  return mapOrders(rows, staffNames);
}

/** Hazır (`ready`) siparişleri okur. */
export function useReadyOrders(): OrderView[] {
  const staffNames = useStaffNames();
  const { data } = useQuery({
    queryKey: qk.ready,
    queryFn: async (): Promise<OrderRow[]> => {
      const { data, error } = await supabase.from('orders').select(ORDER_SELECT).eq('status', 'ready');
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });
  return mapOrders(data ?? [], staffNames);
}

/**
 * Sepeti mutfağa gönderir. Sipariş kimliği `ensurePendingId(tableId)`'den gelir: sepet
 * değişmediği sürece **aynı** kimlik kullanılır, böylece yeniden gönderim sunucuda idempotent
 * olur (R36, spec §13) ve çift sipariş oluşmaz. Sepet değişince kimlik geçersizleşir
 * (`cartStore`), yani "iki farklı sepet aynı numaraya yazılır" durumu da oluşmaz.
 *
 * Başarıda sepet yalnız **burada** temizlenir; ekran kendi başına silmez.
 *
 * R74(b): temizlik `clear(tableId)` değil `clearSubmitted(tableId, keys)`. Ağ yeniden denemesinde
 * gönderim saniyelerce uçabiliyor; o sırada sepete yeni bir kalem girmişse tamamını silmek onu da
 * götürürdü. Anahtarlar gönderimden **önce** alınır, böylece "ne gönderdiysek onu düşür" olur.
 * (Temizlik `onSuccess` yerine burada: `onSuccess`'in üçüncü argümanının anlamı TanStack
 * sürümleri arasında değişti, anahtarları taşımak için ona bel bağlamıyoruz.)
 */
export function useSubmitOrder(tableId: string) {
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async (): Promise<SubmitResult> => {
      const cart = useCart.getState();
      const id = cart.ensurePendingId(tableId);
      const lines = cart.carts[tableId] ?? [];
      const items = toSubmitItems(lines);
      const note = cart.notes[tableId]?.trim() || null;
      const result = await submitWithRetry(
        (orderId) =>
          callRpc<SubmitResult>('submit_order', {
            p_order_id: orderId,
            p_table_id: tableId,
            p_items: items,
            p_note: note,
          }),
        id,
      );
      useCart.getState().clearSubmitted(
        tableId,
        lines.map((l) => l.key),
      );
      return result;
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['session'] });
    },
  });
  return { send: () => m.mutateAsync(), isPending: m.isPending };
}

export function useCancelItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { itemId: string; reason: string }) =>
      callRpc<Json>('cancel_order_item', { p_item_id: vars.itemId, p_reason: vars.reason }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['bill'] });
    },
  });
}

export function useMarkReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => callRpc<void>('mark_order_ready', { p_order_id: orderId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
    },
  });
}

export function useUndoReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => callRpc<void>('undo_order_ready', { p_order_id: orderId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
    },
  });
}

export function useMarkServed() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => callRpc<void>('mark_order_served', { p_order_id: orderId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['tables'] });
    },
  });
}

export function useCloseSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (sessionId: string) => callRpc<void>('close_table_session', { p_session_id: sessionId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['session'] });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['bill'] });
    },
  });
}

export function useMoveSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { sessionId: string; targetTableId: string }) =>
      callRpc<void>('move_table_session', {
        p_session_id: vars.sessionId,
        p_target_table_id: vars.targetTableId,
      }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tables'] });
      void qc.invalidateQueries({ queryKey: ['session'] });
    },
  });
}

export function useSetSoldOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (vars: { productId: string; soldOut: boolean }) =>
      callRpc<void>('set_product_sold_out', { p_product_id: vars.productId, p_sold_out: vars.soldOut }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['menu'] });
    },
  });
}

export function useReprint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (orderId: string) => callRpc<void>('reprint_order', { p_order_id: orderId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['printer-status'] });
    },
  });
}

export function useRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (jobId: string) => callRpc<void>('retry_print_job', { p_job_id: jobId }),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: ['printer-status'] });
    },
  });
}

export function useSetOnDuty() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (on: boolean) => callRpc<Json>('set_on_duty', { p_on: on }),
    onSuccess: async () => {
      await useAuth.getState().reloadProfile();
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['staff'] });
    },
  });
}

export function useSetLocale() {
  return useMutation({
    mutationFn: (locale: Locale) => callRpc<void>('set_my_locale', { p_locale: locale }),
    onSuccess: async (_data, locale) => {
      setLanguage(locale);
      await useAuth.getState().reloadProfile();
    },
  });
}

/** Oturumun hesabını (`get_session_bill`) okur. */
export function useBill(sessionId: string | null | undefined) {
  return useQuery({
    queryKey: qk.bill(sessionId ?? ''),
    enabled: !!sessionId,
    queryFn: () => callRpc<Json>('get_session_bill', { p_session_id: sessionId }),
  });
}
