export type Locale = 'tr' | 'de';
export type TicketFormat = 'label_values' | 'values_only' | 'plus_each';
export interface Named { name_de: string; name_tr: string | null }
export interface MenuOption extends Named { id: string; price_delta_cents: number; is_default: boolean; is_exclusive: boolean; sort: number }
export interface MenuGroup extends Named { id: string; min_select: number; max_select: number; ticket_format: TicketFormat; sort: number; options: MenuOption[] }
export interface MenuVariant extends Named { id: string; price_cents: number; is_default: boolean; sort: number }
export interface MenuIngredient extends Named { id: string; sort: number }
export interface MenuProduct {
  id: string; category_id: string; code: string | null; name: string; description: string | null;
  base_price_cents: number | null; allergens: string | null; image_path: string | null; is_sold_out: boolean; sort: number;
  variants: MenuVariant[]; ingredients: MenuIngredient[]; groups: MenuGroup[];
}
export interface Selection { variantId: string | null; optionIds: string[]; removedIngredientIds: string[] }
export interface CartLine extends Selection { key: string; productId: string; quantity: number; note: string }
export interface SubmitItem {
  product_id: string; variant_id: string | null; quantity: number;
  option_ids: string[]; removed_ingredient_ids: string[]; note: string | null;
}
export const localName = (x: Named, locale: Locale): string => (locale === 'tr' && x.name_tr) || x.name_de;
