import { useQuery } from '@tanstack/react-query';
import { callRpc } from '../lib/rpc';
import { qk } from './keys';

export interface ReportWaiterRow {
  display_name: string;
  orders: number;
  value_cents: number;
}

export interface ReportProductRow {
  product_code: string | null;
  product_name: string;
  qty: number;
  value_cents: number;
}

export interface ReportHourRow {
  hour: number;
  orders: number;
}

/** `report_range` RPC'sinin döndürdüğü özet (bkz. migration 0004). Tutarlar tam sayı kuruştur. */
export interface ReportRange {
  from: string;
  to: string;
  orders: number;
  items: number;
  value_cents: number;
  cancelled_items: number;
  cancelled_value_cents: number;
  by_waiter: ReportWaiterRow[];
  top_products: ReportProductRow[];
  by_hour: ReportHourRow[];
}

/**
 * İş günü aralığı raporu. Tarihler `yyyy-MM-dd` biçiminde ve **iş günüdür** (Europe/Berlin,
 * 05:00 kuralı) — takvim günü değil; sunucudaki `orders.business_date` ile aynı ölçü.
 */
export function useReportRange(from: string, to: string): ReportRange | undefined {
  const { data } = useQuery({
    queryKey: qk.report(from, to),
    // Realtime konuları bu anahtarlara bağlı değil (lib/realtime MAP ortak); dakikada bir tazelenir.
    refetchInterval: 60_000,
    enabled: !!from && !!to,
    queryFn: () => callRpc<ReportRange>('report_range', { p_from: from, p_to: to }),
  });
  return data ?? undefined;
}
