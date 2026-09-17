import { keepPreviousData, useQuery } from '@tanstack/react-query';
import type { OrdersFilter } from '../features/admin/orders/ordersQuery';
import { supabase } from '../lib/supabase';
import { qk } from './keys';
import {
  byItemOrder,
  mapOrders,
  type OrderItemRow,
  type OrderRow,
  type OrderStatus,
  type OrderView,
  type PrintJobStatus,
  type PrintJobType,
} from './orderMapper';
import { ORDER_SELECT } from './orders';
import { useStaffNames } from './staff';

/**
 * Sipariş geçmişi (admin). Liste garson/KDS ile **aynı seçimi** (`ORDER_SELECT`) ve aynı eşlemeyi
 * (`mapOrders`) kullanır: kalem sırası, masa adı ve garson adı her ekranda aynı çıkar. Masaya göre
 * süzme gömülü tablonun sütunuyla yapılır (`table_sessions.table_id`); `!inner` birleşimi sayesinde
 * eşleşmeyen sipariş satırı sonuçtan düşer.
 *
 * Sayfalama birikimlidir: `limit` 50, 100, 150 … — "Daha fazla" yeni bir anahtarla bir öncekinin
 * üstüne okur, `keepPreviousData` eski listeyi ekranda tutar (liste yanıp sönmez).
 */
export function useAdminOrders(filter: OrdersFilter | null, limit: number) {
  const staffNames = useStaffNames();
  const query = useQuery({
    queryKey: qk.adminOrders(filter ?? {}, limit),
    enabled: filter !== null,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<OrderRow[]> => {
      const f = filter as OrdersFilter;
      let q = supabase
        .from('orders')
        .select(ORDER_SELECT)
        .gte('business_date', f.business_date_gte)
        .lte('business_date', f.business_date_lte);
      if (f.session_table) q = q.eq('table_sessions.table_id' as never, f.session_table as never);
      if (f.waiter_id) q = q.eq('waiter_id', f.waiter_id);
      if (f.status) q = q.eq('status', f.status);
      const { data, error } = await q.order('created_at', { ascending: false }).range(0, limit - 1);
      if (error) throw error;
      return (data ?? []) as unknown as OrderRow[];
    },
  });
  const rows = query.data ?? [];
  return {
    orders: mapOrders(rows, staffNames),
    /** Tam sayfa geldiyse arkasında satır olabilir; eksik sayfa listenin sonudur. */
    hasMore: rows.length === limit,
    isPending: query.isPending && filter !== null,
    isFetching: query.isFetching,
    isError: query.isError,
  };
}

export interface AdminOrderItem extends OrderItemRow {
  cancelled_by: string | null;
  cancelled_at: string | null;
}

export interface AdminPrintJob {
  id: string;
  type: PrintJobType;
  status: PrintJobStatus;
  attempts: number;
  last_error: string | null;
  created_at: string;
  printed_at: string | null;
  payload: unknown;
}

export interface AdminOrderDetail {
  id: string;
  order_no: number;
  round_no: number;
  status: OrderStatus;
  business_date: string;
  created_at: string;
  ready_at: string | null;
  ready_by: string | null;
  served_at: string | null;
  served_by: string | null;
  cancelled_at: string | null;
  note: string | null;
  waiter_id: string;
  table_sessions: { id: string; status: 'open' | 'closed'; dining_tables: { name: string } };
  order_items: AdminOrderItem[];
  print_jobs: AdminPrintJob[];
}

/**
 * Çekmecenin okuması listeden **ayrıdır**: fiş yükü (`payload`), deneme sayısı, iptal eden kişi ve
 * oturum durumu yalnız burada gerekir. Bunları 50 satırlık listeye koymak her sayfada 50 fiş yükü
 * taşımak demekti.
 */
const ORDER_DETAIL_SELECT = `id, order_no, round_no, status, business_date, created_at, ready_at, ready_by,
  served_at, served_by, cancelled_at, note, waiter_id,
  table_sessions!inner(id, status, dining_tables!inner(name)),
  order_items(id, product_id, quantity, product_code, product_name, variant_name_de, variant_name_tr,
    removed_ingredients, selected_options, extra_charges, note, status, cancel_reason, cancelled_by, cancelled_at,
    sort, category_sort, is_beverage, unit_price_cents),
  print_jobs(id, type, status, attempts, last_error, created_at, printed_at, payload)`;

export function useAdminOrderDetail(orderId: string | null) {
  return useQuery({
    queryKey: qk.adminOrder(orderId ?? ''),
    enabled: !!orderId,
    queryFn: async (): Promise<AdminOrderDetail | null> => {
      const { data, error } = await supabase
        .from('orders')
        .select(ORDER_DETAIL_SELECT)
        .eq('id', orderId as string)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      const row = data as unknown as AdminOrderDetail;
      return {
        ...row,
        order_items: [...row.order_items].sort(byItemOrder),
        print_jobs: [...row.print_jobs].sort((a, b) => a.created_at.localeCompare(b.created_at)),
      };
    },
  });
}

export type { OrderView };
