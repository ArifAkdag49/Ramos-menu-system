-- 0016 — İki yönlü menü eşitlemesi (Ramo's ⇄ ikinci sistem: kendi VPS'inde, kendi Postgres'iyle çalışan
-- arx-panel QR menüsü). Eşitlenen alanlar: ad, açıklama, fiyat, tükendi + ürün oluşturma/silme + varyant fiyatları.
-- Çakışma kuralı ÜRÜN SATIRI başına "son yazan kazanır": karşı tarafın damgası (`updated_at`) bizim
-- `products.sync_updated_at` damgamızdan BÜYÜK ise uygulanır, değilse reddedilir ve bizim güncel satırımız
-- yanıtta döner (karşı taraf onu benimser).
--
-- Kimlik 0012/0015 kalıbıdır: her istemcinin kendi rastgele anahtarı (token) vardır, düz hâli ASLA saklanmaz
-- (yalnız sha256 hex özeti). Edge Function `supabase/functions/menu-sync` (verify_jwt KAPALI) anahtarın
-- özetiyle aşağıdaki service_role fonksiyonlarını çağırır.
--
-- Bu dosya YALNIZ menüye dokunur: sipariş, fiş, yazıcı ve `settings` satırlarına hiçbir yolu yoktur.
--
-- KURAL (0010/0011/0012/0013/0015 notları): dosya sonundaki toplu revoke/grant bloğundan SONRA
-- ready_push_targets daraltması, SDP / station_feed / menu_sync daraltmaları ve public_menu anon izni tekrarlanır.

-- ---------- 1) değişim damgası ----------
-- `updated_at` her yazımda (sıra, görsel, malzeme…) değişir; eşitleme için YALNIZ karşı tarafı ilgilendiren
-- alanlar damgayı ileri atar. Böylece "sıralamayı değiştirdim" diye bütün menü yeniden gönderilmez.
alter table public.products add column sync_updated_at timestamptz not null default now();
update public.products set sync_updated_at = coalesce(updated_at, now());
create index products_sync_updated_idx on public.products (sync_updated_at, id);

create function internal.products_sync_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.sync_updated_at := now();
  return new;
end $$;

-- Eşitlenen alanlar (WHEN): ad, açıklama, fiyat, tükendi, aktiflik, arşiv, kategori, kod.
-- `sort`, `image_path`, `allergens` vb. damgayı BÜYÜTMEZ.
create trigger products_sync_stamp before update on public.products
  for each row when (new.name             is distinct from old.name
                  or new.description      is distinct from old.description
                  or new.base_price_cents is distinct from old.base_price_cents
                  or new.is_sold_out      is distinct from old.is_sold_out
                  or new.is_active        is distinct from old.is_active
                  or new.archived_at      is distinct from old.archived_at
                  or new.category_id      is distinct from old.category_id
                  or new.code             is distinct from old.code)
  execute function internal.products_sync_stamp();

-- Varyant fiyatı/adı/aktifliği de eşitlenir: değişiklik ÜRÜNÜN damgasını ileri atar (karşı taraf ürünü çeker).
create function internal.product_variants_sync_stamp() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    update public.products p set sync_updated_at = now() where p.id = old.product_id;
  else
    update public.products p set sync_updated_at = now() where p.id = new.product_id;
    if tg_op = 'UPDATE' and old.product_id is distinct from new.product_id then
      update public.products p set sync_updated_at = now() where p.id = old.product_id;
    end if;
  end if;
  return null;
end $$;

create trigger product_variants_sync_stamp_ins after insert on public.product_variants
  for each row execute function internal.product_variants_sync_stamp();
create trigger product_variants_sync_stamp_del after delete on public.product_variants
  for each row execute function internal.product_variants_sync_stamp();
create trigger product_variants_sync_stamp_upd after update on public.product_variants
  for each row when (new.price_cents is distinct from old.price_cents
                  or new.name_de     is distinct from old.name_de
                  or new.name_tr     is distinct from old.name_tr
                  or new.is_active   is distinct from old.is_active
                  or new.product_id  is distinct from old.product_id)
  execute function internal.product_variants_sync_stamp();

-- ---------- 2) eşitleme istemcileri ----------
-- Anahtar düz hâliyle ASLA saklanmaz: yalnız sha256 hex özeti. Düz anahtar yalnız create yanıtında bir kez döner.
create table public.menu_sync_clients (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 1 and 60),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  last_error   text
);
alter table public.menu_sync_clients enable row level security;
revoke all on public.menu_sync_clients from anon, authenticated;
-- Admin listeyi okur ama token_hash sütununu göremez (sütun düzeyinde izin). Yazım yalnız RPC'lerle.
grant select (id, name, is_active, created_at, last_seen_at, last_error) on public.menu_sync_clients to authenticated;
create policy menu_sync_clients_admin_read on public.menu_sync_clients for select to authenticated
  using ((select public.has_role('admin')));

-- ---------- 3) admin RPC'leri ----------
-- Dönüş: {id, token}. Düz anahtar yalnız burada, bir kez döner; karşı sistem onu kendi sırlarında saklar.
create function public.create_menu_sync_client(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_token text; v_id uuid;
begin
  perform internal.require_role('admin');
  if length(v_name) not between 1 and 60 then perform internal.fail('menu_sync_client_name_invalid'); end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.menu_sync_clients (name, token_hash)
  values (v_name, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  returning id into v_id;
  perform internal.audit('menu_sync_client_create', 'menu_sync_client', v_id::text, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

-- Kayıt silinmez (son görülme/hata geçmişi kalsın), pasifleşir: anahtar anında geçersiz olur (401).
create function public.revoke_menu_sync_client(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text;
begin
  perform internal.require_role('admin');
  update public.menu_sync_clients c set is_active = false, last_error = null
   where c.id = p_id and c.is_active returning c.name into v_name;
  if not found then perform internal.fail('menu_sync_client_not_found'); end if;
  perform internal.audit('menu_sync_client_revoke', 'menu_sync_client', p_id::text, jsonb_build_object('name', v_name));
end $$;

-- ---------- 4) ortak yardımcılar ----------
-- Ürünün eşitleme gövdesi. pull ile push'un `current` alanı AYNI biçimi döndürsün diye tek yerde durur.
create function internal.menu_sync_product(p public.products) returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'id', p.id,
    'code', p.code,
    'category_id', p.category_id,
    'name', p.name,
    'description', p.description,
    'price_cents', p.base_price_cents,
    'is_sold_out', p.is_sold_out,
    'is_active', p.is_active,
    'archived', p.archived_at is not null,
    'sort', p.sort,
    'allergens', p.allergens,
    'image_path', p.image_path,
    'variants', (select coalesce(jsonb_agg(jsonb_build_object(
                          'id', v.id, 'name_de', v.name_de, 'name_tr', v.name_tr, 'price_cents', v.price_cents,
                          'is_default', v.is_default, 'sort', v.sort, 'is_active', v.is_active)
                        order by v.sort, v.price_cents), '[]'::jsonb)
                 from public.product_variants v where v.product_id = p.id),
    'sync_updated_at', p.sync_updated_at);
$$;

-- `slug` sütunu not null unique'tir ve kullanıcıya hiç gösterilmez; admin arayüzüyle AYNI kurallarla addan
-- üretilir (apps/web/src/features/admin/menu/menuAdminLogic.ts · slugify): önce Türkçe/Almanca harfler elle
-- eşlenir (ß→ss, ı/İ→i, ş/Ş→s, ğ/Ğ→g, ç/Ç→c, ü/Ü→u, ö/Ö→o, ä/Ä→a), sonra küçük harf, aksan ayrıştırma (NFD),
-- kalan her şey '-' ve baştaki/sondaki '-' atılır.
create function internal.menu_slug(p_name text) returns text
language sql immutable set search_path = '' as $$
  select btrim(
           regexp_replace(
             regexp_replace(
               normalize(lower(translate(replace(coalesce(p_name, ''), 'ß', 'ss'),
                                         'ıİşŞğĞçÇüÜöÖäÄ', 'iissggccuuooaa')), NFD),
               '[̀-ͯ]', '', 'g'),
             '[^a-z0-9]+', '-', 'g'),
           '-');
$$;

-- ---------- 5) service_role: Edge Function (menu-sync) ----------
-- Karşı tarafın çekmesi. Dönüş:
--   {client: 'ok'|'unknown', now: <ISO>, categories: [...], products: [...]}
-- Kategoriler (azlar) HER ZAMAN tam listedir; ürünler `sync_updated_at > p_since` (p_since null ise hepsi),
-- damgaya göre sıralı ve p_limit ile sınırlıdır. Arşivlenen/pasif ürünler de DÖNER (karşı taraf onları silsin).
-- Sayfa sınırı damga eşitliğinde kesilmez: son damganın TÜM satırları aynı sayfada gelir — yoksa tek işlemde
-- güncellenen p_limit'ten çok ürün imleci hiç ilerletemezdi.
create function public.menu_sync_pull(p_token_hash text, p_since timestamptz, p_limit int default 500)
returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.menu_sync_clients;
  v_now timestamptz := now();
  v_limit int := least(greatest(coalesce(p_limit, 500), 1), 2000);
  v_cut timestamptz;
  v_products jsonb;
begin
  select * into v_c from public.menu_sync_clients c where c.token_hash = p_token_hash and c.is_active;
  if not found then
    return jsonb_build_object('client', 'unknown', 'now', v_now,
                              'categories', '[]'::jsonb, 'products', '[]'::jsonb);
  end if;
  -- Son görülme 5 sn'de bir yazılır (sık çağrıda gereksiz satır sürümü üretilmesin).
  update public.menu_sync_clients c set last_seen_at = v_now
   where c.id = v_c.id and (c.last_seen_at is null or c.last_seen_at < v_now - interval '5 seconds');

  select max(x.sync_updated_at) into v_cut
    from (select p.sync_updated_at from public.products p
          where p_since is null or p.sync_updated_at > p_since
          order by p.sync_updated_at, p.id
          limit v_limit) x;

  select coalesce(jsonb_agg(internal.menu_sync_product(p) order by p.sync_updated_at, p.id), '[]'::jsonb)
    into v_products
    from public.products p
   where (p_since is null or p.sync_updated_at > p_since)
     and p.sync_updated_at <= v_cut;

  return jsonb_build_object(
    'client', 'ok',
    'now', v_now,
    'categories', (select coalesce(jsonb_agg(jsonb_build_object(
                            'id', c.id, 'slug', c.slug, 'name_de', c.name_de, 'name_tr', c.name_tr,
                            'name_en', c.name_en, 'name_ar', c.name_ar, 'sort', c.sort,
                            'is_active', c.is_active, 'is_beverage', c.is_beverage)
                          order by c.sort, c.name_de), '[]'::jsonb)
                   from public.categories c),
    'products', coalesce(v_products, '[]'::jsonb));
end $$;

-- Karşı tarafın yazması. Dönüş: {client: 'ok'|'unknown', now: <ISO>, results: [...]}.
-- Her kalem: {ramos_id, code, category_ramos_id, name, description, price_cents, is_sold_out, deleted,
--             variants: [{id, price_cents}], updated_at}
-- Kural:
--   * Hedef satır: `ramos_id` varsa o; yoksa `code` ile arşivlenmemiş ürün (tekrar gönderilen "oluştur"
--     kopya ürün üretmesin); ikisi de tutmazsa YENİ ürün açılır.
--   * `ramos_id` verilip bulunamazsa 'not_found' — sessizce yeni ürün açılmaz.
--   * Son yazan kazanır: `updated_at > products.sync_updated_at` değilse 'rejected_older' + bizim satırımız
--     ('current', pull ile aynı biçim).
--   * YAZILAN alanlar yalnız: name, description, base_price_cents, is_sold_out, category_id (var olan kategori
--     verilirse), arşiv (deleted) ve verilen varyantların price_cents'i. `code` yalnız YENİ üründe yazılır
--     (eşleşme anahtarıdır); sıra, görsel, alerjen, malzeme, seçenek, fiyat/yazıcı ayarları ASLA.
--   * Alan hiç gelmediyse ya da null ise değişmez; yalnız `description` açıkça null/boş gelirse temizlenir.
--   * `deleted: true` donanımsal silme DEĞİLDİR (siparişler ürüne bakar): is_active = false, archived_at = now().
-- Durumlar: 'applied' | 'created' | 'rejected_older' | 'not_found' | 'invalid'.
create function public.menu_sync_push(p_token_hash text, p_items jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_c public.menu_sync_clients;
  v_now timestamptz := now();
  v_results jsonb := '[]'::jsonb;
  v_item jsonb;
  v_idx int := 0;
  v_p public.products;
  v_found boolean;
  v_ts timestamptz;
  v_id uuid;
  v_cat uuid;
  v_code text;
  v_name text;
  v_desc text;
  v_desc_set boolean;
  v_price int;
  v_sold boolean;
  v_deleted boolean;
  v_slug text;
  v_variants int;
  v_status text;
begin
  select * into v_c from public.menu_sync_clients c where c.token_hash = p_token_hash and c.is_active;
  if not found then
    return jsonb_build_object('client', 'unknown', 'now', v_now, 'results', '[]'::jsonb);
  end if;
  update public.menu_sync_clients c set last_seen_at = v_now where c.id = v_c.id;
  -- Yankı önleme: karşı tarafın yazdığını ona geri haber vermeyiz (internal.menu_sync_notify).
  -- Yalnız bu işlem (transaction) için geçerlidir.
  perform set_config('menu_sync.suppress_notify', '1', true);

  if jsonb_typeof(p_items) is distinct from 'array' then
    return jsonb_build_object('client', 'ok', 'now', v_now, 'results', '[]'::jsonb);
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_idx := v_idx + 1;
    -- Kalem başına alt-işlem: bozuk bir kalem yalnız kendini düşürür, paketin geri kalanı işlenmeye devam eder.
    begin
      if jsonb_typeof(v_item) is distinct from 'object' then
        v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', null,
                                                     'status', 'invalid', 'reason', 'item_not_object');
        continue;
      end if;

      v_ts := case when jsonb_typeof(v_item->'updated_at') = 'string' then (v_item->>'updated_at')::timestamptz end;
      if v_ts is null then
        v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', null,
                                                     'status', 'invalid', 'reason', 'updated_at_invalid');
        continue;
      end if;

      v_id   := case when jsonb_typeof(v_item->'ramos_id') = 'string' then (v_item->>'ramos_id')::uuid end;
      v_cat  := case when jsonb_typeof(v_item->'category_ramos_id') = 'string'
                     then (v_item->>'category_ramos_id')::uuid end;
      v_code := nullif(btrim(coalesce(v_item->>'code', '')), '');
      v_name := nullif(btrim(coalesce(v_item->>'name', '')), '');
      v_desc_set := v_item ? 'description';
      v_desc := nullif(btrim(coalesce(v_item->>'description', '')), '');
      v_price := case when jsonb_typeof(v_item->'price_cents') = 'number' then (v_item->>'price_cents')::int end;
      v_sold := case when jsonb_typeof(v_item->'is_sold_out') = 'boolean' then (v_item->>'is_sold_out')::boolean end;
      v_deleted := coalesce(case when jsonb_typeof(v_item->'deleted') = 'boolean'
                                 then (v_item->>'deleted')::boolean end, false);

      if v_item ? 'name' and jsonb_typeof(v_item->'name') <> 'null' and v_name is null then
        v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', v_id,
                                                     'status', 'invalid', 'reason', 'name_invalid');
        continue;
      end if;
      if v_price is not null and v_price < 0 then
        v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', v_id,
                                                     'status', 'invalid', 'reason', 'price_invalid');
        continue;
      end if;
      if v_cat is not null and not exists (select 1 from public.categories c where c.id = v_cat) then
        v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', v_id,
                                                     'status', 'invalid', 'reason', 'category_not_found');
        continue;
      end if;

      -- Hedef satır.
      v_found := false;
      if v_id is not null then
        select * into v_p from public.products p where p.id = v_id for update;
        v_found := found;
        if not v_found then
          v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', v_id, 'status', 'not_found');
          continue;
        end if;
      elsif v_code is not null then
        select * into v_p from public.products p
         where p.code = v_code and p.archived_at is null for update;
        v_found := found;
      end if;

      if v_found then
        if v_ts <= v_p.sync_updated_at then
          v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', v_p.id,
                                                       'status', 'rejected_older',
                                                       'current', internal.menu_sync_product(v_p));
          continue;
        end if;
        if v_deleted then
          update public.products p
             set is_active = false, archived_at = coalesce(p.archived_at, v_now), sync_updated_at = v_now
           where p.id = v_p.id;
        else
          update public.products p
             set name             = coalesce(v_name, p.name),
                 description      = case when v_desc_set then v_desc else p.description end,
                 base_price_cents = coalesce(v_price, p.base_price_cents),
                 is_sold_out      = coalesce(v_sold, p.is_sold_out),
                 category_id      = coalesce(v_cat, p.category_id),
                 sync_updated_at  = v_now
           where p.id = v_p.id;
        end if;
        v_status := 'applied';
      else
        -- Yeni ürün: kategori, ad ve fiyat zorunlu. "Silindi" bilgisi olmayan ürünü diriltmez.
        if v_deleted then
          v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', null, 'status', 'not_found');
          continue;
        end if;
        if v_cat is null or v_name is null or v_price is null then
          v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', null, 'status', 'invalid',
                                                       'reason', 'create_fields_missing');
          continue;
        end if;
        v_slug := internal.menu_slug(v_name);
        if coalesce(v_slug, '') = '' then
          v_slug := 'x-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
        end if;
        while exists (select 1 from public.products p where p.slug = v_slug) loop
          v_slug := v_slug || '-' || left(replace(gen_random_uuid()::text, '-', ''), 8);
        end loop;
        insert into public.products (slug, category_id, code, name, description, base_price_cents,
                                     is_sold_out, is_active, sort, sync_updated_at)
        values (v_slug, v_cat, v_code, v_name, v_desc, v_price, coalesce(v_sold, false), true,
                coalesce((select max(p.sort) from public.products p where p.category_id = v_cat), 0) + 10, v_now)
        returning * into v_p;
        v_status := 'created';
      end if;

      -- Varyant fiyatları: yalnız bu ürünün varyantları, yalnız price_cents.
      v_variants := 0;
      if jsonb_typeof(v_item->'variants') = 'array' then
        with w as (
          select (e->>'id')::uuid as id, greatest((e->>'price_cents')::int, 0) as price
          from jsonb_array_elements(v_item->'variants') e
          where jsonb_typeof(e) = 'object'
            and jsonb_typeof(e->'price_cents') = 'number'
            and (e->>'id') ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$')
        update public.product_variants v set price_cents = w.price
          from w where v.id = w.id and v.product_id = v_p.id;
        get diagnostics v_variants = row_count;
      end if;

      v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', v_p.id, 'status', v_status,
                                                   'variants', v_variants);
    exception when others then
      -- Beklenmeyen kalem hatası (bozuk uuid/sayı, kısıt ihlali…): yalnız o kalem düşer.
      v_results := v_results || jsonb_build_object('index', v_idx, 'ramos_id', null, 'status', 'invalid',
                                                   'reason', left(sqlerrm, 200));
    end;
  end loop;

  return jsonb_build_object('client', 'ok', 'now', v_now, 'results', v_results);
end $$;

-- Karşı tarafın "buradayım / şu hatayı aldım" bildirimi. Dönüş: 'ok' | 'unknown' (hata fırlatmaz).
create function public.menu_sync_touch(p_token_hash text, p_error text) returns text
language plpgsql security definer set search_path = '' as $$
begin
  update public.menu_sync_clients c
     set last_seen_at = now(), last_error = left(nullif(btrim(p_error), ''), 500)
   where c.token_hash = p_token_hash and c.is_active;
  if not found then return 'unknown'; end if;
  return 'ok';
end $$;

-- ---------- 6) anında bildirim (Ramo's → karşı taraf) ----------
-- 0010'daki notify-ready hattının aynısı: URL ve sır Vault'ta durur (adlar: menu_sync_notify_url,
-- menu_sync_notify_secret), migration'a/repoya GİRMEZ. Yoksa tetikleyici sessizce çıkar.
-- Bildirim bir uyarıdır, veri taşımaz: gövde {"source":"ramos"} — karşı taraf bunu alınca kendi imlecinden
-- pull yapar. Hiçbir hata menü yazımını bozmaz (yalnız uyarı loglanır).
--
-- Seyreltme (debounce): tek satırlık durum tablosu. 3 sn içinde ikinci istek gönderilmez — toplu güncelleme
-- tek bildirim üretir. Pencereye denk gelen bir değişiklik bildirimsiz kalabilir; karşı tarafın ayrıca
-- periyodik (ör. 60 sn) pull yapması BEKLENİR (bkz. supabase/functions/menu-sync/logic.ts sözleşmesi).
create table internal.menu_sync_notify_state (
  id               int primary key check (id = 1),
  last_notified_at timestamptz
);
insert into internal.menu_sync_notify_state (id) values (1);

create function internal.menu_sync_notify() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_url text; v_secret text;
begin
  -- menu_sync_push'un kendi yazımı karşı tarafa geri bildirilmez (yankı).
  if coalesce(current_setting('menu_sync.suppress_notify', true), '') = '1' then
    return null;
  end if;
  update internal.menu_sync_notify_state s set last_notified_at = now()
   where s.id = 1 and (s.last_notified_at is null or s.last_notified_at < now() - interval '3 seconds');
  if not found then
    return null;
  end if;
  select ds.decrypted_secret into v_url
    from vault.decrypted_secrets ds where ds.name = 'menu_sync_notify_url';
  select ds.decrypted_secret into v_secret
    from vault.decrypted_secrets ds where ds.name = 'menu_sync_notify_secret';
  if v_url is null or v_secret is null then
    return null;
  end if;
  perform net.http_post(
    url := v_url,
    body := jsonb_build_object('source', 'ramos'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-sync-secret', v_secret),
    timeout_milliseconds := 5000);
  return null;
exception when others then
  raise warning 'menu_sync_notify: %', sqlerrm;
  return null;
end $$;

create trigger products_menu_sync_notify after insert or update or delete on public.products
  for each statement execute function internal.menu_sync_notify();
create trigger product_variants_menu_sync_notify after insert or update or delete on public.product_variants
  for each statement execute function internal.menu_sync_notify();

-- ---------- toplu fonksiyon yetkileri (önceki migration'lardaki kalıp) ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;

-- 0010: ready_push_targets yalnız service_role.
revoke execute on function public.ready_push_targets(uuid) from public, anon, authenticated;
grant execute on function public.ready_push_targets(uuid) to service_role;

-- 0012: SDP iç fonksiyonları yalnız service_role (Edge Function).
revoke execute on function public.sdp_claim_next(text) from public, anon, authenticated;
revoke execute on function public.sdp_complete(text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.sdp_claim_next(text) to service_role;
grant execute on function public.sdp_complete(text, uuid, boolean, text) to service_role;

-- 0015: station-feed iç fonksiyonları yalnız service_role (Edge Function).
revoke execute on function public.station_feed_claim(text) from public, anon, authenticated;
revoke execute on function public.station_feed_complete(text, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.station_feed_heartbeat(text, text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.station_feed_claim(text) to service_role;
grant execute on function public.station_feed_complete(text, uuid, boolean, text) to service_role;
grant execute on function public.station_feed_heartbeat(text, text, boolean, jsonb, text) to service_role;

-- 0016: menu-sync iç fonksiyonları yalnız service_role (Edge Function). Anahtar özetini bilen herkes istemci
-- gibi davranabileceği için personel oturumlarına da KAPALI.
revoke execute on function public.menu_sync_pull(text, timestamptz, int) from public, anon, authenticated;
revoke execute on function public.menu_sync_push(text, jsonb) from public, anon, authenticated;
revoke execute on function public.menu_sync_touch(text, text) from public, anon, authenticated;
grant execute on function public.menu_sync_pull(text, timestamptz, int) to service_role;
grant execute on function public.menu_sync_push(text, jsonb) to service_role;
grant execute on function public.menu_sync_touch(text, text) to service_role;

-- 0011: anon'un çağırabildiği TEK fonksiyon — toplu revoke'tan SONRA.
grant execute on function public.public_menu() to anon, authenticated;
