import { queryOptions, useQuery } from '@tanstack/react-query';
import type { Profile } from '../lib/auth';
import { callRpc } from '../lib/rpc';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

interface StaffNameRow {
  id: string;
  display_name: string;
  role: 'admin' | 'waiter' | 'kitchen' | 'printer';
}

/**
 * `staff_names` RPC'si: `id -> display_name` haritası. Seçenekler dışarı açıktır ki bir eylem
 * (CSV dışa aktarma) haritayı **beklesin** (`ensureQueryData`): henüz gelmemiş bir harita dosyaya
 * boş garson adı yazdırırdı.
 */
export const staffNamesQuery = queryOptions({
  queryKey: qk.staff,
  queryFn: async () => {
    const rows = await callRpc<StaffNameRow[]>('staff_names');
    return new Map(rows.map((r) => [r.id, r.display_name]));
  },
});

/** `staff_names` RPC'sini okur, `id -> display_name` haritası döner. */
export function useStaffNames(): Map<string, string> {
  const { data } = useQuery(staffNamesQuery);
  return data ?? new Map();
}

/**
 * Admin personel listesi (`profiles_read` RLS: admin tüm profilleri okur). Yazıcı hesabı listede
 * yer almaz. Personel ekranı ve sipariş geçmişinin garson süzgeci aynı sorguyu paylaşır; anahtar
 * `staff` ön ekinin altında olduğu için personel yazımı ikisini birden tazeler.
 */
export function useAdminStaffList() {
  return useQuery({
    queryKey: qk.adminStaff,
    queryFn: async (): Promise<Profile[]> => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, username, display_name, role, locale, is_active, on_duty_since')
        .neq('role', 'printer')
        .order('is_active', { ascending: false })
        .order('display_name');
      if (error) throw error;
      return data as Profile[];
    },
  });
}
