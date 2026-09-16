// docs/menu/ramos-menu-data.md'nin makine okunur hali. Tek kaynak o dosyadır;
// burada satır satır aktarılır. Elle yeni ürün EKLEME — önce menü verisini güncelle.
export type Cents = number;
export interface CategorySeed { slug: string; name_de: string; name_tr: string; sort: number; is_beverage?: boolean }
export interface IngredientSeed { slug: string; name_de: string; name_tr: string }
export interface OptionSeed { name_de: string; name_tr: string; price_delta_cents?: Cents; is_default?: boolean; is_exclusive?: boolean }
export interface GroupSeed {
  slug: string; admin_label: string; name_de: string; name_tr: string;
  min: number; max: number; format: 'label_values' | 'values_only' | 'plus_each'; options: OptionSeed[];
}
export interface VariantSeed { name_de: string; name_tr: string; price_cents: Cents; is_default?: boolean }
export interface ProductSeed {
  slug: string; category: string; code: string | null; name: string; description?: string;
  price?: Cents; variants?: VariantSeed[]; ingredients?: string[]; groups?: string[]; allergens?: string;
}

export const FLEISCH = (h: Cents, k: Cents): VariantSeed[] => [
  { name_de: 'Hähnchen', name_tr: 'Tavuk', price_cents: h, is_default: true },
  { name_de: 'Kalb', name_tr: 'Dana', price_cents: k },
];
export const GROESSE = (klein: Cents, gross: Cents): VariantSeed[] => [
  { name_de: 'klein', name_tr: 'Küçük', price_cents: klein, is_default: true },
  { name_de: 'groß', name_tr: 'Büyük', price_cents: gross },
];

export const S_DOENER = ['salat', 'tomaten', 'gurken', 'zwiebeln', 'rotkohl'];
export const S_GRILL = ['salat', 'zwiebeln', 'gegr_tomate', 'gegr_peperoni'];
export const S_BURGER = ['salat', 'tomaten', 'gurken', 'zwiebeln', 'burgersosse'];
const DOENER_GROUPS = ['g-sosse', 'g-scharf', 'g-extra-doener'];

export const CATEGORIES: CategorySeed[] = [
  { slug: 'c-suppen', name_de: 'Suppen', name_tr: 'Çorbalar', sort: 10 },
  { slug: 'c-fruehstueck', name_de: 'Frühstück', name_tr: 'Kahvaltı', sort: 20 },
  { slug: 'c-drehspiess', name_de: 'Drehspieß', name_tr: 'Döner', sort: 30 },
  { slug: 'c-vegetarisch', name_de: 'Vegetarisch & Falafel', name_tr: 'Vejetaryen & Falafel', sort: 40 },
  { slug: 'c-beilagen', name_de: 'Beilagen', name_tr: 'Garnitürler', sort: 50 },
  { slug: 'c-lahmacun', name_de: 'Lahmacun', name_tr: 'Lahmacun', sort: 60 },
  { slug: 'c-pide', name_de: 'Pide', name_tr: 'Pide', sort: 70 },
  { slug: 'c-pizza', name_de: 'Pizza', name_tr: 'Pizza', sort: 80 },
  { slug: 'c-calzone', name_de: 'Calzone', name_tr: 'Calzone', sort: 90 },
  { slug: 'c-salate', name_de: 'Salate', name_tr: 'Salatalar', sort: 100 },
  { slug: 'c-grill', name_de: 'Grill Gerichte', name_tr: 'Izgaralar', sort: 110 },
  { slug: 'c-grill-duerum', name_de: 'Grill im Dürüm', name_tr: 'Dürüm Izgaralar', sort: 120 },
  { slug: 'c-burger', name_de: 'Burger', name_tr: 'Burger', sort: 130 },
  { slug: 'c-spar-menue', name_de: 'Spar Menü', name_tr: 'Ekonomik Menüler', sort: 140 },
  { slug: 'c-dessert', name_de: 'Dessert', name_tr: 'Tatlılar', sort: 150 },
  { slug: 'c-kalte-getraenke', name_de: 'Kalte Getränke', name_tr: 'Soğuk İçecekler', sort: 160, is_beverage: true },
];

export const INGREDIENTS: IngredientSeed[] = [
  { slug: 'salat', name_de: 'Salat', name_tr: 'Marul' },
  { slug: 'tomaten', name_de: 'Tomaten', name_tr: 'Domates' },
  { slug: 'gurken', name_de: 'Gurken', name_tr: 'Salatalık' },
  { slug: 'zwiebeln', name_de: 'Zwiebeln', name_tr: 'Soğan' },
  { slug: 'rotkohl', name_de: 'Rotkohl', name_tr: 'Kırmızı lahana' },
  { slug: 'weisskohl', name_de: 'Weißkohl', name_tr: 'Beyaz lahana' },
  { slug: 'gegr_gemuese', name_de: 'Gegrilltes Gemüse', name_tr: 'Izgara sebze' },
  { slug: 'weichkaese', name_de: 'Weichkäse', name_tr: 'Beyaz peynir' },
  { slug: 'gegr_tomate', name_de: 'Gegrillte Tomate', name_tr: 'Közlenmiş domates' },
  { slug: 'gegr_peperoni', name_de: 'Gegrillte Peperoni', name_tr: 'Közlenmiş biber' },
  { slug: 'joghurt', name_de: 'Joghurt', name_tr: 'Yoğurt' },
  { slug: 'tomatensosse', name_de: 'Tomatensoße', name_tr: 'Domates sosu' },
  { slug: 'butter', name_de: 'Butter', name_tr: 'Tereyağı' },
  { slug: 'knoblauch', name_de: 'Knoblauch', name_tr: 'Sarımsak' },
  { slug: 'burgersosse', name_de: 'Burgersoße', name_tr: 'Burger sosu' },
  { slug: 'rindersalami', name_de: 'Rindersalami', name_tr: 'Dana salam' },
  { slug: 'putenschinken', name_de: 'Putenschinken', name_tr: 'Hindi jambon' },
  { slug: 'sucuk', name_de: 'Sucuk', name_tr: 'Sucuk' },
  { slug: 'doenerfleisch', name_de: 'Drehspieß-Fleisch', name_tr: 'Döner eti' },
  { slug: 'haehnchen', name_de: 'Hähnchenfleisch', name_tr: 'Tavuk eti' },
  { slug: 'thunfisch', name_de: 'Thunfisch', name_tr: 'Ton balığı' },
  { slug: 'champignons', name_de: 'Champignons', name_tr: 'Mantar' },
  { slug: 'paprika', name_de: 'Paprika', name_tr: 'Biber' },
  { slug: 'mais', name_de: 'Mais', name_tr: 'Mısır' },
  { slug: 'oliven', name_de: 'Oliven', name_tr: 'Zeytin' },
  { slug: 'spinat', name_de: 'Spinat', name_tr: 'Ispanak' },
  { slug: 'ei', name_de: 'Ei', name_tr: 'Yumurta' },
  { slug: 'mozzarella', name_de: 'Mozzarella', name_tr: 'Mozzarella' },
  { slug: 'kaese', name_de: 'Käse', name_tr: 'Kaşar peyniri' },
  { slug: 'jalapenos', name_de: 'Jalapeños', name_tr: 'Jalapeño' },
  { slug: 'peperoni', name_de: 'Peperoni', name_tr: 'Peperoni biberi' },
];

const TOPPINGS: [string, string][] = [
  ['Rindersalami', 'Dana salam'], ['Putenschinken', 'Hindi jambon'], ['Sucuk', 'Sucuk'],
  ['Drehspieß-Fleisch', 'Döner eti'], ['Hähnchenfleisch', 'Tavuk eti'], ['Thunfisch', 'Ton balığı'],
  ['Champignons', 'Mantar'], ['Paprika', 'Biber'], ['Zwiebeln', 'Soğan'], ['Mais', 'Mısır'],
  ['Oliven', 'Zeytin'], ['Spinat', 'Ispanak'], ['Tomaten', 'Domates'], ['Jalapeños', 'Jalapeño'],
  ['Ei', 'Yumurta'], ['Mozzarella', 'Mozzarella'],
];

export const GROUPS: GroupSeed[] = [
  { slug: 'g-beilage', admin_label: 'Beilage (Pommes/Reis)', name_de: 'Beilage', name_tr: 'Garnitür', min: 1, max: 1,
    format: 'values_only', options: [
      { name_de: 'Pommes', name_tr: 'Patates kızartması', is_default: true }, { name_de: 'Reis', name_tr: 'Pilav' }] },
  { slug: 'g-sosse', admin_label: 'Soße (Döner)', name_de: 'Soße', name_tr: 'Sos', min: 1, max: 3,
    format: 'label_values', options: [
      { name_de: 'Knoblauch', name_tr: 'Sarımsaklı' }, { name_de: 'Kräuter', name_tr: 'Otlu' },
      { name_de: 'Scharfe Soße', name_tr: 'Acı sos' }, { name_de: 'ohne Soße', name_tr: 'Sossuz', is_exclusive: true }] },
  { slug: 'g-scharf', admin_label: 'scharf (Chili)', name_de: 'Schärfe', name_tr: 'Acı', min: 0, max: 1,
    format: 'values_only', options: [{ name_de: 'scharf (Chili)', name_tr: 'Acılı (pul biber)' }] },
  { slug: 'g-extra-doener', admin_label: 'Extras Döner/Lahmacun', name_de: 'Extras', name_tr: 'Ekstralar', min: 0, max: 2,
    format: 'plus_each', options: [
      { name_de: 'Extra Weichkäse', name_tr: 'Ekstra beyaz peynir', price_delta_cents: 100 },
      { name_de: 'Extra Fleisch', name_tr: 'Ekstra et', price_delta_cents: 200 }] },
  { slug: 'g-extra-pide', admin_label: 'Extras Pide', name_de: 'Extras', name_tr: 'Ekstralar', min: 0, max: 3,
    format: 'plus_each', options: [
      { name_de: 'Extra Ei', name_tr: 'Ekstra yumurta', price_delta_cents: 50 },
      { name_de: 'Extra Käse', name_tr: 'Ekstra peynir', price_delta_cents: 100 },
      { name_de: 'Extra Gemüse', name_tr: 'Ekstra sebze', price_delta_cents: 50 }] },
  { slug: 'g-pizza-extra', admin_label: 'Pizza: weiterer Belag (+0,70)', name_de: 'Extra Belag', name_tr: 'Ekstra malzeme',
    min: 0, max: 16, format: 'plus_each',
    options: TOPPINGS.map(([de, tr]) => ({ name_de: de, name_tr: tr, price_delta_cents: 70 })) },
  { slug: 'g-pizza-mix', admin_label: 'Pizza Mix: 5 Beläge', name_de: 'Beläge', name_tr: 'Malzemeler', min: 5, max: 5,
    format: 'label_values', options: TOPPINGS.map(([de, tr]) => ({ name_de: de, name_tr: tr })) },
  { slug: 'g-menu-getraenk', admin_label: 'Menü-Getränk 0,33 l', name_de: 'Getränk', name_tr: 'İçecek', min: 1, max: 1,
    format: 'label_values', options: ['Cola', 'Cola Light', 'Fanta', 'Sprite', 'Mezzo Mix'].map((n) => ({ name_de: n, name_tr: n })) },
  { slug: 'g-lahmacun-rolle', admin_label: 'Im Lahmacun gerollt (+1,00)', name_de: 'Im Lahmacun gerollt',
    name_tr: 'Lahmacuna sarılı', min: 0, max: 1, format: 'plus_each',
    options: [{ name_de: 'im Lahmacun gerollt', name_tr: 'Lahmacuna sarılı', price_delta_cents: 100 }] },
];

// 107 ürün — docs/menu/ramos-menu-data.md §4'ten birebir aktarıldı.
export const PRODUCTS: ProductSeed[] = [
  // §4.1 Suppen (10)
  { slug: 'p-01', category: 'c-suppen', code: '01', name: 'Linsensuppe / Mercimek Çorbası', price: 500 },
  { slug: 'p-02', category: 'c-suppen', code: '02', name: 'Kuttelsuppe / İşkembe Çorbası', price: 600 },
  { slug: 'p-03', category: 'c-suppen', code: '03', name: 'Fleischsuppe / Kelle Paça', price: 700 },

  // §4.2 Frühstück (20)
  { slug: 'p-04', category: 'c-fruehstueck', code: '04', name: 'Sucuk Toast', description: 'mit Knoblauchwurst & Goudakäse', price: 450 },

  // §4.3 Drehspieß (30) — V_FLEISCH
  { slug: 'p-05', category: 'c-drehspiess', code: '05', name: 'Drehspieß Sandwich', description: 'im Fladenbrot mit Salat & Soße',
    variants: FLEISCH(750, 850), ingredients: S_DOENER, groups: DOENER_GROUPS, allergens: 'a,c,g,4,7' },
  { slug: 'p-89', category: 'c-drehspiess', code: '89', name: 'Gemüse Drehspieß Sandwich',
    description: 'im Fladenbrot mit gegr. Gemüse, Salat & Soße', variants: FLEISCH(800, 900),
    ingredients: [...S_DOENER, 'gegr_gemuese'], groups: DOENER_GROUPS, allergens: 'a,c,g,4,7' },
  { slug: 'p-06', category: 'c-drehspiess', code: '06', name: 'Mega Drehspieß Sandwich',
    description: 'im Fladenbrot mit extra Fleisch, Salat & Soße', variants: FLEISCH(850, 950),
    ingredients: S_DOENER, groups: DOENER_GROUPS, allergens: 'a,c,g,4,7' },
  { slug: 'p-07', category: 'c-drehspiess', code: '07', name: 'Mini Drehspieß Sandwich',
    description: 'im Fladenbrot mit Salat & Soße', variants: FLEISCH(650, 700),
    ingredients: S_DOENER, groups: DOENER_GROUPS, allergens: 'a,c,g,4,7' },
  { slug: 'p-08', category: 'c-drehspiess', code: '08', name: 'Drehspieß Teller', description: 'mit Pommes oder Reis, Salat & Soße',
    variants: FLEISCH(1250, 1350), ingredients: S_DOENER, groups: ['g-beilage', ...DOENER_GROUPS], allergens: 'a,c,g,4,7' },
  { slug: 'p-09', category: 'c-drehspiess', code: '09', name: 'Kleiner Drehspieß Teller', description: 'mit Salat & Soße',
    variants: FLEISCH(1050, 1150), ingredients: S_DOENER, groups: DOENER_GROUPS, allergens: 'a,c,g,4,7' },
  { slug: 'p-10', category: 'c-drehspiess', code: '10', name: 'Iskender Drehspieß',
    description: 'auf Fladenbrotwürfeln mit Tomatensoße, Joghurt & zerlassener Butter', price: 1500,
    ingredients: ['tomatensosse', 'joghurt', 'butter'], groups: ['g-extra-doener'], allergens: 'a,c,g,4,7' },
  { slug: 'p-11', category: 'c-drehspiess', code: '11', name: 'Drehspieß-Box', description: 'mit Pommes',
    variants: FLEISCH(750, 850), groups: DOENER_GROUPS, allergens: 'a,c,g,4,7' },
  { slug: 'p-12', category: 'c-drehspiess', code: '12', name: 'Drehspieß Dürüm', description: 'mit Salat & Soße',
    variants: FLEISCH(800, 900), ingredients: S_DOENER, groups: DOENER_GROUPS, allergens: 'a,c,g,4,7' },

  // §4.4 Vegetarisch & Falafel (40)
  { slug: 'p-13', category: 'c-vegetarisch', code: '13', name: 'Vegetar. Sandwich', description: 'im Fladenbrot mit Gemüse & Weichkäse',
    price: 600, ingredients: [...S_DOENER, 'weichkaese'], groups: ['g-sosse', 'g-scharf'], allergens: 'a,c,g' },
  { slug: 'p-14', category: 'c-vegetarisch', code: '14', name: 'Vegetarisches Dürüm', description: 'im Teigbrot mit Gemüse',
    price: 650, ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf'], allergens: 'a,c,g' },
  { slug: 'p-15', category: 'c-vegetarisch', code: '15', name: 'Falafel Sandwich', description: 'im Fladenbrot mit Salat & Soße',
    price: 600, ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf'], allergens: 'a,c,g' },
  { slug: 'p-90', category: 'c-vegetarisch', code: '90', name: 'Falafel Box', description: 'mit Pommes',
    price: 700, groups: ['g-sosse', 'g-scharf'], allergens: 'a,c,g' },
  { slug: 'p-16', category: 'c-vegetarisch', code: '16', name: 'Falafel Dürüm', description: 'im Teigbrot mit Salat & Soße',
    price: 700, ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf'], allergens: 'a,c,g' },
  { slug: 'p-17', category: 'c-vegetarisch', code: '17', name: 'Falafel Teller', description: 'mit Pommes oder Reis, Salat & Soße',
    price: 1100, ingredients: S_DOENER, groups: ['g-beilage', 'g-sosse', 'g-scharf'], allergens: 'a,c,g' },
  { slug: 'p-19', category: 'c-vegetarisch', code: '19', name: "Ramo's Vegetarischer Teller",
    description: 'mit Pommes oder Reis, Gemüse, Salat & Soße', price: 1100,
    ingredients: [...S_DOENER, 'gegr_gemuese'], groups: ['g-beilage', 'g-sosse', 'g-scharf'], allergens: 'a,c,g' },

  // §4.5 Beilagen (50) — V_GROESSE
  { slug: 'p-18', category: 'c-beilagen', code: '18', name: 'Pommes', description: 'klein / groß', variants: GROESSE(350, 450) },
  { slug: 'p-100', category: 'c-beilagen', code: '100', name: 'Reis', description: 'klein / groß', variants: GROESSE(350, 450) },

  // §4.6 Lahmacun (60)
  { slug: 'p-92', category: 'c-lahmacun', code: '92', name: 'Açık Lahmacun', description: 'ohne alles', price: 500, allergens: 'a,c,g' },
  { slug: 'p-20', category: 'c-lahmacun', code: '20', name: 'Lahmacun', description: 'mit Salat & Soße', price: 650,
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-extra-doener'], allergens: 'a,c,g' },
  { slug: 'p-21', category: 'c-lahmacun', code: '21', name: 'Lahmacun mit Drehspieß', description: 'mit Drehspieß, Salat & Soße',
    variants: FLEISCH(900, 950), ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-extra-doener'], allergens: 'a,c,g,4,7' },
  { slug: 'p-22', category: 'c-lahmacun', code: '22', name: 'Lahmacun Teller mit Drehspieß',
    description: '1 Stück mit Drehspieß, Salat & Soße', price: 1000,
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-extra-doener'] },
  { slug: 'p-93', category: 'c-lahmacun', code: '93', name: 'Lahmacun Teller', description: '1 Stück mit Salat & Soße', price: 700,
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-extra-doener'] },

  // §4.7 Pide (70) — hepsinde G_EXTRA_PIDE
  { slug: 'p-23', category: 'c-pide', code: '23', name: 'Pide mit Gouda & Käse', description: 'Teigschiffchen',
    price: 800, groups: ['g-extra-pide'], allergens: 'a,c,g,2' },
  { slug: 'p-24', category: 'c-pide', code: '24', name: 'Pide mit Spinat & Käse', description: 'Teigschiffchen',
    price: 900, groups: ['g-extra-pide'], allergens: 'a,c,g,2' },
  { slug: 'p-25', category: 'c-pide', code: '25', name: 'Pide mit Hackfleisch & Käse', description: 'Teigschiffchen',
    price: 1000, groups: ['g-extra-pide'], allergens: 'a,c,g,2' },
  { slug: 'p-26', category: 'c-pide', code: '26', name: 'Pide mit Hackfleisch', description: 'Teigschiffchen',
    price: 900, groups: ['g-extra-pide'], allergens: 'a,c,g' },
  { slug: 'p-27', category: 'c-pide', code: '27', name: 'Pide mit Sucuk', description: 'Teigschiffchen',
    price: 900, groups: ['g-extra-pide'], allergens: 'a,c,g,1,2,3,5' },
  { slug: 'p-28', category: 'c-pide', code: '28', name: 'Pide mit Thunfisch', description: 'Teigschiffchen',
    price: 900, groups: ['g-extra-pide'], allergens: 'a,c,g,2,4,7' },
  { slug: 'p-29', category: 'c-pide', code: '29', name: 'Pide mit frischem Gemüse', description: 'Teigschiffchen',
    price: 1000, groups: ['g-extra-pide'], allergens: 'a,c,g,2' },

  // §4.8 Pizza (80) — hepsinde G_PIZZA_EXTRA
  { slug: 'p-30', category: 'c-pizza', code: '30', name: 'Pizza Margherita', price: 700, groups: ['g-pizza-extra'], allergens: 'a,e,g' },
  { slug: 'p-31', category: 'c-pizza', code: '31', name: 'Pizza Rindersalami', price: 900,
    ingredients: ['rindersalami'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2,3,4' },
  { slug: 'p-32', category: 'c-pizza', code: '32', name: 'Pizza Putenschinken', description: '(Formfleischschinken)', price: 900,
    ingredients: ['putenschinken'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2,3,4,6' },
  { slug: 'p-33', category: 'c-pizza', code: '33', name: 'Pizza Mista', description: 'mit Rindersalami & Putenschinken', price: 900,
    ingredients: ['rindersalami', 'putenschinken'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2,3,4,6' },
  { slug: 'p-34', category: 'c-pizza', code: '34', name: 'Pizza Sucuk', description: 'mit türk. Knoblauchwurst', price: 900,
    ingredients: ['sucuk'], groups: ['g-pizza-extra'], allergens: 'a,c,g,1,2,3,5' },
  { slug: 'p-35', category: 'c-pizza', code: '35', name: 'Pizza Special', description: 'mit Spinat & Ei', price: 900,
    ingredients: ['spinat', 'ei'], groups: ['g-pizza-extra'], allergens: 'a,e,g,2' },
  { slug: 'p-36', category: 'c-pizza', code: '36', name: 'Pizza Mozzarella', description: 'mit Mozzarella & Tomaten', price: 900,
    ingredients: ['mozzarella', 'tomaten'], groups: ['g-pizza-extra'], allergens: 'a,e,g,2' },
  { slug: 'p-37', category: 'c-pizza', code: '37', name: 'Pizza Funghi', description: 'mit frischen Champignons', price: 850,
    ingredients: ['champignons'], groups: ['g-pizza-extra'], allergens: 'a,e,g,2' },
  { slug: 'p-38', category: 'c-pizza', code: '38', name: 'Pizza Thunfisch', description: 'mit Zwiebeln', price: 900,
    ingredients: ['thunfisch', 'zwiebeln'], groups: ['g-pizza-extra'], allergens: 'a,c,d,g,2' },
  { slug: 'p-39', category: 'c-pizza', code: '39', name: 'Pizza Drehspieß', description: 'mit Fleisch & Zwiebeln', price: 950,
    ingredients: ['doenerfleisch', 'zwiebeln'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2,4,7' },
  { slug: 'p-40', category: 'c-pizza', code: '40', name: 'Pizza Fitness', description: 'mit Hähnchenfleisch & Champignons', price: 950,
    ingredients: ['haehnchen', 'champignons'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2,4,7' },
  { slug: 'p-41', category: 'c-pizza', code: '41', name: 'Pizza Hähnchen', description: 'mit gegrilltem Hähnchenfleisch', price: 1050,
    ingredients: ['haehnchen'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2' },
  { slug: 'p-42', category: 'c-pizza', code: '42', name: 'Pizza Lahmacun', description: 'mit Paprika, Champignons, Spinat & Mais', price: 950,
    ingredients: ['paprika', 'champignons', 'spinat', 'mais'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2' },
  { slug: 'p-43', category: 'c-pizza', code: '43', name: 'Pizza Spezial',
    description: 'mit Salami, Zwiebeln, Paprika, Spinat, Putenschinken & Champignons', price: 1000,
    ingredients: ['rindersalami', 'zwiebeln', 'paprika', 'spinat', 'putenschinken', 'champignons'],
    groups: ['g-pizza-extra'], allergens: 'a,c,g,2,3,4,5' },
  { slug: 'p-44', category: 'c-pizza', code: '44', name: 'Pizza Vitamino', description: 'mit Champignons, Paprika, Spinat & Ei', price: 1000,
    ingredients: ['champignons', 'paprika', 'spinat', 'ei'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2' },
  { slug: 'p-45', category: 'c-pizza', code: '45', name: 'Pizza Vegetari',
    description: 'mit Mais, Tomaten, Oliven, Paprika, Zwiebeln & Champignons', price: 1000,
    ingredients: ['mais', 'tomaten', 'oliven', 'paprika', 'zwiebeln', 'champignons'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2' },
  { slug: 'p-46', category: 'c-pizza', code: '46', name: 'Pizza Chef',
    description: 'mit Salami, Champignons, Putenschinken (Formfleischschinken), Jalapeños & Ei', price: 1000,
    ingredients: ['rindersalami', 'champignons', 'putenschinken', 'jalapenos', 'ei'],
    groups: ['g-pizza-extra'], allergens: 'a,e,g,2,3,4,6' },
  { slug: 'p-47', category: 'c-pizza', code: '47', name: 'Pizza Mix', description: 'mit 5 Belägen nach Wahl', price: 1150,
    groups: ['g-pizza-extra', 'g-pizza-mix'], allergens: 'a,c,g,4,7' },
  { slug: 'p-102', category: 'c-pizza', code: '102', name: 'Pizza Ramos', description: 'mit Ei', price: 800,
    ingredients: ['ei'], groups: ['g-pizza-extra'], allergens: 'a,c,g,4,7' },
  { slug: 'p-103', category: 'c-pizza', code: '103', name: 'Pizza Brot', price: 600, groups: ['g-pizza-extra'], allergens: 'a,c,g,4,7' },

  // §4.9 Calzone (90) — hepsinde G_PIZZA_EXTRA
  { slug: 'p-53', category: 'c-calzone', code: '53', name: 'Calzone mit Drehspieß & Zwiebeln', price: 1000,
    ingredients: ['doenerfleisch', 'zwiebeln'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2,4,7' },
  { slug: 'p-54', category: 'c-calzone', code: '54', name: 'Calzone mit Spinat & Käse', price: 1000,
    ingredients: ['spinat', 'kaese'], groups: ['g-pizza-extra'], allergens: 'a,c,g,2' },
  { slug: 'p-55', category: 'c-calzone', code: '55', name: 'Calzone mit Sucuk & Käse', price: 1000,
    ingredients: ['sucuk', 'kaese'], groups: ['g-pizza-extra'], allergens: 'a,c,g,1,2,3,5' },
  { slug: 'p-56', category: 'c-calzone', code: '56', name: 'Calzone mit Thunfisch & Zwiebeln', price: 1000,
    ingredients: ['thunfisch', 'zwiebeln'], groups: ['g-pizza-extra'], allergens: 'a,c,d,g,2' },

  // §4.10 Salate (100)
  { slug: 'p-94', category: 'c-salate', code: '94', name: 'Beilagensalat', price: 350 },
  { slug: 'p-48', category: 'c-salate', code: '48', name: 'Frühlingssalat',
    description: 'mit grünem Salat, Tomaten, Gurken, Zwiebeln & Mais', price: 700,
    ingredients: ['salat', 'tomaten', 'gurken', 'zwiebeln', 'mais'] },
  { slug: 'p-49', category: 'c-salate', code: '49', name: 'Thunfisch Salat',
    description: 'mit grünem Salat, Tomaten, Zwiebeln, Oliven & Peperoni', price: 800,
    ingredients: ['salat', 'tomaten', 'zwiebeln', 'oliven', 'peperoni'] },
  { slug: 'p-50', category: 'c-salate', code: '50', name: 'Fitness Salat',
    description: 'mit grünem Salat, Tomaten, Gurken, Mais, Paprika & Dönerfleisch', price: 900,
    ingredients: ['salat', 'tomaten', 'gurken', 'mais', 'paprika'] },
  { slug: 'p-51', category: 'c-salate', code: '51', name: 'Mix Salat',
    description: 'mit grünem Salat, Tomaten, Gurken, Kraut, Weichkäse & Oliven', price: 750,
    ingredients: ['salat', 'tomaten', 'gurken', 'weisskohl', 'weichkaese', 'oliven'], allergens: 'c,g,2' },
  { slug: 'p-52', category: 'c-salate', code: '52', name: 'Hähnchen Salat',
    description: 'gemischter Salat mit gegrilltem Hähnchenfleisch', price: 1000,
    ingredients: ['salat', 'tomaten', 'gurken', 'zwiebeln'] },

  // §4.11 Grill Gerichte (110) — kodların hepsi a,c,g
  { slug: 'p-57', category: 'c-grill', code: '57', name: 'Adana Kebap', description: 'Hackfleischspieß, mit Pommes oder Reis & Salat',
    price: 1350, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-58', category: 'c-grill', code: '58', name: 'Adana Kebap', description: 'Hackfleischspieß, mit Pommes oder Reis & Salat',
    price: 1600, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-59', category: 'c-grill', code: '59', name: 'Kuzu Şiş', description: 'Lammspieß, mit Pommes oder Reis & Salat',
    price: 1500, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-60', category: 'c-grill', code: '60', name: 'Kuzu Şiş', description: 'Lammspieß, mit Pommes oder Reis & Salat',
    price: 1750, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-61', category: 'c-grill', code: '61', name: 'Tavuk Şiş', description: 'Hähnchenbrust-Spieß, mit Pommes oder Reis & Salat',
    price: 1250, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-62', category: 'c-grill', code: '62', name: 'Tavuk Şiş', description: 'Hähnchenbrust-Spieß, mit Pommes oder Reis & Salat',
    price: 1450, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-64', category: 'c-grill', code: '64', name: 'Adana-Tavuk Şiş',
    description: '1x Hackfleischspieß + 1x Hähnchenspieß, mit Pommes oder Reis & Salat',
    price: 1600, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-66', category: 'c-grill', code: '66', name: 'Tavuk Kanat', description: 'Hähnchenflügel, mit Pommes oder Reis & Salat',
    price: 1400, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-67', category: 'c-grill', code: '67', name: 'Yoğurtlu Adana', description: 'Hackfleischspieß mit Joghurt',
    price: 1700, ingredients: ['joghurt'], allergens: 'a,c,g' },
  { slug: 'p-68', category: 'c-grill', code: '68', name: 'Beyti Sarma',
    description: 'Hackfleischspieß gerollt mit Tomatensoße, Joghurt & Beilage',
    price: 1700, ingredients: ['tomatensosse', 'joghurt'], groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-69', category: 'c-grill', code: '69', name: 'Ali Nazik', description: 'Hackfleischspieß mit Joghurt, Aubergine & Knoblauch',
    price: 1700, ingredients: ['joghurt', 'knoblauch'], allergens: 'a,c,g' },
  { slug: 'p-70', category: 'c-grill', code: '70', name: 'Cevapcici', description: '8 Stück, mit Pommes oder Reis & Salat',
    price: 1600, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-71', category: 'c-grill', code: '71', name: 'Köfte Teller', description: 'Gegrillte Frikadellen, mit Pommes oder Reis & Salat',
    price: 1600, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-71a', category: 'c-grill', code: '71a', name: 'Köfte Sandwich', description: 'Gegrillte Frikadellen, mit Salat & Soße',
    price: 900, ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf'], allergens: 'a,c,g' },
  { slug: 'p-72', category: 'c-grill', code: '72', name: 'Pirzola', description: 'Lammkotelett(s), mit Pommes oder Reis & Salat',
    price: 1950, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-74', category: 'c-grill', code: '74', name: 'Karışık Izgara (1 Person)',
    description: 'Gemischter Grillteller mit Pommes oder Reis & Salat',
    price: 2300, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-75', category: 'c-grill', code: '75', name: 'Karışık Izgara (2 Personen)',
    description: 'Gemischter Grillteller mit Pommes oder Reis & Salat',
    price: 4400, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },
  { slug: 'p-76', category: 'c-grill', code: '76', name: 'Karışık Izgara (3 Personen)',
    description: 'Gemischter Grillteller mit Pommes oder Reis & Salat',
    price: 6300, ingredients: S_GRILL, groups: ['g-beilage'], allergens: 'a,c,g' },

  // §4.12 Grill im Dürüm (120) — "auf Wunsch im Lahmacun gerollt, Aufpreis +1,00 €"
  { slug: 'p-77', category: 'c-grill-duerum', code: '77', name: 'Adana Dürüm', description: 'mit Salat & Soße', price: 950,
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-lahmacun-rolle'], allergens: 'a,c,g' },
  { slug: 'p-78', category: 'c-grill-duerum', code: '78', name: 'Tavuk Şiş Dürüm', description: 'mit Salat & Soße', price: 900,
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-lahmacun-rolle'], allergens: 'a,c,g' },
  { slug: 'p-79', category: 'c-grill-duerum', code: '79', name: 'Kuzu Şiş Dürüm', description: 'mit Salat & Soße', price: 1050,
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-lahmacun-rolle'], allergens: 'a,c,g' },

  // §4.13 Burger (130)
  { slug: 'p-80', category: 'c-burger', code: '80', name: 'Hamburger', price: 650, ingredients: S_BURGER, allergens: 'a,c,g,k' },
  { slug: 'p-81', category: 'c-burger', code: '81', name: 'Hamburger Menü', description: 'mit Pommes + 1 Softdrink 0,33 l',
    price: 1100, ingredients: S_BURGER, groups: ['g-menu-getraenk'], allergens: 'a,c,g,k' },
  { slug: 'p-82', category: 'c-burger', code: '82', name: 'Cheeseburger', price: 700, ingredients: S_BURGER, allergens: 'a,c,g,k,2' },
  { slug: 'p-83', category: 'c-burger', code: '83', name: 'Cheeseburger Menü', description: 'mit Pommes + 1 Softdrink 0,33 l',
    price: 1150, ingredients: S_BURGER, groups: ['g-menu-getraenk'], allergens: 'a,c,g,k,2' },
  { slug: 'p-84', category: 'c-burger', code: '84', name: 'Chickenburger', price: 650, ingredients: S_BURGER, allergens: 'a,c,g' },
  { slug: 'p-85', category: 'c-burger', code: '85', name: 'Chickenburger Menü', description: 'mit Pommes + 1 Softdrink 0,33 l',
    price: 1100, ingredients: S_BURGER, groups: ['g-menu-getraenk'], allergens: 'a,c,g' },
  { slug: 'p-87', category: 'c-burger', code: '87', name: 'Chicken Nuggets', description: 'mit Pommes', price: 850, allergens: 'a,c,g' },

  // §4.14 Spar Menü (140) — hepsi "mit Pommes & 1 Softgetränk 0,33 l"
  { slug: 'p-m1', category: 'c-spar-menue', code: 'M1', name: 'Drehspieß Sandwich Menü',
    description: 'mit Pommes & 1 Softgetränk 0,33 l', variants: FLEISCH(1100, 1200),
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-menu-getraenk'] },
  { slug: 'p-m2', category: 'c-spar-menue', code: 'M2', name: 'Drehspieß Dürüm Menü',
    description: 'mit Pommes & 1 Softgetränk 0,33 l', variants: FLEISCH(1150, 1250),
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-menu-getraenk'] },
  { slug: 'p-m3', category: 'c-spar-menue', code: 'M3', name: 'Lahmacun Menü mit Drehspießfleisch',
    description: 'mit Pommes & 1 Softgetränk 0,33 l', variants: FLEISCH(1200, 1350), ingredients: S_DOENER,
    groups: ['g-sosse', 'g-scharf', 'g-menu-getraenk'] },
  { slug: 'p-m4', category: 'c-spar-menue', code: 'M4', name: 'Falafel Sandwich Menü',
    description: 'mit Pommes & 1 Softgetränk 0,33 l', price: 1050,
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-menu-getraenk'] },
  { slug: 'p-m5', category: 'c-spar-menue', code: 'M5', name: 'Falafel Dürüm Menü',
    description: 'mit Pommes & 1 Softgetränk 0,33 l', price: 1100,
    ingredients: S_DOENER, groups: ['g-sosse', 'g-scharf', 'g-menu-getraenk'] },

  // §4.15 Dessert (150)
  { slug: 'p-baklava', category: 'c-dessert', code: null, name: 'Baklava', price: 450, allergens: 'a,h' },
  { slug: 'p-halka-tatli', category: 'c-dessert', code: null, name: 'Halka Tatlı', price: 200 },

  // §4.16 Kalte Getränke (160)
  { slug: 'p-cola-0-33-l', category: 'c-kalte-getraenke', code: null, name: 'Cola 0,33 l', price: 250, allergens: '1,3,9' },
  { slug: 'p-cola-light-0-33-l', category: 'c-kalte-getraenke', code: null, name: 'Cola Light 0,33 l', price: 250, allergens: '1,3,9,12' },
  { slug: 'p-fanta-0-33-l', category: 'c-kalte-getraenke', code: null, name: 'Fanta 0,33 l', price: 250, allergens: '1,3' },
  { slug: 'p-sprite-0-33-l', category: 'c-kalte-getraenke', code: null, name: 'Sprite 0,33 l', price: 250, allergens: '1' },
  { slug: 'p-mezzo-mix-0-33-l', category: 'c-kalte-getraenke', code: null, name: 'Mezzo Mix 0,33 l', price: 250, allergens: '1,3,9' },
  { slug: 'p-mineralwasser-0-5-l', category: 'c-kalte-getraenke', code: null, name: 'Mineralwasser 0,5 l', price: 250 },
  { slug: 'p-stilles-wasser-0-5-l', category: 'c-kalte-getraenke', code: null, name: 'Stilles Wasser 0,5 l', price: 250 },
  { slug: 'p-ayran-0-25-l', category: 'c-kalte-getraenke', code: null, name: 'Ayran 0,25 l', price: 200 },
];

export const TABLE_COUNT = Number(process.env.SEED_TABLE_COUNT ?? 12);

export const SETTINGS = {
  restaurant_name: "Ramo's Döner & Grill House",
  ticket_header: "RAMO'S · KÜCHE",
  quick_notes: [
    { de: 'Soße separat', tr: 'Sos ayrı' }, { de: 'wenig Soße', tr: 'Az sos' }, { de: 'extra Soße', tr: 'Bol sos' },
    { de: 'gut durch', tr: 'İyi pişmiş' }, { de: 'extra knusprig', tr: 'Ekstra çıtır' },
  ],
  cancel_reasons: [
    { de: 'Gast hat storniert', tr: 'Müşteri vazgeçti' }, { de: 'Falsch eingegeben', tr: 'Yanlış giriş' },
    { de: 'Nicht lieferbar', tr: 'Ürün kalmadı' }, { de: 'Sonstiges', tr: 'Diğer', freeText: true },
  ],
  // docs/menu/ramos-menu-data.md §5.5 — 27 satır (a–n, 1–13)
  allergen_legend: [
    { code: 'a', de: 'Glutenhaltiges Getreide', tr: 'Glutenli tahıl' },
    { code: 'b', de: 'Krebstiere', tr: 'Kabuklu deniz ürünleri' },
    { code: 'c', de: 'Eier', tr: 'Yumurta' },
    { code: 'd', de: 'Fisch', tr: 'Balık' },
    { code: 'e', de: 'Erdnüsse', tr: 'Yer fıstığı' },
    { code: 'f', de: 'Soja', tr: 'Soya' },
    { code: 'g', de: 'Milch/Laktose', tr: 'Süt/Laktoz' },
    { code: 'h', de: 'Schalenfrüchte', tr: 'Sert kabuklu yemişler' },
    { code: 'i', de: 'Sellerie', tr: 'Kereviz' },
    { code: 'j', de: 'Senf', tr: 'Hardal' },
    { code: 'k', de: 'Sesam', tr: 'Susam' },
    { code: 'l', de: 'Schwefeldioxid/Sulfite', tr: 'Kükürt dioksit/Sülfit' },
    { code: 'm', de: 'Lupinen', tr: 'Acı bakla' },
    { code: 'n', de: 'Weichtiere', tr: 'Yumuşakçalar' },
    { code: '1', de: 'mit Farbstoff', tr: 'Renklendirici' },
    { code: '2', de: 'mit Konservierungsstoff', tr: 'Koruyucu' },
    { code: '3', de: 'mit Antioxidationsmittel', tr: 'Antioksidan' },
    { code: '4', de: 'mit Geschmacksverstärker', tr: 'Lezzet artırıcı' },
    { code: '5', de: 'geschwefelt', tr: 'Kükürtlenmiş' },
    { code: '6', de: 'geschwärzt', tr: 'Karartılmış' },
    { code: '7', de: 'mit Phosphat', tr: 'Fosfat' },
    { code: '8', de: 'mit Milcheiweiß', tr: 'Süt proteini' },
    { code: '9', de: 'koffeinhaltig', tr: 'Kafeinli' },
    { code: '10', de: 'chininhaltig', tr: 'Kininli' },
    { code: '11', de: 'mit Süßungsmittel', tr: 'Tatlandırıcı' },
    { code: '12', de: 'enthält eine Phenylalaninquelle', tr: 'Fenilalanin kaynağı içerir' },
    { code: '13', de: 'gewachst', tr: 'Mumlanmış' },
  ],
};
