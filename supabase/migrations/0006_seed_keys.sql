-- 0006 — seed upsert'leri için doğal anahtarlar
create unique index product_variants_product_name on public.product_variants (product_id, name_de);
create unique index options_group_name on public.options (group_id, name_de);
