import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callRpc } from '../lib/rpc';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

/** Epson Server Direct Print yazıcısı. `token_hash` istemciye hiç gelmez (sütun izni yok). */
export interface SdpPrinter {
  id: string;
  name: string;
  is_active: boolean;
  created_at: string;
  last_seen_at: string | null;
  last_error: string | null;
}

/** Oluşturma / anahtar yenileme yanıtı: düz anahtar YALNIZ burada bulunur, önbelleğe yazılmaz. */
export interface SdpPrinterSecret {
  id: string;
  token: string;
}

/** Yalnız admin okuyabilir (RLS `sdp_printers_admin_read`). "Son görülme" için 30 sn'de bir tazelenir. */
export function useSdpPrinters() {
  return useQuery({
    queryKey: qk.sdpPrinters,
    refetchInterval: 30_000,
    queryFn: async (): Promise<SdpPrinter[]> => {
      const { data, error } = await supabase
        .from('sdp_printers')
        .select('id, name, is_active, created_at, last_seen_at, last_error')
        .order('created_at');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useCreateSdpPrinter() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => callRpc<SdpPrinterSecret>('create_sdp_printer', { p_name: name }),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.sdpPrinters }),
  });
}

export function useRotateSdpToken() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => callRpc<SdpPrinterSecret>('rotate_sdp_printer_token', { p_id: id }),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.sdpPrinters }),
  });
}

export function useSetSdpPrinterActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      callRpc<void>('set_sdp_printer_active', { p_id: id, p_active: active }),
    onSettled: () => void qc.invalidateQueries({ queryKey: qk.sdpPrinters }),
  });
}
