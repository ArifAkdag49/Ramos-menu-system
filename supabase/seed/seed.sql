-- ÜRETİLDİ: supabase/seed/build-seed.ts — elle düzenleme
begin;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-suppen', 'Suppen', 'Çorbalar', 10, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-fruehstueck', 'Frühstück', 'Kahvaltı', 20, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-drehspiess', 'Drehspieß', 'Döner', 30, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-vegetarisch', 'Vegetarisch & Falafel', 'Vejetaryen & Falafel', 40, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-beilagen', 'Beilagen', 'Garnitürler', 50, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-lahmacun', 'Lahmacun', 'Lahmacun', 60, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-pide', 'Pide', 'Pide', 70, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-pizza', 'Pizza', 'Pizza', 80, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-calzone', 'Calzone', 'Calzone', 90, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-salate', 'Salate', 'Salatalar', 100, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-grill', 'Grill Gerichte', 'Izgaralar', 110, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-grill-duerum', 'Grill im Dürüm', 'Dürüm Izgaralar', 120, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-burger', 'Burger', 'Burger', 130, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-spar-menue', 'Spar Menü', 'Ekonomik Menüler', 140, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-dessert', 'Dessert', 'Tatlılar', 150, false)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.categories (slug, name_de, name_tr, sort, is_beverage)
  values ('c-kalte-getraenke', 'Kalte Getränke', 'Soğuk İçecekler', 160, true)
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr,
    sort = excluded.sort, is_beverage = excluded.is_beverage;
insert into public.ingredients (slug, name_de, name_tr)
  values ('salat', 'Salat', 'Marul')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('tomaten', 'Tomaten', 'Domates')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('gurken', 'Gurken', 'Salatalık')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('zwiebeln', 'Zwiebeln', 'Soğan')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('rotkohl', 'Rotkohl', 'Kırmızı lahana')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('weisskohl', 'Weißkohl', 'Beyaz lahana')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('gegr_gemuese', 'Gegrilltes Gemüse', 'Izgara sebze')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('weichkaese', 'Weichkäse', 'Beyaz peynir')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('gegr_tomate', 'Gegrillte Tomate', 'Közlenmiş domates')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('gegr_peperoni', 'Gegrillte Peperoni', 'Közlenmiş biber')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('joghurt', 'Joghurt', 'Yoğurt')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('tomatensosse', 'Tomatensoße', 'Domates sosu')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('butter', 'Butter', 'Tereyağı')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('knoblauch', 'Knoblauch', 'Sarımsak')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('burgersosse', 'Burgersoße', 'Burger sosu')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('rindersalami', 'Rindersalami', 'Dana salam')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('putenschinken', 'Putenschinken', 'Hindi jambon')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('sucuk', 'Sucuk', 'Sucuk')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('doenerfleisch', 'Drehspieß-Fleisch', 'Döner eti')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('haehnchen', 'Hähnchenfleisch', 'Tavuk eti')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('thunfisch', 'Thunfisch', 'Ton balığı')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('champignons', 'Champignons', 'Mantar')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('paprika', 'Paprika', 'Biber')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('mais', 'Mais', 'Mısır')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('oliven', 'Oliven', 'Zeytin')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('spinat', 'Spinat', 'Ispanak')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('ei', 'Ei', 'Yumurta')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('mozzarella', 'Mozzarella', 'Mozzarella')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('kaese', 'Käse', 'Kaşar peyniri')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('jalapenos', 'Jalapeños', 'Jalapeño')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.ingredients (slug, name_de, name_tr)
  values ('peperoni', 'Peperoni', 'Peperoni biberi')
  on conflict (slug) do update set name_de = excluded.name_de, name_tr = excluded.name_tr;
insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values ('g-beilage', 'Beilage (Pommes/Reis)', 'Beilage', 'Garnitür', 1, 1, 'values_only', 1)
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Pommes', 'Patates kızartması', 0, true,
      false, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Reis', 'Pilav', 0, false,
      false, 2 from public.option_groups where slug = 'g-beilage'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values ('g-sosse', 'Soße (Döner)', 'Soße', 'Sos', 1, 3, 'label_values', 2)
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Knoblauch', 'Sarımsaklı', 0, false,
      false, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Kräuter', 'Otlu', 0, false,
      false, 2 from public.option_groups where slug = 'g-sosse'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Scharfe Soße', 'Acı sos', 0, false,
      false, 3 from public.option_groups where slug = 'g-sosse'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'ohne Soße', 'Sossuz', 0, false,
      true, 4 from public.option_groups where slug = 'g-sosse'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values ('g-scharf', 'scharf (Chili)', 'Schärfe', 'Acı', 0, 1, 'values_only', 3)
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'scharf (Chili)', 'Acılı (pul biber)', 0, false,
      false, 1 from public.option_groups where slug = 'g-scharf'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values ('g-extra-doener', 'Extras Döner/Lahmacun', 'Extras', 'Ekstralar', 0, 2, 'plus_each', 4)
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Extra Weichkäse', 'Ekstra beyaz peynir', 100, false,
      false, 1 from public.option_groups where slug = 'g-extra-doener'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Extra Fleisch', 'Ekstra et', 200, false,
      false, 2 from public.option_groups where slug = 'g-extra-doener'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values ('g-extra-pide', 'Extras Pide', 'Extras', 'Ekstralar', 0, 3, 'plus_each', 5)
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Extra Ei', 'Ekstra yumurta', 50, false,
      false, 1 from public.option_groups where slug = 'g-extra-pide'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Extra Käse', 'Ekstra peynir', 100, false,
      false, 2 from public.option_groups where slug = 'g-extra-pide'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Extra Gemüse', 'Ekstra sebze', 50, false,
      false, 3 from public.option_groups where slug = 'g-extra-pide'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values ('g-pizza-extra', 'Pizza: weiterer Belag (+0,70)', 'Extra Belag', 'Ekstra malzeme', 0, 16, 'plus_each', 6)
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Rindersalami', 'Dana salam', 70, false,
      false, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Putenschinken', 'Hindi jambon', 70, false,
      false, 2 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Sucuk', 'Sucuk', 70, false,
      false, 3 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Drehspieß-Fleisch', 'Döner eti', 70, false,
      false, 4 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Hähnchenfleisch', 'Tavuk eti', 70, false,
      false, 5 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Thunfisch', 'Ton balığı', 70, false,
      false, 6 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Champignons', 'Mantar', 70, false,
      false, 7 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Paprika', 'Biber', 70, false,
      false, 8 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Zwiebeln', 'Soğan', 70, false,
      false, 9 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Mais', 'Mısır', 70, false,
      false, 10 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Oliven', 'Zeytin', 70, false,
      false, 11 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Spinat', 'Ispanak', 70, false,
      false, 12 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Tomaten', 'Domates', 70, false,
      false, 13 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Jalapeños', 'Jalapeño', 70, false,
      false, 14 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Ei', 'Yumurta', 70, false,
      false, 15 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Mozzarella', 'Mozzarella', 70, false,
      false, 16 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values ('g-pizza-mix', 'Pizza Mix: 5 Beläge', 'Beläge', 'Malzemeler', 5, 5, 'label_values', 7)
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Rindersalami', 'Dana salam', 0, false,
      false, 1 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Putenschinken', 'Hindi jambon', 0, false,
      false, 2 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Sucuk', 'Sucuk', 0, false,
      false, 3 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Drehspieß-Fleisch', 'Döner eti', 0, false,
      false, 4 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Hähnchenfleisch', 'Tavuk eti', 0, false,
      false, 5 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Thunfisch', 'Ton balığı', 0, false,
      false, 6 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Champignons', 'Mantar', 0, false,
      false, 7 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Paprika', 'Biber', 0, false,
      false, 8 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Zwiebeln', 'Soğan', 0, false,
      false, 9 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Mais', 'Mısır', 0, false,
      false, 10 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Oliven', 'Zeytin', 0, false,
      false, 11 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Spinat', 'Ispanak', 0, false,
      false, 12 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Tomaten', 'Domates', 0, false,
      false, 13 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Jalapeños', 'Jalapeño', 0, false,
      false, 14 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Ei', 'Yumurta', 0, false,
      false, 15 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Mozzarella', 'Mozzarella', 0, false,
      false, 16 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values ('g-menu-getraenk', 'Menü-Getränk 0,33 l', 'Getränk', 'İçecek', 1, 1, 'label_values', 8)
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Cola', 'Cola', 0, false,
      false, 1 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Cola Light', 'Cola Light', 0, false,
      false, 2 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Fanta', 'Fanta', 0, false,
      false, 3 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Sprite', 'Sprite', 0, false,
      false, 4 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'Mezzo Mix', 'Mezzo Mix', 0, false,
      false, 5 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.option_groups (slug, admin_label, name_de, name_tr, min_select, max_select, ticket_format, sort)
    values ('g-lahmacun-rolle', 'Im Lahmacun gerollt (+1,00)', 'Im Lahmacun gerollt', 'Lahmacuna sarılı', 0, 1, 'plus_each', 9)
    on conflict (slug) do update set admin_label = excluded.admin_label, name_de = excluded.name_de,
      name_tr = excluded.name_tr, min_select = excluded.min_select, max_select = excluded.max_select,
      ticket_format = excluded.ticket_format, sort = excluded.sort;
insert into public.options
      (group_id, name_de, name_tr, price_delta_cents, is_default, is_exclusive, sort)
    select id, 'im Lahmacun gerollt', 'Lahmacuna sarılı', 100, false,
      false, 1 from public.option_groups where slug = 'g-lahmacun-rolle'
    on conflict (group_id, name_de) do update set name_tr = excluded.name_tr,
      price_delta_cents = excluded.price_delta_cents, is_default = excluded.is_default,
      is_exclusive = excluded.is_exclusive, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-01', id, '01', 'Linsensuppe / Mercimek Çorbası', null, 500,
      null, 1 from public.categories where slug = 'c-suppen'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-02', id, '02', 'Kuttelsuppe / İşkembe Çorbası', null, 600,
      null, 2 from public.categories where slug = 'c-suppen'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-03', id, '03', 'Fleischsuppe / Kelle Paça', null, 700,
      null, 3 from public.categories where slug = 'c-suppen'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-04', id, '04', 'Sucuk Toast', 'mit Knoblauchwurst & Goudakäse', 450,
      null, 4 from public.categories where slug = 'c-fruehstueck'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-05', id, '05', 'Drehspieß Sandwich', 'im Fladenbrot mit Salat & Soße', null,
      'a,c,g,4,7', 5 from public.categories where slug = 'c-drehspiess'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-05'), 'Hähnchen', 'Tavuk', 750, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-05'), 'Kalb', 'Dana', 850, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-05'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-05'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-05'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-05'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-05'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-05'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-05'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-05'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-89', id, '89', 'Gemüse Drehspieß Sandwich', 'im Fladenbrot mit gegr. Gemüse, Salat & Soße', null,
      'a,c,g,4,7', 6 from public.categories where slug = 'c-drehspiess'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-89'), 'Hähnchen', 'Tavuk', 800, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-89'), 'Kalb', 'Dana', 900, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-89'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-89'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-89'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-89'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-89'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-89'), id, 6 from public.ingredients where slug = 'gegr_gemuese'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-89'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-89'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-89'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-06', id, '06', 'Mega Drehspieß Sandwich', 'im Fladenbrot mit extra Fleisch, Salat & Soße', null,
      'a,c,g,4,7', 7 from public.categories where slug = 'c-drehspiess'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-06'), 'Hähnchen', 'Tavuk', 850, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-06'), 'Kalb', 'Dana', 950, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-06'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-06'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-06'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-06'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-06'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-06'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-06'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-06'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-07', id, '07', 'Mini Drehspieß Sandwich', 'im Fladenbrot mit Salat & Soße', null,
      'a,c,g,4,7', 8 from public.categories where slug = 'c-drehspiess'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-07'), 'Hähnchen', 'Tavuk', 650, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-07'), 'Kalb', 'Dana', 700, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-07'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-07'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-07'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-07'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-07'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-07'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-07'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-07'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-08', id, '08', 'Drehspieß Teller', 'mit Pommes oder Reis, Salat & Soße', null,
      'a,c,g,4,7', 9 from public.categories where slug = 'c-drehspiess'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-08'), 'Hähnchen', 'Tavuk', 1250, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-08'), 'Kalb', 'Dana', 1350, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-08'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-08'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-08'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-08'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-08'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-08'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-08'), id, 2 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-08'), id, 3 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-08'), id, 4 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-09', id, '09', 'Kleiner Drehspieß Teller', 'mit Salat & Soße', null,
      'a,c,g,4,7', 10 from public.categories where slug = 'c-drehspiess'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-09'), 'Hähnchen', 'Tavuk', 1050, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-09'), 'Kalb', 'Dana', 1150, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-09'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-09'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-09'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-09'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-09'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-09'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-09'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-09'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-10', id, '10', 'Iskender Drehspieß', 'auf Fladenbrotwürfeln mit Tomatensoße, Joghurt & zerlassener Butter', 1500,
      'a,c,g,4,7', 11 from public.categories where slug = 'c-drehspiess'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-10'), id, 1 from public.ingredients where slug = 'tomatensosse'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-10'), id, 2 from public.ingredients where slug = 'joghurt'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-10'), id, 3 from public.ingredients where slug = 'butter'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-10'), id, 1 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-11', id, '11', 'Drehspieß-Box', 'mit Pommes', null,
      'a,c,g,4,7', 12 from public.categories where slug = 'c-drehspiess'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-11'), 'Hähnchen', 'Tavuk', 750, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-11'), 'Kalb', 'Dana', 850, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-11'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-11'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-11'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-12', id, '12', 'Drehspieß Dürüm', 'mit Salat & Soße', null,
      'a,c,g,4,7', 13 from public.categories where slug = 'c-drehspiess'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-12'), 'Hähnchen', 'Tavuk', 800, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-12'), 'Kalb', 'Dana', 900, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-12'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-12'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-12'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-12'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-12'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-12'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-12'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-12'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-13', id, '13', 'Vegetar. Sandwich', 'im Fladenbrot mit Gemüse & Weichkäse', 600,
      'a,c,g', 14 from public.categories where slug = 'c-vegetarisch'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-13'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-13'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-13'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-13'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-13'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-13'), id, 6 from public.ingredients where slug = 'weichkaese'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-13'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-13'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-14', id, '14', 'Vegetarisches Dürüm', 'im Teigbrot mit Gemüse', 650,
      'a,c,g', 15 from public.categories where slug = 'c-vegetarisch'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-14'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-14'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-14'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-14'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-14'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-14'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-14'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-15', id, '15', 'Falafel Sandwich', 'im Fladenbrot mit Salat & Soße', 600,
      'a,c,g', 16 from public.categories where slug = 'c-vegetarisch'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-15'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-15'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-15'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-15'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-15'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-15'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-15'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-90', id, '90', 'Falafel Box', 'mit Pommes', 700,
      'a,c,g', 17 from public.categories where slug = 'c-vegetarisch'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-90'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-90'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-16', id, '16', 'Falafel Dürüm', 'im Teigbrot mit Salat & Soße', 700,
      'a,c,g', 18 from public.categories where slug = 'c-vegetarisch'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-16'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-16'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-16'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-16'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-16'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-16'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-16'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-17', id, '17', 'Falafel Teller', 'mit Pommes oder Reis, Salat & Soße', 1100,
      'a,c,g', 19 from public.categories where slug = 'c-vegetarisch'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-17'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-17'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-17'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-17'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-17'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-17'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-17'), id, 2 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-17'), id, 3 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-19', id, '19', 'Ramo''s Vegetarischer Teller', 'mit Pommes oder Reis, Gemüse, Salat & Soße', 1100,
      'a,c,g', 20 from public.categories where slug = 'c-vegetarisch'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-19'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-19'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-19'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-19'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-19'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-19'), id, 6 from public.ingredients where slug = 'gegr_gemuese'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-19'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-19'), id, 2 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-19'), id, 3 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-18', id, '18', 'Pommes', 'klein / groß', null,
      null, 21 from public.categories where slug = 'c-beilagen'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-18'), 'klein', 'Küçük', 350, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-18'), 'groß', 'Büyük', 450, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-100', id, '100', 'Reis', 'klein / groß', null,
      null, 22 from public.categories where slug = 'c-beilagen'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-100'), 'klein', 'Küçük', 350, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-100'), 'groß', 'Büyük', 450, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-92', id, '92', 'Açık Lahmacun', 'ohne alles', 500,
      'a,c,g', 23 from public.categories where slug = 'c-lahmacun'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-20', id, '20', 'Lahmacun', 'mit Salat & Soße', 650,
      'a,c,g', 24 from public.categories where slug = 'c-lahmacun'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-20'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-20'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-20'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-20'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-20'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-20'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-20'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-20'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-21', id, '21', 'Lahmacun mit Drehspieß', 'mit Drehspieß, Salat & Soße', null,
      'a,c,g,4,7', 25 from public.categories where slug = 'c-lahmacun'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-21'), 'Hähnchen', 'Tavuk', 900, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-21'), 'Kalb', 'Dana', 950, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-21'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-21'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-21'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-21'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-21'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-21'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-21'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-21'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-22', id, '22', 'Lahmacun Teller mit Drehspieß', '1 Stück mit Drehspieß, Salat & Soße', 1000,
      null, 26 from public.categories where slug = 'c-lahmacun'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-22'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-22'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-22'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-22'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-22'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-22'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-22'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-22'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-93', id, '93', 'Lahmacun Teller', '1 Stück mit Salat & Soße', 700,
      null, 27 from public.categories where slug = 'c-lahmacun'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-93'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-93'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-93'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-93'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-93'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-93'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-93'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-93'), id, 3 from public.option_groups where slug = 'g-extra-doener'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-23', id, '23', 'Pide mit Gouda & Käse', 'Teigschiffchen', 800,
      'a,c,g,2', 28 from public.categories where slug = 'c-pide'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-23'), id, 1 from public.option_groups where slug = 'g-extra-pide'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-24', id, '24', 'Pide mit Spinat & Käse', 'Teigschiffchen', 900,
      'a,c,g,2', 29 from public.categories where slug = 'c-pide'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-24'), id, 1 from public.option_groups where slug = 'g-extra-pide'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-25', id, '25', 'Pide mit Hackfleisch & Käse', 'Teigschiffchen', 1000,
      'a,c,g,2', 30 from public.categories where slug = 'c-pide'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-25'), id, 1 from public.option_groups where slug = 'g-extra-pide'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-26', id, '26', 'Pide mit Hackfleisch', 'Teigschiffchen', 900,
      'a,c,g', 31 from public.categories where slug = 'c-pide'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-26'), id, 1 from public.option_groups where slug = 'g-extra-pide'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-27', id, '27', 'Pide mit Sucuk', 'Teigschiffchen', 900,
      'a,c,g,1,2,3,5', 32 from public.categories where slug = 'c-pide'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-27'), id, 1 from public.option_groups where slug = 'g-extra-pide'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-28', id, '28', 'Pide mit Thunfisch', 'Teigschiffchen', 900,
      'a,c,g,2,4,7', 33 from public.categories where slug = 'c-pide'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-28'), id, 1 from public.option_groups where slug = 'g-extra-pide'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-29', id, '29', 'Pide mit frischem Gemüse', 'Teigschiffchen', 1000,
      'a,c,g,2', 34 from public.categories where slug = 'c-pide'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-29'), id, 1 from public.option_groups where slug = 'g-extra-pide'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-30', id, '30', 'Pizza Margherita', null, 700,
      'a,e,g', 35 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-30'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-31', id, '31', 'Pizza Rindersalami', null, 900,
      'a,c,g,2,3,4', 36 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-31'), id, 1 from public.ingredients where slug = 'rindersalami'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-31'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-32', id, '32', 'Pizza Putenschinken', '(Formfleischschinken)', 900,
      'a,c,g,2,3,4,6', 37 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-32'), id, 1 from public.ingredients where slug = 'putenschinken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-32'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-33', id, '33', 'Pizza Mista', 'mit Rindersalami & Putenschinken', 900,
      'a,c,g,2,3,4,6', 38 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-33'), id, 1 from public.ingredients where slug = 'rindersalami'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-33'), id, 2 from public.ingredients where slug = 'putenschinken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-33'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-34', id, '34', 'Pizza Sucuk', 'mit türk. Knoblauchwurst', 900,
      'a,c,g,1,2,3,5', 39 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-34'), id, 1 from public.ingredients where slug = 'sucuk'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-34'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-35', id, '35', 'Pizza Special', 'mit Spinat & Ei', 900,
      'a,e,g,2', 40 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-35'), id, 1 from public.ingredients where slug = 'spinat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-35'), id, 2 from public.ingredients where slug = 'ei'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-35'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-36', id, '36', 'Pizza Mozzarella', 'mit Mozzarella & Tomaten', 900,
      'a,e,g,2', 41 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-36'), id, 1 from public.ingredients where slug = 'mozzarella'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-36'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-36'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-37', id, '37', 'Pizza Funghi', 'mit frischen Champignons', 850,
      'a,e,g,2', 42 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-37'), id, 1 from public.ingredients where slug = 'champignons'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-37'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-38', id, '38', 'Pizza Thunfisch', 'mit Zwiebeln', 900,
      'a,c,d,g,2', 43 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-38'), id, 1 from public.ingredients where slug = 'thunfisch'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-38'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-38'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-39', id, '39', 'Pizza Drehspieß', 'mit Fleisch & Zwiebeln', 950,
      'a,c,g,2,4,7', 44 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-39'), id, 1 from public.ingredients where slug = 'doenerfleisch'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-39'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-39'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-40', id, '40', 'Pizza Fitness', 'mit Hähnchenfleisch & Champignons', 950,
      'a,c,g,2,4,7', 45 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-40'), id, 1 from public.ingredients where slug = 'haehnchen'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-40'), id, 2 from public.ingredients where slug = 'champignons'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-40'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-41', id, '41', 'Pizza Hähnchen', 'mit gegrilltem Hähnchenfleisch', 1050,
      'a,c,g,2', 46 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-41'), id, 1 from public.ingredients where slug = 'haehnchen'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-41'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-42', id, '42', 'Pizza Lahmacun', 'mit Paprika, Champignons, Spinat & Mais', 950,
      'a,c,g,2', 47 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-42'), id, 1 from public.ingredients where slug = 'paprika'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-42'), id, 2 from public.ingredients where slug = 'champignons'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-42'), id, 3 from public.ingredients where slug = 'spinat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-42'), id, 4 from public.ingredients where slug = 'mais'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-42'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-43', id, '43', 'Pizza Spezial', 'mit Salami, Zwiebeln, Paprika, Spinat, Putenschinken & Champignons', 1000,
      'a,c,g,2,3,4,5', 48 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-43'), id, 1 from public.ingredients where slug = 'rindersalami'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-43'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-43'), id, 3 from public.ingredients where slug = 'paprika'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-43'), id, 4 from public.ingredients where slug = 'spinat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-43'), id, 5 from public.ingredients where slug = 'putenschinken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-43'), id, 6 from public.ingredients where slug = 'champignons'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-43'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-44', id, '44', 'Pizza Vitamino', 'mit Champignons, Paprika, Spinat & Ei', 1000,
      'a,c,g,2', 49 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-44'), id, 1 from public.ingredients where slug = 'champignons'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-44'), id, 2 from public.ingredients where slug = 'paprika'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-44'), id, 3 from public.ingredients where slug = 'spinat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-44'), id, 4 from public.ingredients where slug = 'ei'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-44'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-45', id, '45', 'Pizza Vegetari', 'mit Mais, Tomaten, Oliven, Paprika, Zwiebeln & Champignons', 1000,
      'a,c,g,2', 50 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-45'), id, 1 from public.ingredients where slug = 'mais'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-45'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-45'), id, 3 from public.ingredients where slug = 'oliven'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-45'), id, 4 from public.ingredients where slug = 'paprika'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-45'), id, 5 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-45'), id, 6 from public.ingredients where slug = 'champignons'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-45'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-46', id, '46', 'Pizza Chef', 'mit Salami, Champignons, Putenschinken (Formfleischschinken), Jalapeños & Ei', 1000,
      'a,e,g,2,3,4,6', 51 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-46'), id, 1 from public.ingredients where slug = 'rindersalami'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-46'), id, 2 from public.ingredients where slug = 'champignons'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-46'), id, 3 from public.ingredients where slug = 'putenschinken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-46'), id, 4 from public.ingredients where slug = 'jalapenos'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-46'), id, 5 from public.ingredients where slug = 'ei'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-46'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-47', id, '47', 'Pizza Mix', 'mit 5 Belägen nach Wahl', 1150,
      'a,c,g,4,7', 52 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-47'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-47'), id, 2 from public.option_groups where slug = 'g-pizza-mix'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-102', id, '102', 'Pizza Ramos', 'mit Ei', 800,
      'a,c,g,4,7', 53 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-102'), id, 1 from public.ingredients where slug = 'ei'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-102'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-103', id, '103', 'Pizza Brot', null, 600,
      'a,c,g,4,7', 54 from public.categories where slug = 'c-pizza'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-103'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-53', id, '53', 'Calzone mit Drehspieß & Zwiebeln', null, 1000,
      'a,c,g,2,4,7', 55 from public.categories where slug = 'c-calzone'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-53'), id, 1 from public.ingredients where slug = 'doenerfleisch'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-53'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-53'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-54', id, '54', 'Calzone mit Spinat & Käse', null, 1000,
      'a,c,g,2', 56 from public.categories where slug = 'c-calzone'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-54'), id, 1 from public.ingredients where slug = 'spinat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-54'), id, 2 from public.ingredients where slug = 'kaese'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-54'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-55', id, '55', 'Calzone mit Sucuk & Käse', null, 1000,
      'a,c,g,1,2,3,5', 57 from public.categories where slug = 'c-calzone'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-55'), id, 1 from public.ingredients where slug = 'sucuk'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-55'), id, 2 from public.ingredients where slug = 'kaese'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-55'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-56', id, '56', 'Calzone mit Thunfisch & Zwiebeln', null, 1000,
      'a,c,d,g,2', 58 from public.categories where slug = 'c-calzone'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-56'), id, 1 from public.ingredients where slug = 'thunfisch'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-56'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-56'), id, 1 from public.option_groups where slug = 'g-pizza-extra'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-94', id, '94', 'Beilagensalat', null, 350,
      null, 59 from public.categories where slug = 'c-salate'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-48', id, '48', 'Frühlingssalat', 'mit grünem Salat, Tomaten, Gurken, Zwiebeln & Mais', 700,
      null, 60 from public.categories where slug = 'c-salate'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-48'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-48'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-48'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-48'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-48'), id, 5 from public.ingredients where slug = 'mais'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-49', id, '49', 'Thunfisch Salat', 'mit grünem Salat, Tomaten, Zwiebeln, Oliven & Peperoni', 800,
      null, 61 from public.categories where slug = 'c-salate'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-49'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-49'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-49'), id, 3 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-49'), id, 4 from public.ingredients where slug = 'oliven'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-49'), id, 5 from public.ingredients where slug = 'peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-50', id, '50', 'Fitness Salat', 'mit grünem Salat, Tomaten, Gurken, Mais, Paprika & Dönerfleisch', 900,
      null, 62 from public.categories where slug = 'c-salate'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-50'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-50'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-50'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-50'), id, 4 from public.ingredients where slug = 'mais'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-50'), id, 5 from public.ingredients where slug = 'paprika'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-51', id, '51', 'Mix Salat', 'mit grünem Salat, Tomaten, Gurken, Kraut, Weichkäse & Oliven', 750,
      'c,g,2', 63 from public.categories where slug = 'c-salate'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-51'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-51'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-51'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-51'), id, 4 from public.ingredients where slug = 'weisskohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-51'), id, 5 from public.ingredients where slug = 'weichkaese'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-51'), id, 6 from public.ingredients where slug = 'oliven'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-52', id, '52', 'Hähnchen Salat', 'gemischter Salat mit gegrilltem Hähnchenfleisch', 1000,
      null, 64 from public.categories where slug = 'c-salate'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-52'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-52'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-52'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-52'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-57', id, '57', 'Adana Kebap', 'Hackfleischspieß, mit Pommes oder Reis & Salat', 1350,
      'a,c,g', 65 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-57'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-57'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-57'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-57'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-57'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-58', id, '58', 'Adana Kebap', 'Hackfleischspieß, mit Pommes oder Reis & Salat', 1600,
      'a,c,g', 66 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-58'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-58'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-58'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-58'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-58'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-59', id, '59', 'Kuzu Şiş', 'Lammspieß, mit Pommes oder Reis & Salat', 1500,
      'a,c,g', 67 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-59'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-59'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-59'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-59'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-59'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-60', id, '60', 'Kuzu Şiş', 'Lammspieß, mit Pommes oder Reis & Salat', 1750,
      'a,c,g', 68 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-60'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-60'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-60'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-60'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-60'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-61', id, '61', 'Tavuk Şiş', 'Hähnchenbrust-Spieß, mit Pommes oder Reis & Salat', 1250,
      'a,c,g', 69 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-61'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-61'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-61'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-61'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-61'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-62', id, '62', 'Tavuk Şiş', 'Hähnchenbrust-Spieß, mit Pommes oder Reis & Salat', 1450,
      'a,c,g', 70 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-62'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-62'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-62'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-62'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-62'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-64', id, '64', 'Adana-Tavuk Şiş', '1x Hackfleischspieß + 1x Hähnchenspieß, mit Pommes oder Reis & Salat', 1600,
      'a,c,g', 71 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-64'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-64'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-64'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-64'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-64'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-66', id, '66', 'Tavuk Kanat', 'Hähnchenflügel, mit Pommes oder Reis & Salat', 1400,
      'a,c,g', 72 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-66'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-66'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-66'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-66'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-66'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-67', id, '67', 'Yoğurtlu Adana', 'Hackfleischspieß mit Joghurt', 1700,
      'a,c,g', 73 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-67'), id, 1 from public.ingredients where slug = 'joghurt'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-68', id, '68', 'Beyti Sarma', 'Hackfleischspieß gerollt mit Tomatensoße, Joghurt & Beilage', 1700,
      'a,c,g', 74 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-68'), id, 1 from public.ingredients where slug = 'tomatensosse'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-68'), id, 2 from public.ingredients where slug = 'joghurt'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-68'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-69', id, '69', 'Ali Nazik', 'Hackfleischspieß mit Joghurt, Aubergine & Knoblauch', 1700,
      'a,c,g', 75 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-69'), id, 1 from public.ingredients where slug = 'joghurt'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-69'), id, 2 from public.ingredients where slug = 'knoblauch'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-70', id, '70', 'Cevapcici', '8 Stück, mit Pommes oder Reis & Salat', 1600,
      'a,c,g', 76 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-70'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-70'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-70'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-70'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-70'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-71', id, '71', 'Köfte Teller', 'Gegrillte Frikadellen, mit Pommes oder Reis & Salat', 1600,
      'a,c,g', 77 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-71'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-71'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-71'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-71'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-71'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-71a', id, '71a', 'Köfte Sandwich', 'Gegrillte Frikadellen, mit Salat & Soße', 900,
      'a,c,g', 78 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-71a'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-71a'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-71a'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-71a'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-71a'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-71a'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-71a'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-72', id, '72', 'Pirzola', 'Lammkotelett(s), mit Pommes oder Reis & Salat', 1950,
      'a,c,g', 79 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-72'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-72'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-72'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-72'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-72'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-74', id, '74', 'Karışık Izgara (1 Person)', 'Gemischter Grillteller mit Pommes oder Reis & Salat', 2300,
      'a,c,g', 80 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-74'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-74'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-74'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-74'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-74'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-75', id, '75', 'Karışık Izgara (2 Personen)', 'Gemischter Grillteller mit Pommes oder Reis & Salat', 4400,
      'a,c,g', 81 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-75'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-75'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-75'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-75'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-75'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-76', id, '76', 'Karışık Izgara (3 Personen)', 'Gemischter Grillteller mit Pommes oder Reis & Salat', 6300,
      'a,c,g', 82 from public.categories where slug = 'c-grill'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-76'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-76'), id, 2 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-76'), id, 3 from public.ingredients where slug = 'gegr_tomate'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-76'), id, 4 from public.ingredients where slug = 'gegr_peperoni'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-76'), id, 1 from public.option_groups where slug = 'g-beilage'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-77', id, '77', 'Adana Dürüm', 'mit Salat & Soße', 950,
      'a,c,g', 83 from public.categories where slug = 'c-grill-duerum'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-77'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-77'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-77'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-77'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-77'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-77'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-77'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-77'), id, 3 from public.option_groups where slug = 'g-lahmacun-rolle'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-78', id, '78', 'Tavuk Şiş Dürüm', 'mit Salat & Soße', 900,
      'a,c,g', 84 from public.categories where slug = 'c-grill-duerum'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-78'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-78'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-78'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-78'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-78'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-78'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-78'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-78'), id, 3 from public.option_groups where slug = 'g-lahmacun-rolle'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-79', id, '79', 'Kuzu Şiş Dürüm', 'mit Salat & Soße', 1050,
      'a,c,g', 85 from public.categories where slug = 'c-grill-duerum'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-79'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-79'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-79'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-79'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-79'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-79'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-79'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-79'), id, 3 from public.option_groups where slug = 'g-lahmacun-rolle'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-80', id, '80', 'Hamburger', null, 650,
      'a,c,g,k', 86 from public.categories where slug = 'c-burger'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-80'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-80'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-80'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-80'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-80'), id, 5 from public.ingredients where slug = 'burgersosse'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-81', id, '81', 'Hamburger Menü', 'mit Pommes + 1 Softdrink 0,33 l', 1100,
      'a,c,g,k', 87 from public.categories where slug = 'c-burger'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-81'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-81'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-81'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-81'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-81'), id, 5 from public.ingredients where slug = 'burgersosse'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-81'), id, 1 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-82', id, '82', 'Cheeseburger', null, 700,
      'a,c,g,k,2', 88 from public.categories where slug = 'c-burger'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-82'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-82'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-82'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-82'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-82'), id, 5 from public.ingredients where slug = 'burgersosse'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-83', id, '83', 'Cheeseburger Menü', 'mit Pommes + 1 Softdrink 0,33 l', 1150,
      'a,c,g,k,2', 89 from public.categories where slug = 'c-burger'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-83'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-83'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-83'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-83'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-83'), id, 5 from public.ingredients where slug = 'burgersosse'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-83'), id, 1 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-84', id, '84', 'Chickenburger', null, 650,
      'a,c,g', 90 from public.categories where slug = 'c-burger'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-84'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-84'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-84'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-84'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-84'), id, 5 from public.ingredients where slug = 'burgersosse'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-85', id, '85', 'Chickenburger Menü', 'mit Pommes + 1 Softdrink 0,33 l', 1100,
      'a,c,g', 91 from public.categories where slug = 'c-burger'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-85'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-85'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-85'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-85'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-85'), id, 5 from public.ingredients where slug = 'burgersosse'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-85'), id, 1 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-87', id, '87', 'Chicken Nuggets', 'mit Pommes', 850,
      'a,c,g', 92 from public.categories where slug = 'c-burger'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-m1', id, 'M1', 'Drehspieß Sandwich Menü', 'mit Pommes & 1 Softgetränk 0,33 l', null,
      null, 93 from public.categories where slug = 'c-spar-menue'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-m1'), 'Hähnchen', 'Tavuk', 1100, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-m1'), 'Kalb', 'Dana', 1200, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m1'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m1'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m1'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m1'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m1'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m1'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m1'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m1'), id, 3 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-m2', id, 'M2', 'Drehspieß Dürüm Menü', 'mit Pommes & 1 Softgetränk 0,33 l', null,
      null, 94 from public.categories where slug = 'c-spar-menue'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-m2'), 'Hähnchen', 'Tavuk', 1150, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-m2'), 'Kalb', 'Dana', 1250, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m2'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m2'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m2'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m2'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m2'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m2'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m2'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m2'), id, 3 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-m3', id, 'M3', 'Lahmacun Menü mit Drehspießfleisch', 'mit Pommes & 1 Softgetränk 0,33 l', null,
      null, 95 from public.categories where slug = 'c-spar-menue'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-m3'), 'Hähnchen', 'Tavuk', 1200, true, 1)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_variants
      (product_id, name_de, name_tr, price_cents, is_default, sort)
    values ((select id from public.products where slug = 'p-m3'), 'Kalb', 'Dana', 1350, false, 2)
    on conflict (product_id, name_de) do update set name_tr = excluded.name_tr, price_cents = excluded.price_cents,
      is_default = excluded.is_default, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m3'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m3'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m3'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m3'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m3'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m3'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m3'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m3'), id, 3 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-m4', id, 'M4', 'Falafel Sandwich Menü', 'mit Pommes & 1 Softgetränk 0,33 l', 1050,
      null, 96 from public.categories where slug = 'c-spar-menue'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m4'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m4'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m4'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m4'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m4'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m4'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m4'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m4'), id, 3 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-m5', id, 'M5', 'Falafel Dürüm Menü', 'mit Pommes & 1 Softgetränk 0,33 l', 1100,
      null, 97 from public.categories where slug = 'c-spar-menue'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m5'), id, 1 from public.ingredients where slug = 'salat'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m5'), id, 2 from public.ingredients where slug = 'tomaten'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m5'), id, 3 from public.ingredients where slug = 'gurken'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m5'), id, 4 from public.ingredients where slug = 'zwiebeln'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_ingredients (product_id, ingredient_id, sort)
    select (select id from public.products where slug = 'p-m5'), id, 5 from public.ingredients where slug = 'rotkohl'
    on conflict (product_id, ingredient_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m5'), id, 1 from public.option_groups where slug = 'g-sosse'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m5'), id, 2 from public.option_groups where slug = 'g-scharf'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.product_option_groups (product_id, group_id, sort)
    select (select id from public.products where slug = 'p-m5'), id, 3 from public.option_groups where slug = 'g-menu-getraenk'
    on conflict (product_id, group_id) do update set sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-baklava', id, null, 'Baklava', null, 450,
      'a,h', 98 from public.categories where slug = 'c-dessert'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-halka-tatli', id, null, 'Halka Tatlı', null, 200,
      null, 99 from public.categories where slug = 'c-dessert'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-cola-0-33-l', id, null, 'Cola 0,33 l', null, 250,
      '1,3,9', 100 from public.categories where slug = 'c-kalte-getraenke'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-cola-light-0-33-l', id, null, 'Cola Light 0,33 l', null, 250,
      '1,3,9,12', 101 from public.categories where slug = 'c-kalte-getraenke'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-fanta-0-33-l', id, null, 'Fanta 0,33 l', null, 250,
      '1,3', 102 from public.categories where slug = 'c-kalte-getraenke'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-sprite-0-33-l', id, null, 'Sprite 0,33 l', null, 250,
      '1', 103 from public.categories where slug = 'c-kalte-getraenke'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-mezzo-mix-0-33-l', id, null, 'Mezzo Mix 0,33 l', null, 250,
      '1,3,9', 104 from public.categories where slug = 'c-kalte-getraenke'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-mineralwasser-0-5-l', id, null, 'Mineralwasser 0,5 l', null, 250,
      null, 105 from public.categories where slug = 'c-kalte-getraenke'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-stilles-wasser-0-5-l', id, null, 'Stilles Wasser 0,5 l', null, 250,
      null, 106 from public.categories where slug = 'c-kalte-getraenke'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.products (slug, category_id, code, name, description, base_price_cents, allergens, sort)
    select 'p-ayran-0-25-l', id, null, 'Ayran 0,25 l', null, 200,
      null, 107 from public.categories where slug = 'c-kalte-getraenke'
    on conflict (slug) do update set category_id = excluded.category_id, code = excluded.code, name = excluded.name,
      description = excluded.description, base_price_cents = excluded.base_price_cents,
      allergens = excluded.allergens, sort = excluded.sort;
insert into public.dining_tables (name, sort) values ('Tisch 1', 1) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 2', 2) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 3', 3) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 4', 4) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 5', 5) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 6', 6) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 7', 7) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 8', 8) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 9', 9) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 10', 10) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 11', 11) on conflict (name) do nothing;
insert into public.dining_tables (name, sort) values ('Tisch 12', 12) on conflict (name) do nothing;
update public.settings set restaurant_name = 'Ramo''s Döner & Grill House',
  ticket_header = 'RAMO''S · KÜCHE', quick_notes = '[{"de":"Soße separat","tr":"Sos ayrı"},{"de":"wenig Soße","tr":"Az sos"},{"de":"extra Soße","tr":"Bol sos"},{"de":"gut durch","tr":"İyi pişmiş"},{"de":"extra knusprig","tr":"Ekstra çıtır"}]'::jsonb,
  cancel_reasons = '[{"de":"Gast hat storniert","tr":"Müşteri vazgeçti"},{"de":"Falsch eingegeben","tr":"Yanlış giriş"},{"de":"Nicht lieferbar","tr":"Ürün kalmadı"},{"de":"Sonstiges","tr":"Diğer","freeText":true}]'::jsonb, allergen_legend = '[{"code":"a","de":"Glutenhaltiges Getreide","tr":"Glutenli tahıl"},{"code":"b","de":"Krebstiere","tr":"Kabuklu deniz ürünleri"},{"code":"c","de":"Eier","tr":"Yumurta"},{"code":"d","de":"Fisch","tr":"Balık"},{"code":"e","de":"Erdnüsse","tr":"Yer fıstığı"},{"code":"f","de":"Soja","tr":"Soya"},{"code":"g","de":"Milch/Laktose","tr":"Süt/Laktoz"},{"code":"h","de":"Schalenfrüchte","tr":"Sert kabuklu yemişler"},{"code":"i","de":"Sellerie","tr":"Kereviz"},{"code":"j","de":"Senf","tr":"Hardal"},{"code":"k","de":"Sesam","tr":"Susam"},{"code":"l","de":"Schwefeldioxid/Sulfite","tr":"Kükürt dioksit/Sülfit"},{"code":"m","de":"Lupinen","tr":"Acı bakla"},{"code":"n","de":"Weichtiere","tr":"Yumuşakçalar"},{"code":"1","de":"mit Farbstoff","tr":"Renklendirici"},{"code":"2","de":"mit Konservierungsstoff","tr":"Koruyucu"},{"code":"3","de":"mit Antioxidationsmittel","tr":"Antioksidan"},{"code":"4","de":"mit Geschmacksverstärker","tr":"Lezzet artırıcı"},{"code":"5","de":"geschwefelt","tr":"Kükürtlenmiş"},{"code":"6","de":"geschwärzt","tr":"Karartılmış"},{"code":"7","de":"mit Phosphat","tr":"Fosfat"},{"code":"8","de":"mit Milcheiweiß","tr":"Süt proteini"},{"code":"9","de":"koffeinhaltig","tr":"Kafeinli"},{"code":"10","de":"chininhaltig","tr":"Kininli"},{"code":"11","de":"mit Süßungsmittel","tr":"Tatlandırıcı"},{"code":"12","de":"enthält eine Phenylalaninquelle","tr":"Fenilalanin kaynağı içerir"},{"code":"13","de":"gewachst","tr":"Mumlanmış"}]'::jsonb where id = 1;
commit;
