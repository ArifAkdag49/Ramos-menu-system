import type { TicketFormat } from '@ramos/shared';
import { parseEuroInput } from './money';

/**
 * Ürün düzenleyicide "listede yok, yeni ekle" (05.11.2026): admin, menü kütüphanesinde olmayan bir
 * malzemeyi, seçeneği ya da seçim grubunu ürünü bırakmadan oluşturur. Kayıt kütüphaneye gider
 * (Malzemeler / Seçim grupları ekranlarında da görünür); ürüne bağlanması ürünün kendi Kaydet'iyle.
 */

/** Ad üst sınırı: fişte kalem altı satırına ve garson panelindeki düğmeye sığsın. */
export const QUICK_NAME_MAX = 60;

/** Çoklu seçim gruplarında varsayılan "en çok" değeri. */
export const DEFAULT_MULTI_MAX = 3;

/**
 * Yeni grup türleri — admin `min/max/ticket_format` üçlüsünü değil, sonucunu seçer:
 * - `single`: zorunlu, tek seçim (Pommes / Reis). Fişte yalnız seçilen yazar.
 * - `multi`: isteğe bağlı, birden çok (soslar). Fişte "Soße: Knoblauch + Joghurtsoße".
 * - `extra`: isteğe bağlı ekstra (Extra Käse +1,00). Fişte her biri ayrı "+ …" satırı.
 */
export type GroupKind = 'single' | 'multi' | 'extra';

export const GROUP_KINDS: readonly GroupKind[] = ['single', 'multi', 'extra'];

export function groupShape(
  kind: GroupKind,
  max: number,
): { min_select: number; max_select: number; ticket_format: TicketFormat } {
  if (kind === 'single') return { min_select: 1, max_select: 1, ticket_format: 'values_only' };
  const m = Math.max(1, Math.floor(max));
  return { min_select: 0, max_select: m, ticket_format: kind === 'multi' ? 'label_values' : 'plus_each' };
}

/** Listenin sonuna eklenecek kaydın `sort` değeri (10'ar adım, menü ekranlarıyla aynı). */
export function nextSort(items: readonly { sort: number }[]): number {
  return items.reduce((m, i) => Math.max(m, i.sort), 0) + 10;
}

/** Baştaki/sondaki ve art arda boşluklar tek boşluğa iner. */
export const cleanName = (s: string): string => s.trim().replace(/\s+/g, ' ');

const same = (a: string, b: string) => cleanName(a).toLocaleLowerCase('de-DE') === cleanName(b).toLocaleLowerCase('de-DE');

export type NameError = 'required' | 'too_long' | 'taken';

/** Almanca ad zorunludur (fişe o basılır); aynı listede aynı ad iki kez olmaz. */
export function nameError(name: string, existing: readonly string[]): NameError | null {
  const n = cleanName(name);
  if (!n) return 'required';
  if (n.length > QUICK_NAME_MAX) return 'too_long';
  return existing.some((e) => same(e, n)) ? 'taken' : null;
}

/** Fiyat farkı: boş = 0,00. Negatif ya da harfli giriş geçersiz (`null`). */
export function priceDeltaCents(input: string): number | null {
  return input.trim() === '' ? 0 : parseEuroInput(input);
}
