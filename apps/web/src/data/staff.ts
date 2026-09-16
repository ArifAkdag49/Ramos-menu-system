import { useQuery } from '@tanstack/react-query';
import { callRpc } from '../lib/rpc';
import { qk } from './keys';

interface StaffNameRow {
  id: string;
  display_name: string;
  role: 'admin' | 'waiter' | 'kitchen' | 'printer';
}

/** `staff_names` RPC'sini okur, `id -> display_name` haritası döner. */
export function useStaffNames(): Map<string, string> {
  const { data } = useQuery({
    queryKey: qk.staff,
    queryFn: async () => {
      const rows = await callRpc<StaffNameRow[]>('staff_names');
      return new Map(rows.map((r) => [r.id, r.display_name]));
    },
  });
  return data ?? new Map();
}
