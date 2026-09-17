import type { TicketFormat } from '@ramos/shared';
import { supabase } from '../../../lib/supabase';
import { slugWithFallback } from './menuAdminLogic';

/**
 * Menü yazmaları RPC değil, doğrudan tablo yazmalarıdır: `0002_helpers_rls.sql` menü tablolarının
 * hepsine `admin` için insert/update/delete politikası verir ve admin aynı tabloları okuyabildiği
 * için "önce izin, sonra oku" tuzağı (BUILD-PROMPT §6) burada oluşmaz — `insert().select()`
 * güvenle kullanılabilir.
 */
export class MenuApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'MenuApiError';
    this.code = code;
  }
}

/** PostgREST hatasını `{ code, message }` sözleşmesine çevirir; kod yoksa boş dize. */
function fail(error: { code?: string; message?: string } | null): never {
  throw new MenuApiError(error?.code ?? '', error?.message ?? 'unknown');
}

const check = (error: { code?: string; message?: string } | null): void => {
  if (error) fail(error);
};

const shortId = (): string => crypto.randomUUID().slice(0, 8);

// ---------- kategoriler ----------

export interface CategoryInput {
  id?: string;
  name_de: string;
  name_tr: string | null;
  /** Yalnız müşteri QR menüsünde görünür (EN/AR); boşsa Almanca ad gösterilir. */
  name_en: string | null;
  name_ar: string | null;
  is_beverage: boolean;
  sort: number;
  is_active: boolean;
}

export async function upsertCategory(c: CategoryInput): Promise<string> {
  if (c.id) {
    const { error } = await supabase
      .from('categories')
      .update({
        name_de: c.name_de,
        name_tr: c.name_tr,
        name_en: c.name_en,
        name_ar: c.name_ar,
        is_beverage: c.is_beverage,
        sort: c.sort,
        is_active: c.is_active,
        updated_at: new Date().toISOString(),
      })
      .eq('id', c.id);
    check(error);
    return c.id;
  }
  const { data, error } = await supabase
    .from('categories')
    .insert({
      slug: slugWithFallback(c.name_de, shortId()),
      name_de: c.name_de,
      name_tr: c.name_tr,
      name_en: c.name_en,
      name_ar: c.name_ar,
      is_beverage: c.is_beverage,
      sort: c.sort,
      is_active: c.is_active,
    })
    .select('id')
    .single();
  if (error) fail(error);
  return data.id;
}

// ---------- ürünler ----------

export interface ProductInput {
  id?: string;
  category_id: string;
  code: string | null;
  name: string;
  description: string | null;
  base_price_cents: number | null;
  allergens: string | null;
  is_active: boolean;
  is_sold_out: boolean;
  sort: number;
}

export async function upsertProduct(p: ProductInput): Promise<string> {
  const fields = {
    category_id: p.category_id,
    code: p.code,
    name: p.name,
    description: p.description,
    base_price_cents: p.base_price_cents,
    allergens: p.allergens,
    is_active: p.is_active,
    is_sold_out: p.is_sold_out,
    sort: p.sort,
  };
  if (p.id) {
    const { error } = await supabase
      .from('products')
      .update({ ...fields, updated_at: new Date().toISOString() })
      .eq('id', p.id);
    check(error);
    return p.id;
  }
  const { data, error } = await supabase
    .from('products')
    .insert({ ...fields, slug: slugWithFallback(p.name, shortId()) })
    .select('id')
    .single();
  if (error) fail(error);
  return data.id;
}

/** Ürün silinmez, arşivlenir (BUILD-PROMPT §5). Arşivlenen ürün satıştan da düşer. */
export async function archiveProduct(id: string): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ archived_at: new Date().toISOString(), is_active: false, updated_at: new Date().toISOString() })
    .eq('id', id);
  check(error);
}

export interface DuplicateSource {
  id: string;
  slug: string;
  category_id: string;
  name: string;
  description: string | null;
  base_price_cents: number | null;
  allergens: string | null;
  sort: number;
  product_variants: { name_de: string; name_tr: string | null; price_cents: number; is_default: boolean; sort: number; is_active: boolean }[];
  product_ingredients: { sort: number; ingredients: { id: string } }[];
  product_option_groups: { sort: number; option_groups: { id: string } }[];
}

/**
 * Kopya pasif ve **numarasız** doğar: ürün numarası benzersizdir (`products_code_unique`), kopyaya
 * da aynısını vermek kaydı ilk anda çakıştırırdı. Admin numarayı ve adı düzenleyip yayına alır.
 */
export async function duplicateProduct(src: DuplicateSource): Promise<string> {
  const newId = await upsertProduct({
    category_id: src.category_id,
    code: null,
    name: src.name,
    description: src.description,
    base_price_cents: src.base_price_cents,
    allergens: src.allergens,
    is_active: false,
    is_sold_out: false,
    sort: src.sort,
  });

  // `upsertProduct` slug'ı addan üretir; kopya için brief'teki `…-kopie-<kısa id>` biçimi istenir.
  const { error: slugError } = await supabase
    .from('products')
    .update({ slug: `${src.slug}-kopie-${shortId()}` })
    .eq('id', newId);
  check(slugError);

  if (src.product_variants.length > 0) {
    const { error } = await supabase.from('product_variants').insert(
      src.product_variants.map((v) => ({
        product_id: newId,
        name_de: v.name_de,
        name_tr: v.name_tr,
        price_cents: v.price_cents,
        is_default: v.is_default,
        sort: v.sort,
        is_active: v.is_active,
      })),
    );
    check(error);
  }
  if (src.product_ingredients.length > 0) {
    const { error } = await supabase.from('product_ingredients').insert(
      src.product_ingredients.map((pi) => ({ product_id: newId, ingredient_id: pi.ingredients.id, sort: pi.sort })),
    );
    check(error);
  }
  if (src.product_option_groups.length > 0) {
    const { error } = await supabase.from('product_option_groups').insert(
      src.product_option_groups.map((pg) => ({ product_id: newId, group_id: pg.option_groups.id, sort: pg.sort })),
    );
    check(error);
  }
  return newId;
}

// ---------- varyantlar ----------

export interface VariantInput {
  id?: string;
  name_de: string;
  name_tr: string | null;
  price_cents: number;
  is_default: boolean;
  sort: number;
  is_active: boolean;
}

/**
 * Varyant satırları silinmez: siparişte kullanılmış olabilir (`order_items.variant_id` FK).
 * Ekrandaki "Sil" düğmesi `is_active = false` yazar — bu yüzden burada yalnız insert/update var.
 */
export async function saveVariants(productId: string, variants: VariantInput[]): Promise<void> {
  const fresh = variants.filter((v) => !v.id);
  if (fresh.length > 0) {
    const { error } = await supabase.from('product_variants').insert(
      fresh.map((v) => ({
        product_id: productId,
        name_de: v.name_de,
        name_tr: v.name_tr,
        price_cents: v.price_cents,
        is_default: v.is_default,
        sort: v.sort,
        is_active: v.is_active,
      })),
    );
    check(error);
  }
  for (const v of variants) {
    if (!v.id) continue;
    const { error } = await supabase
      .from('product_variants')
      .update({
        name_de: v.name_de,
        name_tr: v.name_tr,
        price_cents: v.price_cents,
        is_default: v.is_default,
        sort: v.sort,
        is_active: v.is_active,
      })
      .eq('id', v.id);
    check(error);
  }
}

// ---------- ürün ↔ malzeme / seçim grubu bağlantıları ----------

export async function setProductIngredients(productId: string, ingredientIds: string[]): Promise<void> {
  const del = supabase.from('product_ingredients').delete().eq('product_id', productId);
  const { error: delError } =
    ingredientIds.length > 0 ? await del.not('ingredient_id', 'in', `(${ingredientIds.join(',')})`) : await del;
  check(delError);

  if (ingredientIds.length === 0) return;
  const { error } = await supabase
    .from('product_ingredients')
    .upsert(
      ingredientIds.map((ingredient_id, i) => ({ product_id: productId, ingredient_id, sort: (i + 1) * 10 })),
      { onConflict: 'product_id,ingredient_id' },
    );
  check(error);
}

export async function setProductGroups(productId: string, groupIds: string[]): Promise<void> {
  const del = supabase.from('product_option_groups').delete().eq('product_id', productId);
  const { error: delError } =
    groupIds.length > 0 ? await del.not('group_id', 'in', `(${groupIds.join(',')})`) : await del;
  check(delError);

  if (groupIds.length === 0) return;
  const { error } = await supabase
    .from('product_option_groups')
    .upsert(
      groupIds.map((group_id, i) => ({ product_id: productId, group_id, sort: (i + 1) * 10 })),
      { onConflict: 'product_id,group_id' },
    );
  check(error);
}

// ---------- malzeme kütüphanesi ----------

export interface IngredientInput {
  id?: string;
  name_de: string;
  name_tr: string | null;
  is_active: boolean;
}

export async function upsertIngredient(i: IngredientInput): Promise<string> {
  if (i.id) {
    const { error } = await supabase
      .from('ingredients')
      .update({ name_de: i.name_de, name_tr: i.name_tr, is_active: i.is_active })
      .eq('id', i.id);
    check(error);
    return i.id;
  }
  const { data, error } = await supabase
    .from('ingredients')
    .insert({ slug: slugWithFallback(i.name_de, shortId()), name_de: i.name_de, name_tr: i.name_tr, is_active: i.is_active })
    .select('id')
    .single();
  if (error) fail(error);
  return data.id;
}

// ---------- seçim grupları ----------

export interface GroupInput {
  id?: string;
  admin_label: string;
  name_de: string;
  name_tr: string | null;
  min_select: number;
  max_select: number;
  ticket_format: TicketFormat;
  sort: number;
  is_active: boolean;
}

export async function upsertGroup(g: GroupInput): Promise<string> {
  const fields = {
    admin_label: g.admin_label,
    name_de: g.name_de,
    name_tr: g.name_tr,
    min_select: g.min_select,
    max_select: g.max_select,
    ticket_format: g.ticket_format,
    sort: g.sort,
    is_active: g.is_active,
  };
  if (g.id) {
    const { error } = await supabase.from('option_groups').update(fields).eq('id', g.id);
    check(error);
    return g.id;
  }
  const { data, error } = await supabase
    .from('option_groups')
    .insert({ ...fields, slug: slugWithFallback(g.admin_label || g.name_de, shortId()) })
    .select('id')
    .single();
  if (error) fail(error);
  return data.id;
}

export interface OptionInput {
  id?: string;
  group_id: string;
  name_de: string;
  name_tr: string | null;
  price_delta_cents: number;
  is_default: boolean;
  is_exclusive: boolean;
  sort: number;
  is_active: boolean;
}

export async function upsertOption(o: OptionInput): Promise<string> {
  const fields = {
    group_id: o.group_id,
    name_de: o.name_de,
    name_tr: o.name_tr,
    price_delta_cents: o.price_delta_cents,
    is_default: o.is_default,
    is_exclusive: o.is_exclusive,
    sort: o.sort,
    is_active: o.is_active,
  };
  if (o.id) {
    const { error } = await supabase.from('options').update(fields).eq('id', o.id);
    check(error);
    return o.id;
  }
  const { data, error } = await supabase.from('options').insert(fields).select('id').single();
  if (error) fail(error);
  return data.id;
}

// ---------- toplu atama ----------

/** Zaten bağlı olanlar sessizce atlanır (`ignoreDuplicates`); dönen sayı **dokunulan ürün** sayısıdır. */
export async function bulkAssignIngredients(productIds: string[], ingredientIds: string[]): Promise<number> {
  if (productIds.length === 0 || ingredientIds.length === 0) return 0;
  const rows = productIds.flatMap((product_id) =>
    ingredientIds.map((ingredient_id, i) => ({ product_id, ingredient_id, sort: (i + 1) * 10 })),
  );
  const { error } = await supabase
    .from('product_ingredients')
    .upsert(rows, { onConflict: 'product_id,ingredient_id', ignoreDuplicates: true });
  check(error);
  return productIds.length;
}

export async function bulkAssignGroup(productIds: string[], groupId: string): Promise<number> {
  if (productIds.length === 0) return 0;
  const rows = productIds.map((product_id) => ({ product_id, group_id: groupId, sort: 10 }));
  const { error } = await supabase
    .from('product_option_groups')
    .upsert(rows, { onConflict: 'product_id,group_id', ignoreDuplicates: true });
  check(error);
  return productIds.length;
}

export async function unassignGroup(productIds: string[], groupId: string): Promise<number> {
  if (productIds.length === 0) return 0;
  const { error } = await supabase
    .from('product_option_groups')
    .delete()
    .eq('group_id', groupId)
    .in('product_id', productIds);
  check(error);
  return productIds.length;
}

// ---------- sıralama ----------

export type SortableTable = 'categories' | 'products' | 'product_variants' | 'option_groups' | 'options';

/** `reorder()`'ın ürettiği `{ id, sort }` satırlarını yazar. Boş liste = taşıma yok, ağ isteği de yok. */
export async function saveSort(table: SortableTable, rows: { id: string; sort: number }[]): Promise<void> {
  for (const row of rows) {
    const { error } = await supabase.from(table).update({ sort: row.sort }).eq('id', row.id);
    check(error);
  }
}

/** Liste satırındaki hızlı anahtarlar (tükendi / satışta). */
export async function setProductFlags(
  id: string,
  flags: { is_sold_out?: boolean; is_active?: boolean },
): Promise<void> {
  const { error } = await supabase
    .from('products')
    .update({ ...flags, updated_at: new Date().toISOString() })
    .eq('id', id);
  check(error);
}
