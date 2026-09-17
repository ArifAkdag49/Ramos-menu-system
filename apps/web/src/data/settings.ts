import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { Database } from '@ramos/shared';
import { dayStartMinutes } from '../features/admin/dashboardLogic';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

export type SettingsRow = Database['public']['Tables']['settings']['Row'];
export type SettingsUpdate = Database['public']['Tables']['settings']['Update'];

/** Tek satırlık `settings` kaydını okur (id = 1). */
export function useSettings(): SettingsRow | undefined {
  const { data } = useQuery({
    queryKey: qk.settings,
    queryFn: async () => {
      const { data, error } = await supabase.from('settings').select('*').eq('id', 1).single();
      if (error) throw error;
      return data;
    },
  });
  return data ?? undefined;
}

/**
 * R86 — iş gününün başlangıcı (gece yarısından dakika). Ayar gelene kadar 05:00 döner; sunucu
 * (`public.business_date`) aynı ayarı okuduğu için "bugün" her iki tarafta aynı güne düşer.
 */
export function useBusinessDayStart(): number {
  return dayStartMinutes(useSettings()?.business_day_start);
}

/**
 * Ayarları yazar. `settings_upd` RLS'i yalnız admin'e açıktır; yetkisiz bir yazım satır döndürmez
 * ve `.single()` hata verir, yani sessizce "kaydedildi" denmez. Dönen satır önbelleğe hemen konur
 * (ekran eski değeri bir an bile göstermez); Realtime `settings` olayı diğer cihazları ve yazdırma
 * ajanını tazeler.
 */
export function useUpdateSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: SettingsUpdate): Promise<SettingsRow> => {
      const { data, error } = await supabase
        .from('settings')
        .update(patch)
        .eq('id', 1)
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (row) => qc.setQueryData(qk.settings, row),
  });
}
