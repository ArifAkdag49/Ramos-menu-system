import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callRpc, hasRpcErrorKey } from '../lib/rpc';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

/**
 * Arka planda basan istasyon tabletleri (`station_devices`, yerel ön plan hizmeti). `token_hash`
 * istemciye hiç gelmez (sütun izni yok); kayıt tabletin Mutfak ekranındaki anahtarla oluşur.
 */
export interface StationDevice {
  id: string;
  name: string;
  created_at: string;
  last_seen_at: string | null;
  last_printed_at: string | null;
  last_error: string | null;
}

/** Admin ve mutfak okuyabilir (RLS `station_devices_staff_read`). Son görülme için 30 sn'de bir tazelenir. */
export function useStationDevices(enabled = true) {
  return useQuery({
    queryKey: qk.stationDevices,
    enabled,
    refetchInterval: 30_000,
    queryFn: async (): Promise<StationDevice[]> => {
      const { data, error } = await supabase
        .from('station_devices')
        .select('id, name, created_at, last_seen_at, last_printed_at, last_error')
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

/** Kaydı siler; anahtar anında geçersiz olur. Zaten silinmişse (`station_device_not_found`) başarı sayılır. */
export function useRevokeStationDevice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      try {
        await callRpc<void>('revoke_station_device', { p_id: id });
      } catch (e) {
        if (!hasRpcErrorKey(e, 'station_device_not_found')) throw e;
      }
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.stationDevices }),
  });
}
