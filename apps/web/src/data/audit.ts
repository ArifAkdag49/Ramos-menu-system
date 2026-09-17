import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { addDays, businessDayStartUtc } from '../features/admin/dashboardLogic';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

export interface AuditEntry {
  id: number;
  at: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
}

/**
 * Son denetim kayıtları (`audit_log`, `at desc`). Okuma politikası yalnız admin'e açıktır
 * (`audit_log_read`), yani listeyi gizlemek arayüzün işi değil: başka rol zaten satır göremez.
 * `details` kasıtlı olarak çekilmez — eski/yeni satırın tamamını taşır, panoda kullanılmıyor
 * (denetim ekranı ayrıntıyı `useAuditLog` ile okur).
 */
export function useRecentAudit(limit: number): { entries: AuditEntry[]; isPending: boolean } {
  const { data, isPending } = useQuery({
    queryKey: qk.audit(limit),
    // Realtime konuları bu anahtarlara bağlı değil (lib/realtime MAP ortak); dakikada bir tazelenir.
    refetchInterval: 60_000,
    queryFn: async (): Promise<AuditEntry[]> => {
      const { data, error } = await supabase
        .from('audit_log')
        .select('id, at, actor_id, action, entity, entity_id')
        .order('at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AuditEntry[];
    },
  });
  // Boş dizi "kayıt yok" demek DEĞİLDİR; ekran ilk yüklemeyi ayırt edebilsin diye durum da döner.
  return { entries: data ?? [], isPending };
}

export interface AuditLogEntry extends AuditEntry {
  details: unknown;
}

export interface AuditLogFilter {
  /** İş günü, `yyyy-MM-dd`. Sınır Berlin 05:00'tir (`businessDayStartUtc`), takvim gece yarısı değil. */
  from: string;
  to: string;
  action?: string;
  entity?: string;
}

/** Denetim ekranının bir sayfası; "Daha fazla" bir sayfa daha ister. */
export const AUDIT_PAGE_SIZE = 50;

/**
 * Denetim kaydı ekranı (admin). `useRecentAudit`'ten farkı: tarih aralığı + işlem/varlık süzgeci ve
 * `details` sütunu (satır açılınca JSON olarak gösterilir). `page` birikimli sayfa sayısıdır (1, 2, …):
 * `range(0, page × 50 − 1)` — sipariş geçmişiyle aynı "Daha fazla" düzeni.
 *
 * Aralık denetimi (`dateRangeError`) ekranın işidir; buraya geçersiz aralık gelirse sorgu gitmez.
 */
export function useAuditLog(
  filter: AuditLogFilter | null,
  page: number,
): {
  entries: AuditLogEntry[];
  hasMore: boolean;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
} {
  const limit = Math.max(1, page) * AUDIT_PAGE_SIZE;
  const { data, isPending, isFetching, isError } = useQuery({
    queryKey: qk.auditLog(filter ?? {}, limit),
    enabled: filter !== null,
    placeholderData: keepPreviousData,
    queryFn: async (): Promise<AuditLogEntry[]> => {
      const f = filter as AuditLogFilter;
      let q = supabase
        .from('audit_log')
        .select('id, at, actor_id, action, entity, entity_id, details')
        .gte('at', businessDayStartUtc(f.from))
        .lt('at', businessDayStartUtc(addDays(f.to, 1)));
      if (f.action) q = q.eq('action', f.action);
      if (f.entity) q = q.eq('entity', f.entity);
      const { data, error } = await q
        .order('at', { ascending: false })
        .order('id', { ascending: false })
        .range(0, limit - 1);
      if (error) throw error;
      return (data ?? []) as AuditLogEntry[];
    },
  });
  const entries = data ?? [];
  return {
    entries,
    hasMore: entries.length === limit,
    isPending: isPending && filter !== null,
    isFetching,
    isError,
  };
}
