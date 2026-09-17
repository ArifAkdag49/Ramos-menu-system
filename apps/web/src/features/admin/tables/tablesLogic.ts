/** Masa adının üst sınırı: garson masa kutusunda ve fişin kutulu masa satırında okunur kalsın. */
export const TABLE_NAME_MAX = 40;

const NUMBERED = /^tisch\s+(\d+)$/i;

/**
 * "+ Masa" önerisi: numaralı masaların en büyüğü + 1. Boşluk doldurulmaz — "Tisch 5" kaldırılıp
 * yeniden eklenirse garsonun alıştığı yerleşim bozulmasın diye yeni masa hep sona gelir.
 * Ad Almanca kalır ("Tisch"); TR arayüz `localTableName` ile "Masa" gösterir.
 */
export function suggestTableName(names: string[]): string {
  const max = names.reduce((acc, name) => {
    const m = NUMBERED.exec(name.trim());
    return m ? Math.max(acc, Number(m[1])) : acc;
  }, 0);
  return `Tisch ${max + 1}`;
}

export type TableNameError = 'required' | 'taken' | 'too_long';

const norm = (s: string) => s.trim().toLocaleLowerCase('de-DE');

/**
 * Kaydetmeden önce yakalanan ad hataları. Sunucuda `name unique` zaten var; burada yakalamak,
 * yazma yarıda kalıp (ilk satırlar yazıldı, sonraki çakıştı) ekranın yarım bir durumda kalmasını
 * önler. Karşılaştırma büyük/küçük harfe duyarsızdır: "tisch 2" ile "Tisch 2" garsonun gözünde aynı masa.
 */
export function tableNameError(
  name: string,
  key: string,
  rows: { key: string; name: string }[],
): TableNameError | null {
  const n = norm(name);
  if (!n) return 'required';
  if (name.trim().length > TABLE_NAME_MAX) return 'too_long';
  return rows.some((r) => r.key !== key && norm(r.name) === n) ? 'taken' : null;
}

export interface TableRecord {
  id: string;
  name: string;
  sort: number;
  is_active: boolean;
}

export interface TableDraft {
  key: string;
  id?: string;
  name: string;
  is_active: boolean;
}

/**
 * Taslak listesinden yazılacak satırlar. Yalnız **değişen** satırlar döner: masa tablosunun her
 * güncellemesi denetim kaydına bir satır yazar (`dining_tables_audit`), tek ad düzeltmesi için
 * 20 kayıt düşmesin.
 *
 * Sıra iki yoldan biriyle yazılır:
 * - Dizilim bozulmadıysa (mevcut masalar sunucudaki sırasıyla duruyor, yeni masalar en sonda)
 *   mevcut `sort` değerlerine dokunulmaz; yeni masalar en büyük değerin 10'ar fazlasını alır.
 *   Canlı veride sıralar 10'un katı değildir (seed, fikstür 900/901) ve yalnız masa eklemek
 *   bütün listeyi yeniden numaralamamalı.
 * - Admin bir masayı taşıdıysa ya da yeni masayı araya koyduysa liste `(i + 1) * 10` ile yeniden
 *   numaralanır (menüdeki `reorder` ile aynı adım).
 */
export function changedTables(
  server: TableRecord[],
  drafts: TableDraft[],
): {
  inserts: Omit<TableRecord, 'id'>[];
  updates: TableRecord[];
} {
  const byId = new Map(server.map((s) => [s.id, s]));
  const existing = (d: TableDraft) => (d.id ? byId.get(d.id) : undefined);

  const firstNew = drafts.findIndex((d) => !existing(d));
  const keepsOrder =
    (firstNew < 0 || drafts.slice(firstNew).every((d) => !existing(d))) &&
    drafts.every((d, i) => {
      const prev = i > 0 ? existing(drafts[i - 1] as TableDraft) : undefined;
      const cur = existing(d);
      return !prev || !cur || prev.sort < cur.sort;
    });
  const maxSort = server.reduce((m, s) => Math.max(m, s.sort), 0);

  const inserts: Omit<TableRecord, 'id'>[] = [];
  const updates: TableRecord[] = [];
  drafts.forEach((d, i) => {
    const before = existing(d);
    const sort = keepsOrder ? (before?.sort ?? maxSort + (i - firstNew + 1) * 10) : (i + 1) * 10;
    const row = { name: d.name.trim(), sort, is_active: d.is_active };
    if (!d.id || !before) {
      inserts.push(row);
      return;
    }
    if (before.name !== row.name || before.sort !== row.sort || before.is_active !== row.is_active)
      updates.push({ id: d.id, ...row });
  });
  return { inserts, updates };
}
