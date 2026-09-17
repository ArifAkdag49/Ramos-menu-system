import { useQueries } from '@tanstack/react-query';
import type { TicketFormat } from '@ramos/shared';
import { supabase } from '../lib/supabase';
import { qk } from './keys';
import type { IngredientRow, OptionGroupRow, OptionRow, ProductRow } from './menuMapper';

/**
 * Admin menü okuması, garson menüsünden (`data/menu.ts`) **kasıtlı olarak** ayrıdır ve onu
 * çatallamaz: garson yalnız satıştaki hâli görür (`is_active`, aktif varyant/seçenek), admin ise
 * pasifleri de düzenleyebilmek için hepsini ister. Satır tipleri `menuMapper`'dan gelir — tablo
 * şeması tek yerde tanımlıdır.
 *
 * Sorgu anahtarları `['menu', 'admin', …]` altında durur: Realtime `menu` olayı `qk.menu`'yu
 * geçersiz kıldığında (ön ek eşleşmesi) admin listeleri de kendiliğinden tazelenir.
 */

export interface AdminCategory {
  id: string;
  slug: string;
  name_de: string;
  name_tr: string | null;
  name_en: string | null;
  name_ar: string | null;
  is_beverage: boolean;
  sort: number;
  is_active: boolean;
}

export interface AdminProduct extends ProductRow {
  slug: string;
  is_active: boolean;
  archived_at: string | null;
}

export interface AdminIngredient extends IngredientRow {
  slug: string;
}

export interface AdminOptionGroup extends OptionGroupRow {
  slug: string;
  admin_label: string;
}

export type { OptionRow, TicketFormat };

const ADMIN_PRODUCT_SELECT = `id, slug, category_id, code, name, description, base_price_cents, allergens, image_path,
  is_active, is_sold_out, sort, archived_at,
  product_variants(id, name_de, name_tr, price_cents, is_default, sort, is_active),
  product_ingredients(sort, ingredients(id, name_de, name_tr, is_active)),
  product_option_groups(sort, option_groups(id, name_de, name_tr, min_select, max_select, ticket_format, sort, is_active,
    options(id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort, is_active)))`;

export interface AdminMenuData {
  categories: AdminCategory[];
  products: AdminProduct[];
  ingredients: AdminIngredient[];
  groups: AdminOptionGroup[];
  isPending: boolean;
}

/** Menü yönetiminin tüm okuması — dört sorgu, tek kanca. */
export function useAdminMenu(): AdminMenuData {
  const [categories, products, ingredients, groups] = useQueries({
    queries: [
      {
        queryKey: qk.adminCategories,
        queryFn: async (): Promise<AdminCategory[]> => {
          const { data, error } = await supabase
            .from('categories')
            .select('id, slug, name_de, name_tr, name_en, name_ar, is_beverage, sort, is_active')
            .order('is_active', { ascending: false })
            .order('sort');
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: qk.adminProducts,
        queryFn: async (): Promise<AdminProduct[]> => {
          // Arşivlenmiş ürünler listede yer almaz; kayıt silinmediği için (BUILD-PROMPT §5) tablo
          // zamanla büyür ama ekran hep güncel menüyü gösterir.
          const { data, error } = await supabase
            .from('products')
            .select(ADMIN_PRODUCT_SELECT)
            .is('archived_at', null)
            .order('is_active', { ascending: false })
            .order('sort');
          if (error) throw error;
          return (data ?? []) as unknown as AdminProduct[];
        },
      },
      {
        queryKey: qk.adminIngredients,
        queryFn: async (): Promise<AdminIngredient[]> => {
          const { data, error } = await supabase
            .from('ingredients')
            .select('id, slug, name_de, name_tr, is_active')
            .order('is_active', { ascending: false })
            .order('name_de');
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: qk.adminGroups,
        queryFn: async (): Promise<AdminOptionGroup[]> => {
          const { data, error } = await supabase
            .from('option_groups')
            .select(
              `id, slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort, is_active,
               options(id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort, is_active)`,
            )
            .order('is_active', { ascending: false })
            .order('sort');
          if (error) throw error;
          return (data ?? []) as unknown as AdminOptionGroup[];
        },
      },
    ],
  });

  return {
    categories: categories.data ?? [],
    products: products.data ?? [],
    ingredients: ingredients.data ?? [],
    groups: groups.data ?? [],
    isPending:
      categories.isPending || products.isPending || ingredients.isPending || groups.isPending,
  };
}

/**
 * Admin listelerinin ortak sıralaması: **pasif satırlar en sona**. Pasif kayıtlar (arşivlenmemiş,
 * yani hâlâ yönetilebilir olanlar) listeden çıkarılmaz — admin onları açıp yeniden etkinleştirebilsin
 * diye görünür kalır — ama gerçek menünün önüne geçmezler. Test fikstürleri (`test-%`) canlıda pasif
 * tutulduğu için (Görev D) bu kural onları da sunumda göze batmayacak biçimde en alta indirir.
 */
export function byAdminOrder<T extends { is_active: boolean; sort: number; name: string }>(a: T, b: T): number {
  return Number(b.is_active) - Number(a.is_active) || a.sort - b.sort || a.name.localeCompare(b.name, 'de');
}

/** Malzemenin/grubun kaç üründe kullanıldığı — ayrı sorgu yerine elimizdeki ürün ağacından sayılır. */
export function usageCounts(products: AdminProduct[]): {
  ingredients: Map<string, number>;
  groups: Map<string, number>;
} {
  const ing = new Map<string, number>();
  const grp = new Map<string, number>();
  for (const p of products) {
    for (const pi of p.product_ingredients) {
      ing.set(pi.ingredients.id, (ing.get(pi.ingredients.id) ?? 0) + 1);
    }
    for (const pg of p.product_option_groups) {
      grp.set(pg.option_groups.id, (grp.get(pg.option_groups.id) ?? 0) + 1);
    }
  }
  return { ingredients: ing, groups: grp };
}
