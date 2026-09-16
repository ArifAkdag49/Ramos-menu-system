import { useQuery } from '@tanstack/react-query';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

export type PrinterProblem =
  | 'agent_offline'
  | 'printer_unreachable'
  | 'paper_end'
  | 'cover_open'
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
  printer_reachable: boolean | null;
  printer_state: PrinterState;
  failed_jobs: number;
}

const AGENT_OFFLINE_MS = 90_000;

/** Saf fonksiyon: yazıcı/ajan durumundan tek bir sorunu önceliğine göre çıkarır. */
export function derivePrinterProblem(row: PrinterStatusRow, now: Date): PrinterProblem {
  const lastSeen = row.last_seen_at ? new Date(row.last_seen_at).getTime() : 0;
  if (now.getTime() - lastSeen > AGENT_OFFLINE_MS) return 'agent_offline';
  if (row.printer_reachable === false) return 'printer_unreachable';
  if (row.printer_state.paper_end) return 'paper_end';
  if (row.printer_state.cover_open) return 'cover_open';
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

export function usePrinterStatus(): { status: PrinterStatusValue | undefined; problem: PrinterProblem } {
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

  const failedJobsQuery = useQuery({
    queryKey: [...qk.printer, 'failed-jobs'],
    refetchInterval: 60_000,
    queryFn: async (): Promise<number> => {
      const { count, error } = await supabase
        .from('print_jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed');
      if (error) throw error;
      return count ?? 0;
    },
  });

  const status = statusQuery.data ?? undefined;
  const problem = status
    ? derivePrinterProblem(
        {
          last_seen_at: status.last_seen_at,
          printer_reachable: status.printer_reachable,
          printer_state: status.printer_state,
          failed_jobs: failedJobsQuery.data ?? 0,
        },
        new Date(),
      )
    : null;

  return { status, problem };
}
