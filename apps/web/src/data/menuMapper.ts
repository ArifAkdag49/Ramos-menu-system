import type { MenuGroup, MenuIngredient, MenuOption, MenuProduct, MenuVariant, TicketFormat } from '@ramos/shared';

export interface ProductVariantRow {
  id: string;
  name_de: string;
  name_tr: string | null;
  price_cents: number;
  is_default: boolean;
  sort: number;
  is_active: boolean;
}

export interface IngredientRow {
  id: string;
  name_de: string;
  name_tr: string | null;
  is_active: boolean;
}

export interface ProductIngredientRow {
  sort: number;
  ingredients: IngredientRow;
}

export interface OptionRow {
  id: string;
  name_de: string;
  name_tr: string | null;
  price_delta_cents: number;
  is_default: boolean;
  is_exclusive: boolean;
  sort: number;
  is_active: boolean;
}

export interface OptionGroupRow {
  id: string;
  name_de: string;
  name_tr: string | null;
  min_select: number;
  max_select: number;
  ticket_format: TicketFormat;
  sort: number;
  is_active: boolean;
  options: OptionRow[];
}

export interface ProductOptionGroupRow {
  sort: number;
  option_groups: OptionGroupRow;
}

export interface ProductRow {
  id: string;
  category_id: string;
  code: string | null;
  name: string;
  description: string | null;
  base_price_cents: number | null;
  allergens: string | null;
  image_path: string | null;
  is_sold_out: boolean;
  sort: number;
  product_variants: ProductVariantRow[];
  product_ingredients: ProductIngredientRow[];
  product_option_groups: ProductOptionGroupRow[];
}

const bySort = <T extends { sort: number }>(a: T, b: T) => a.sort - b.sort;

/** Ürün satırlarını (iç içe seçim) `MenuProduct`'a çevirir; pasifleri eler, sort'a göre dizer. */
export function mapProducts(rows: ProductRow[]): MenuProduct[] {
  return rows.map((row): MenuProduct => {
    const variants: MenuVariant[] = row.product_variants
      .filter((v) => v.is_active)
      .sort(bySort)
      .map((v) => ({
        id: v.id,
        name_de: v.name_de,
        name_tr: v.name_tr,
        price_cents: v.price_cents,
        is_default: v.is_default,
        sort: v.sort,
      }));

    const ingredients: MenuIngredient[] = row.product_ingredients
      .filter((pi) => pi.ingredients.is_active)
      .sort(bySort)
      .map((pi) => ({
        id: pi.ingredients.id,
        name_de: pi.ingredients.name_de,
        name_tr: pi.ingredients.name_tr,
        sort: pi.sort,
      }));

    const groups: MenuGroup[] = row.product_option_groups
      .filter((pg) => pg.option_groups.is_active)
      .sort(bySort)
      .map((pg): MenuGroup => {
        const options: MenuOption[] = pg.option_groups.options
          .filter((o) => o.is_active)
          .sort(bySort)
          .map((o) => ({
            id: o.id,
            name_de: o.name_de,
            name_tr: o.name_tr,
            price_delta_cents: o.price_delta_cents,
            is_default: o.is_default,
            is_exclusive: o.is_exclusive,
            sort: o.sort,
          }));
        return {
          id: pg.option_groups.id,
          name_de: pg.option_groups.name_de,
          name_tr: pg.option_groups.name_tr,
          min_select: pg.option_groups.min_select,
          max_select: pg.option_groups.max_select,
          ticket_format: pg.option_groups.ticket_format,
          sort: pg.sort,
          options,
        };
      });

    return {
      id: row.id,
      category_id: row.category_id,
      code: row.code,
      name: row.name,
      description: row.description,
      base_price_cents: row.base_price_cents,
      allergens: row.allergens,
      image_path: row.image_path,
      is_sold_out: row.is_sold_out,
      sort: row.sort,
      variants,
      ingredients,
      groups,
    };
  });
}
