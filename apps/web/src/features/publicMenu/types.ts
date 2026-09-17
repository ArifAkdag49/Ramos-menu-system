/**
 * `public.public_menu()` yanıtı (supabase/migrations/0011_public_menu.sql). Girişsiz müşteri
 * menüsünün TEK veri kaynağıdır; iç alanlar (slug, malzemeler, seçim grupları, fiş biçimi) dönmez.
 */
export interface PublicAllergen {
  code: string;
  de: string;
  tr?: string;
}

export interface PublicCategory {
  id: string;
  name_de: string;
  name_tr: string | null;
  name_en: string | null;
  name_ar: string | null;
  is_beverage: boolean;
  sort: number;
}

export interface PublicVariant {
  name_de: string;
  name_tr: string | null;
  price_cents: number;
  sort: number;
}

export interface PublicProduct {
  id: string;
  category_id: string;
  code: string | null;
  name: string;
  description: string | null;
  base_price_cents: number | null;
  image_path: string | null;
  /** Virgüllü alerjen kodları, ör. `'a,c,g'`. */
  allergens: string | null;
  is_sold_out: boolean;
  sort: number;
  variants: PublicVariant[];
}

export interface PublicMenu {
  restaurant_name: string;
  allergen_legend: PublicAllergen[];
  categories: PublicCategory[];
  products: PublicProduct[];
}
