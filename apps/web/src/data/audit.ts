import { useQuery } from '@tanstack/react-query';
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
 * `details` kasıtlı olarak çekilmez — eski/yeni satırın tamamını taşır, ekranda kullanılmıyor.
 */
export function useRecentAudit(limit: number): AuditEntry[] {
  const { data } = useQuery({
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
  return data ?? [];
}
