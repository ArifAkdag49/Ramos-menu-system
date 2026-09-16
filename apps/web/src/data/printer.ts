import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callRpc } from '../lib/rpc';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

export type PrinterProblem =
  | 'agent_offline'
  | 'printer_unreachable'
  | 'paper_end'
  | 'cover_open'
  | 'complete_stuck'
  | 'jobs_failed'
  | null;

export interface PrinterState {
  offline?: boolean;
  cover_open?: boolean;
  paper_end?: boolean;
  paper_near_end?: boolean;
  error?: string;
  raw?: unknown;
}

export interface PrinterStatusRow {
  last_seen_at: string | null;
  /** Ajanın heartbeat ile bildirdiği son hata; R79'da `complete_stuck*` için okunur. */
  last_error?: string | null;
  printer_reachable: boolean | null;
  printer_state: PrinterState;
  failed_jobs: number;
}

const AGENT_OFFLINE_MS = 90_000;

/**
 * R79 — yazdırma ajanı bir baskının onayını (`complete_print_job`) 60 sn'den uzun süre
 * tamamlayamazsa durumu `printer_status.last_error` alanına `complete_stuck_<sn>s[;asıl hata]`
 * biçiminde yazar. Bu, "bayt yazıcıya gitti ama kaydedilmedi" durumudur: fiş çift basılmış ya da
 * hiç basılmamış olabilir. Ajan tarafındaki biçim `apps/print-agent/src/agent.ts` → `heartbeatError()`.
 */
const COMPLETE_STUCK = /^complete_stuck_(\d+)s/;

/** Takılan onayın kaç saniyedir beklediğini verir; başka hiçbir metinden sayı türetmez. */
export function completeStuckSeconds(lastError: string | null | undefined): number | null {
  const m = lastError ? COMPLETE_STUCK.exec(lastError) : null;
  return m ? Number(m[1]) : null;
}

/**
 * Saf fonksiyon: yazıcı/ajan durumundan tek bir sorunu önceliğine göre çıkarır.
 *
 * Sıra "önce fiziksel engel, sonra veri bütünlüğü, en sonda kuyruk" mantığındadır: kağıt/kapak
 * garsonun hemen yapabileceği bir şeydir; takılan onay (R79) sessizce fiş kaybettirebildiği için
 * basitçe "başarısız iş var" uyarısının önüne geçer.
 */
export function derivePrinterProblem(row: PrinterStatusRow, now: Date): PrinterProblem {
  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  if (now.getTime() - lastSeen > AGENT_OFFLINE_MS) return 'agent_offline';
  if (row.printer_reachable === false) return 'printer_unreachable';
  if (row.printer_state.paper_end) return 'paper_end';
  if (row.printer_state.cover_open) return 'cover_open';
  if (completeStuckSeconds(row.last_error) !== null) return 'complete_stuck';
  if (row.failed_jobs > 0) return 'jobs_failed';
  return null;
}

export interface PrinterStatusValue {
  last_seen_at: string | null;
  printer_reachable: boolean | null;
  printer_state: PrinterState;
  last_error: string | null;
  last_printed_at: string | null;
  agent_id: string | null;
  agent_version: string | null;
  host: string | null;
}

export type PrintJobType = 'order' | 'addition' | 'storno' | 'table_move' | 'reprint' | 'test';

/** Basılamamış (`failed`) bir baskı işi — admin kartında tek tek "Tekrar dene" için. */
export interface FailedJob {
  id: string;
  type: PrintJobType;
  created_at: string;
  order_no: number | null;
}

/** Kartta listelenen en fazla iş sayısı; sayaç yine tam sayıdır (`count: 'exact'`). */
const FAILED_JOB_LIST_LIMIT = 20;

interface FailedJobRow {
  id: string;
  type: PrintJobType;
  created_at: string;
  orders: { order_no: number } | null;
}

export function usePrinterStatus(): {
  status: PrinterStatusValue | undefined;
  problem: PrinterProblem;
  failedJobs: FailedJob[];
} {
  const statusQuery = useQuery({
    queryKey: qk.printer,
    refetchInterval: 60_000,
    queryFn: async (): Promise<PrinterStatusValue | null> => {
      const { data, error } = await supabase
        .from('printer_status')
        .select(
          'last_seen_at, printer_reachable, printer_state, last_error, last_printed_at, agent_id, agent_version, host',
        )
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as PrinterStatusValue | null;
    },
  });

  // Tek sorgu hem sayacı hem listeyi verir: şerit yalnız "var mı" diye bakar, admin kartı işleri
  // tek tek gösterir. İkinci bir tanım açmamak için ikisi de buradan beslenir.
  const failedJobsQuery = useQuery({
    queryKey: [...qk.printer, 'failed-jobs'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<{ count: number; jobs: FailedJob[] }> => {
      const { data, count, error } = await supabase
        .from('print_jobs')
        .select('id, type, created_at, orders(order_no)', { count: 'exact' })
        .eq('status', 'failed')
        .order('created_at', { ascending: false })
        .limit(FAILED_JOB_LIST_LIMIT);
      if (error) throw error;
      const rows = (data ?? []) as unknown as FailedJobRow[];
      return {
        count: count ?? rows.length,
        jobs: rows.map((r) => ({
          id: r.id,
          type: r.type,
          created_at: r.created_at,
          order_no: r.orders?.order_no ?? null,
        })),
      };
    },
  });

  const status = statusQuery.data ?? undefined;
  const failed = failedJobsQuery.data;
  const problem = status
    ? derivePrinterProblem(
        {
          last_seen_at: status.last_seen_at,
          last_error: status.last_error,
          printer_reachable: status.printer_reachable,
          printer_state: status.printer_state,
          failed_jobs: failed?.count ?? 0,
        },
        new Date(),
      )
    : null;

  return { status, problem, failedJobs: failed?.jobs ?? [] };
}

/** Test fişini kuyruğa alır (`enqueue_test_print`); yetki kararını sunucu verir. */
export function useTestPrint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => callRpc<void>('enqueue_test_print'),
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: qk.printer });
    },
  });
}
