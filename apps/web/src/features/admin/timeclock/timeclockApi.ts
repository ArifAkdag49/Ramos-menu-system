import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { callRpc } from '../../../lib/rpc';
import type { ScanResult, ShiftEdit, TimeclockOverview, WeekData } from './timeclockLogic';

/**
 * Admin > Mesai verisi. Hepsi `timeclock_*` RPC'leri (0020, yalnız admin). Sorgular `timeclock` ön ekinin
 * altındadır ve kalıcı önbelleğe yazılmaz (`queryPersist.ts` listesinde yok): mesai saatleri cihazda kalmasın.
 */
export const tk = {
  all: ['timeclock'] as const,
  overview: ['timeclock', 'overview'] as const,
  week: (monday: string) => ['timeclock', 'week', monday] as const,
  edits: (shiftId: string) => ['timeclock', 'edits', shiftId] as const,
};

export function useTimeclockOverview() {
  return useQuery({
    queryKey: tk.overview,
    queryFn: () => callRpc<TimeclockOverview>('timeclock_overview'),
    // "Şu an çalışıyor" listesi telefondan okutulunca kendiliğinden güncellensin.
    refetchInterval: 60_000,
  });
}

export function useTimeclockWeek(monday: string) {
  return useQuery({
    queryKey: tk.week(monday),
    queryFn: () => callRpc<WeekData>('timeclock_week', { p_monday: monday }),
    refetchInterval: 60_000,
  });
}

export function useShiftEdits(shiftId: string | null) {
  return useQuery({
    queryKey: tk.edits(shiftId ?? ''),
    queryFn: () => callRpc<ShiftEdit[]>('timeclock_shift_edits', { p_id: shiftId }),
    enabled: shiftId !== null,
  });
}

/** Her yazım bütün mesai sorgularını tazeler (liste, hafta, geçmiş birbirine bağlı). */
function useTimeclockMutation<A, R>(fn: (args: A) => Promise<R>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSettled: () => qc.invalidateQueries({ queryKey: tk.all }),
  });
}

export const useAddStaff = () =>
  useTimeclockMutation((name: string) => callRpc<string>('timeclock_add_staff', { p_name: name }));

export const useUpdateStaff = () =>
  useTimeclockMutation((a: { id: string; name?: string; active?: boolean }) =>
    callRpc<null>('timeclock_update_staff', {
      p_id: a.id,
      p_name: a.name ?? null,
      p_active: a.active ?? null,
    }),
  );

export const usePairCode = () =>
  useTimeclockMutation((id: string) =>
    callRpc<{ code: string; expires: string }>('timeclock_pair_code', { p_id: id }),
  );

export const useClockManually = () =>
  useTimeclockMutation((id: string) => callRpc<ScanResult>('timeclock_clock_manually', { p_id: id }));

export const useSaveShift = () =>
  useTimeclockMutation(
    (a: { shiftId?: string; staffId?: string; start: string; end: string | null; reason: string }) =>
      a.shiftId
        ? callRpc<null>('timeclock_edit_shift', {
            p_id: a.shiftId,
            p_start: a.start,
            p_end: a.end,
            p_reason: a.reason,
          })
        : callRpc<string>('timeclock_add_shift', {
            p_staff_id: a.staffId,
            p_start: a.start,
            p_end: a.end,
            p_reason: a.reason,
          }),
  );

export const useSaveTimeclockSettings = () =>
  useTimeclockMutation(
    (a: { location_check?: boolean; lat?: number; lng?: number; radius_m?: number }) =>
      callRpc<null>('timeclock_save_settings', {
        p_location_check: a.location_check ?? null,
        p_lat: a.lat ?? null,
        p_lng: a.lng ?? null,
        p_radius_m: a.radius_m ?? null,
      }),
  );

export const useRotateQr = () => useTimeclockMutation(() => callRpc<string>('timeclock_rotate_qr'));
