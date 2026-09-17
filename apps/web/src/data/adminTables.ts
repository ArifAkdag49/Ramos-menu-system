import { useQuery } from '@tanstack/react-query';
import type { TableRecord } from '../features/admin/tables/tablesLogic';
import { supabase } from '../lib/supabase';
import { qk } from './keys';

/**
 * Masa yönetimi. Garsonun okuması (`table_overview`) yalnız **aktif** masaları döndürür; admin
 * pasifleri de görüp geri açabilmek ister, bu yüzden tabloyu doğrudan okur (`dining_tables_read`).
 * Yazma da doğrudan tablo yazımıdır: `0002_helpers_rls.sql` masalara admin insert/update verir,
 * her yazım `dining_tables_audit` tetikleyicisiyle denetim kaydına düşer ve `menu` konusunu yayınlar.
 *
 * Silme yok: geçmiş oturumlar masaya bağlıdır (`table_sessions.table_id` FK). Kullanılmayan masa
 * pasifleştirilir.
 */
export function useAdminTables() {
  return useQuery({
    queryKey: qk.adminTables,
    queryFn: async (): Promise<TableRecord[]> => {
      const { data, error } = await supabase
        .from('dining_tables')
        .select('id, name, sort, is_active')
        .order('sort')
        .order('name');
      if (error) throw error;
      return data ?? [];
    },
  });
}

export type TablesApiErrorKey = 'name_taken' | 'unknown';

export class TablesApiError extends Error {
  readonly key: TablesApiErrorKey;
  /** Çakışan ad (varsa) — mesajda hangi masanın sorun çıkardığı söylenir. */
  readonly tableName: string | null;

  constructor(key: TablesApiErrorKey, tableName: string | null) {
    super(key);
    this.name = 'TablesApiError';
    this.key = key;
    this.tableName = tableName;
  }
}

/** `23505` = unique_violation (`dining_tables_name_key`). Diğer her şey "bilinmeyen". */
const fail = (error: { code?: string } | null, name: string): void => {
  if (!error) return;
  throw new TablesApiError(error.code === '23505' ? 'name_taken' : 'unknown', name);
};

/**
 * Değişen satırları sırayla yazar. Güncellemeler eklemelerden **önce** gider: "Tisch 5"i
 * "Tisch 6" yapıp yeni bir "Tisch 5" eklemek tek kayıtta mümkün olsun.
 */
export async function saveTables(
  inserts: Omit<TableRecord, 'id'>[],
  updates: TableRecord[],
): Promise<void> {
  for (const u of updates) {
    const { error } = await supabase
      .from('dining_tables')
      .update({ name: u.name, sort: u.sort, is_active: u.is_active })
      .eq('id', u.id);
    fail(error, u.name);
  }
  for (const i of inserts) {
    const { error } = await supabase.from('dining_tables').insert(i);
    fail(error, i.name);
  }
}
