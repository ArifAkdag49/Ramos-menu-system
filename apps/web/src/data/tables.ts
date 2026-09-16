import { useQuery } from '@tanstack/react-query';
import { callRpc } from '../lib/rpc';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

export interface TableRow {
  table_id: string;
  name: string;
  sort: number;
  session_id: string | null;
  opened_at: string | null;
  opened_by_name: string | null;
  orders_in_kitchen: number;
  orders_ready: number;
  failed_prints: number;
  total_cents: number;
}

/** `table_overview` RPC'sinden masa/oturum özetini okur. */
export function useTableOverview(): TableRow[] {
  const { data } = useQuery({
    queryKey: qk.tables,
    queryFn: () => callRpc<TableRow[]>('table_overview'),
  });
  return data ?? [];
}

export interface OpenSession {
  id: string;
  table_id: string;
  opened_at: string;
  opened_by: string;
}

/** Bir masadaki açık oturumu (varsa) okur. */
export function useOpenSession(tableId: string | null | undefined): OpenSession | null {
  const { data } = useQuery({
    queryKey: qk.session(tableId ?? ''),
    enabled: !!tableId,
    queryFn: async (): Promise<OpenSession | null> => {
      const { data, error } = await supabase
        .from('table_sessions')
        .select('id, table_id, opened_at, opened_by')
        .eq('table_id', tableId as string)
        .eq('status', 'open')
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });
  return data ?? null;
}
