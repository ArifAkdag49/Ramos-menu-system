import { useQueries } from '@tanstack/react-query';
import type { MenuProduct } from '@ramos/shared';
import { supabase } from '../lib/supabase';
import { qk } from './keys';
import { mapProducts, type ProductRow } from './menuMapper';

export interface MenuCategory {
  id: string;
  name_de: string;
  name_tr: string | null;
  is_beverage: boolean;
  sort: number;
}

const MENU_STALE_TIME = 5 * 60_000;

const PRODUCT_SELECT = `id, category_id, code, name, description, base_price_cents, allergens, image_path, is_sold_out, sort,
  product_variants(id, name_de, name_tr, price_cents, is_default, sort, is_active),
  product_ingredients(sort, ingredients(id, name_de, name_tr, is_active)),
  product_option_groups(sort, option_groups(id, name_de, name_tr, min_select, max_select, ticket_format, sort, is_active,
    options(id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort, is_active)))`;

export interface MenuData {
  categories: MenuCategory[];
  products: MenuProduct[];
  byId: Map<string, MenuProduct>;
}

/** Menüyü iki sorguyla okur: kategoriler ve iç içe seçimli ürünler. */
export function useMenu(): MenuData {
  const [categoriesQuery, productsQuery] = useQueries({
    queries: [
      {
        queryKey: qk.menu,
        staleTime: MENU_STALE_TIME,
        queryFn: async (): Promise<MenuCategory[]> => {
          const { data, error } = await supabase
            .from('categories')
            .select('id, name_de, name_tr, is_beverage, sort')
            .eq('is_active', true)
            .order('sort');
          if (error) throw error;
          return data ?? [];
        },
      },
      {
        queryKey: [...qk.menu, 'products'],
        staleTime: MENU_STALE_TIME,
        queryFn: async (): Promise<MenuProduct[]> => {
          const { data, error } = await supabase
            .from('products')
            .select(PRODUCT_SELECT)
            .eq('is_active', true)
            .is('archived_at', null);
          if (error) throw error;
          return mapProducts((data ?? []) as unknown as ProductRow[]);
        },
      },
    ],
  });

  const categories = categoriesQuery.data ?? [];
  const products = productsQuery.data ?? [];
  const byId = new Map(products.map((p) => [p.id, p]));
  return { categories, products, byId };
}
