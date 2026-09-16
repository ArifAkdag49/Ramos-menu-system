import { useQuery } from '@tanstack/react-query';
import type { Database } from '@ramos/shared';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

export type SettingsRow = Database['public']['Tables']['settings']['Row'];

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
