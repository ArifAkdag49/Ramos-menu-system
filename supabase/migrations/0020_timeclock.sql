-- 0020 — Mesai takibi (işletme talebi, 12.11.2026): Emir Et panelindeki sistemin aynısı.
--
-- Duvarda TEK basılı QR var; girişte de çıkışta da o okutulur. Kimin okuttuğunu QR değil TELEFON belirler:
-- admin panelden tek kullanımlık eşleştirme linki üretir (24 saat geçerli), personel açınca telefonuna uzun
-- ömürlü bir cihaz anahtarı yazılır. Giriş mi çıkış mı olduğuna sunucu karar verir.
--
-- Takip edilen personel giriş hesaplarından (`profiles`) AYRIDIR: bulaşıkçı ya da kuryenin hesabı olmaz.
--
-- Kurallar (Emir Et `Service/Staff.php` ile aynı):
--   * 2 dakika içindeki ikinci okutma sayılmaz ('ignored').
--   * 16 saatten eski açık mesai kapatılmaz: panelde "çıkış eksik" görünür, yeni okutma yeni mesai açar.
--   * Mola takibi yok: süre = çıkış − giriş. Gece yarısını geçen mesai BAŞLADIĞI Berlin gününe yazılır.
--   * Telefonu olmayan personel için admin panelden başlatır/bitirir ('manual').
--   * Elle düzeltme sebep ister; eski saatler `timeclock_shift_edits`'te kalır.
--   * Personel silinmez, pasife alınır: kayıtlar durur, telefon bağı kopar.
--   * Kayıtlar 2 yıl saklanır (MiLoG §17): 760 günden eski mesailer okutma sırasında silinir.
--   * Konum SAKLANMAZ: okutma anında yalnız "restorana yakın mı" sonucu (true/false) yazılır. Doğrulanamayan
--     okutma ENGELLENMEZ, panelde işaretlenir. Restoran koordinatı admin restorandayken panelden kaydedilir.
--
-- Anahtarlar (QR, eşleştirme kodu, cihaz anahtarı) düz hâliyle yalnız QR değeri saklanır (basılı olduğu için
-- gizli değildir); eşleştirme kodu ve cihaz anahtarı yalnız sha256 özetiyle tutulur.
--
-- Okutma sayfası girişsizdir: `timeclock_config`, `timeclock_pair`, `timeclock_scan` anon'a açılır (dosya
-- sonunda, toplu revoke'tan SONRA). Üçü de 128/256 bit rastgele anahtar olmadan hiçbir şey döndürmez.

-- ---------- tablolar ----------
create table public.timeclock_settings (
  id             int primary key default 1 check (id = 1),
  qr_token       text not null check (qr_token ~ '^[0-9a-f]{32}$'),
  location_check boolean not null default true,
  lat            double precision check (lat between -90 and 90),
  lng            double precision check (lng between -180 and 180),
  radius_m       int not null default 150 check (radius_m between 50 and 1000),
  updated_at     timestamptz not null default now()
);
insert into public.timeclock_settings (qr_token) values (encode(extensions.gen_random_bytes(16), 'hex'));

create table public.timeclock_staff (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 120),
  is_active       boolean not null default true,
  device_hash     text unique check (device_hash ~ '^[0-9a-f]{64}$'),
  pair_hash       text unique check (pair_hash ~ '^[0-9a-f]{64}$'),
  pair_expires_at timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create table public.timeclock_shifts (
  id              uuid primary key default gen_random_uuid(),
  staff_id        uuid not null references public.timeclock_staff (id),
  -- Mesainin BAŞLADIĞI Berlin günü (takvim günü; sipariş iş günü değil).
  work_date       date not null,
  started_at      timestamptz not null,
  ended_at        timestamptz check (ended_at is null or ended_at > started_at),
  in_source       text not null default 'scan' check (in_source in ('scan', 'manual')),
  out_source      text check (out_source is null or out_source in ('scan', 'manual')),
  -- null = kontrol yapılmadı, true = yakında, false = doğrulanamadı.
  in_location_ok  boolean,
  out_location_ok boolean,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index timeclock_shifts_staff_idx on public.timeclock_shifts (staff_id, started_at);
create index timeclock_shifts_date_idx on public.timeclock_shifts (work_date);

create table public.timeclock_shift_edits (
  id             uuid primary key default gen_random_uuid(),
  shift_id       uuid not null references public.timeclock_shifts (id) on delete cascade,
  old_started_at timestamptz,
  old_ended_at   timestamptz,
  new_started_at timestamptz not null,
  new_ended_at   timestamptz,
  reason         text not null check (length(btrim(reason)) between 1 and 200),
  edited_by      uuid references public.profiles (id) on delete set null,
  edited_at      timestamptz not null default now()
);
create index timeclock_shift_edits_shift_idx on public.timeclock_shift_edits (shift_id);
create index timeclock_shift_edits_edited_by_idx on public.timeclock_shift_edits (edited_by);  -- FK indeksi

-- Okuma/yazma yalnız aşağıdaki RPC'lerle: hiçbir role tablo izni yok, politika yok.
alter table public.timeclock_settings enable row level security;
alter table public.timeclock_staff enable row level security;
alter table public.timeclock_shifts enable row level security;
alter table public.timeclock_shift_edits enable row level security;
revoke all on public.timeclock_settings, public.timeclock_staff, public.timeclock_shifts,
              public.timeclock_shift_edits from anon, authenticated;

-- ---------- yardımcılar ----------
create function internal.timeclock_sha(p text) returns text
language sql immutable set search_path = '' as $$
  select encode(sha256(convert_to(p, 'UTF8')), 'hex');
$$;

/** timestamptz → Berlin "YYYY-MM-DD HH:MM". */
create function internal.timeclock_local(p timestamptz) returns text
language sql stable set search_path = '' as $$
  select to_char(p at time zone 'Europe/Berlin', 'YYYY-MM-DD HH24:MI');
$$;

/** İki nokta arası metre (haversine). */
create function internal.timeclock_distance_m(lat1 float8, lng1 float8, lat2 float8, lng2 float8)
returns float8 language sql immutable set search_path = '' as $$
  select 6371000.0 * 2 * atan2(sqrt(a), sqrt(1 - a))
  from (select sin(radians(lat2 - lat1) / 2) ^ 2
               + cos(radians(lat1)) * cos(radians(lat2)) * sin(radians(lng2 - lng1) / 2) ^ 2 as a) x;
$$;

/**
 * Giriş/çıkış kararı. Personel satırı kilitlenir: iki hızlı okutma aynı anda gelirse iki açık mesai oluşmasın.
 * Dönüş: {action: in|out|ignored, name, open, at, minutes?}.
 */
create function internal.timeclock_toggle(p_staff_id uuid, p_source text, p_located boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_name text;
  v_last public.timeclock_shifts;
  v_now  timestamptz := now();
  v_event timestamptz;
begin
  select s.name into v_name from public.timeclock_staff s where s.id = p_staff_id for update;
  if not found then perform internal.fail('timeclock_not_found'); end if;

  select * into v_last from public.timeclock_shifts sh
   where sh.staff_id = p_staff_id order by sh.started_at desc limit 1;

  if v_last.id is not null and p_source = 'scan' then
    v_event := coalesce(v_last.ended_at, v_last.started_at);
    if v_now - v_event < interval '2 minutes' then
      return jsonb_build_object('action', 'ignored', 'name', v_name, 'open', v_last.ended_at is null,
                                'at', internal.timeclock_local(v_event));
    end if;
  end if;

  if v_last.id is not null and v_last.ended_at is null and v_now - v_last.started_at < interval '16 hours' then
    update public.timeclock_shifts
       set ended_at = v_now, out_source = p_source, out_location_ok = p_located, updated_at = v_now
     where id = v_last.id;
    return jsonb_build_object('action', 'out', 'name', v_name, 'open', false,
                              'at', internal.timeclock_local(v_now),
                              'minutes', floor(extract(epoch from v_now - v_last.started_at) / 60)::int);
  end if;

  -- Eski açık mesai olduğu gibi kalır: panelde "çıkış eksik" görünür.
  insert into public.timeclock_shifts (staff_id, work_date, started_at, in_source, in_location_ok)
  values (p_staff_id, (v_now at time zone 'Europe/Berlin')::date, v_now, p_source, p_located);

  -- 2 yıl saklama (MiLoG §17): ucuz, indeksli; ayrı bir zamanlayıcı gerekmez.
  delete from public.timeclock_shifts sh where sh.started_at < v_now - interval '760 days';

  return jsonb_build_object('action', 'in', 'name', v_name, 'open', true, 'at', internal.timeclock_local(v_now));
end $$;

/** "YYYY-MM-DD HH:MM" Berlin yerel saat aralığı; çıkış girişten sonra, en fazla 24 saat. */
create function internal.timeclock_range(p_start timestamp, p_end timestamp)
returns table (from_ts timestamptz, to_ts timestamptz)
language plpgsql immutable set search_path = '' as $$
begin
  if p_start is null then perform internal.fail('timeclock_bad_range'); end if;
  from_ts := p_start at time zone 'Europe/Berlin';
  to_ts := case when p_end is null then null else p_end at time zone 'Europe/Berlin' end;
  if to_ts is not null and (to_ts <= from_ts or to_ts - from_ts > interval '24 hours') then
    perform internal.fail('timeclock_bad_range');
  end if;
  return next;
end $$;

create function internal.timeclock_reason(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := nullif(btrim(coalesce(p, '')), '');
begin
  if v is null then perform internal.fail('reason_required'); end if;
  if length(v) > 200 then perform internal.fail('reason_too_long'); end if;
  return v;
end $$;

create function internal.timeclock_name(p text) returns text
language plpgsql immutable set search_path = '' as $$
declare v text := regexp_replace(btrim(coalesce(p, '')), '\s+', ' ', 'g');
begin
  if length(v) not between 1 and 120 then perform internal.fail('timeclock_name_invalid'); end if;
  return v;
end $$;

-- ---------- personelin telefonu (girişsiz) ----------

/** Okutma sayfası konum isteyecek mi. Yanlış QR → timeclock_bad_qr. */
create function public.timeclock_config(p_qr text) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.timeclock_settings;
begin
  select * into v from public.timeclock_settings where id = 1;
  if v.qr_token is distinct from coalesce(p_qr, '') then perform internal.fail('timeclock_bad_qr'); end if;
  return jsonb_build_object('location', v.location_check and v.lat is not null and v.lng is not null);
end $$;

/** Tek kullanımlık kodu telefona bağlar. Dönüş: {token, name}; token telefonda saklanır. */
create function public.timeclock_pair(p_code text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_id uuid; v_name text; v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  select s.id, s.name into v_id, v_name from public.timeclock_staff s
   where s.pair_hash = internal.timeclock_sha(coalesce(p_code, '')) and s.pair_expires_at > now() and s.is_active
   for update;
  if not found then perform internal.fail('timeclock_bad_pair'); end if;
  update public.timeclock_staff
     set device_hash = internal.timeclock_sha(v_token), pair_hash = null, pair_expires_at = null, updated_at = now()
   where id = v_id;
  return jsonb_build_object('token', v_token, 'name', v_name);
end $$;

/** Telefondan QR okutma. Konum yalnız bu anda karşılaştırılır, hiçbir yere yazılmaz. */
create function public.timeclock_scan(p_qr text, p_device text, p_lat float8 default null,
                                      p_lng float8 default null, p_accuracy float8 default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare v public.timeclock_settings; v_staff uuid; v_located boolean;
begin
  select * into v from public.timeclock_settings where id = 1;
  if v.qr_token is distinct from coalesce(p_qr, '') then perform internal.fail('timeclock_bad_qr'); end if;
  if coalesce(p_device, '') = '' then perform internal.fail('timeclock_not_paired'); end if;
  select s.id into v_staff from public.timeclock_staff s
   where s.device_hash = internal.timeclock_sha(p_device) and s.is_active;
  if not found then perform internal.fail('timeclock_not_paired'); end if;

  if not v.location_check or v.lat is null or v.lng is null then
    v_located := null;
  elsif p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    v_located := false;
  else
    -- GPS'in iç mekân sapmasına en fazla 100 m pay.
    v_located := internal.timeclock_distance_m(v.lat, v.lng, p_lat, p_lng)
                 <= v.radius_m + least(100, greatest(0, coalesce(p_accuracy, 0)));
  end if;

  return internal.timeclock_toggle(v_staff, 'scan', v_located);
end $$;

-- ---------- admin ----------

/** Ayarlar + personel listesi (pasifler sonda). */
create function public.timeclock_overview() returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v public.timeclock_settings; v_staff jsonb;
begin
  perform internal.require_role('admin');
  select * into v from public.timeclock_settings where id = 1;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', s.id, 'name', s.name, 'active', s.is_active, 'paired', s.device_hash is not null,
           'working', o.started_at is not null,
           'since', case when o.started_at is not null then internal.timeclock_local(o.started_at) end)
         order by s.is_active desc, lower(s.name)), '[]'::jsonb)
    into v_staff
    from public.timeclock_staff s
    left join lateral (select max(x.started_at) as started_at from public.timeclock_shifts x
                        where x.staff_id = s.id and x.ended_at is null
                          and x.started_at > now() - interval '16 hours') o on true;
  return jsonb_build_object(
    'settings', jsonb_build_object('qr_token', v.qr_token, 'location_check', v.location_check,
                                   'has_location', v.lat is not null and v.lng is not null, 'radius_m', v.radius_m),
    'staff', v_staff);
end $$;

create function public.timeclock_add_staff(p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  perform internal.require_role('admin');
  insert into public.timeclock_staff (name) values (internal.timeclock_name(p_name)) returning id into v_id;
  return v_id;
end $$;

/** Ad ve/veya aktiflik. Pasife alınınca telefon bağı ve bekleyen eşleştirme kodu silinir. */
create function public.timeclock_update_staff(p_id uuid, p_name text default null, p_active boolean default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('admin');
  update public.timeclock_staff s
     set name = case when p_name is null then s.name else internal.timeclock_name(p_name) end,
         is_active = coalesce(p_active, s.is_active),
         device_hash = case when p_active is false then null else s.device_hash end,
         pair_hash = case when p_active is false then null else s.pair_hash end,
         pair_expires_at = case when p_active is false then null else s.pair_expires_at end,
         updated_at = now()
   where s.id = p_id;
  if not found then perform internal.fail('timeclock_not_found'); end if;
end $$;

/** Tek kullanımlık eşleştirme kodu (24 saat). Eski telefon, yeni kod kullanılana kadar çalışır. */
create function public.timeclock_pair_code(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_code text := encode(extensions.gen_random_bytes(16), 'hex'); v_exp timestamptz := now() + interval '24 hours';
begin
  perform internal.require_role('admin');
  update public.timeclock_staff
     set pair_hash = internal.timeclock_sha(v_code), pair_expires_at = v_exp, updated_at = now()
   where id = p_id and is_active;
  if not found then perform internal.fail('timeclock_not_found'); end if;
  return jsonb_build_object('code', v_code, 'expires', internal.timeclock_local(v_exp));
end $$;

/** Telefonu olmayan personel: admin başlatır/bitirir (çift okutma kuralı uygulanmaz). */
create function public.timeclock_clock_manually(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('admin');
  if not exists (select 1 from public.timeclock_staff s where s.id = p_id and s.is_active) then
    perform internal.fail('timeclock_not_found');
  end if;
  return internal.timeclock_toggle(p_id, 'manual', null);
end $$;

/**
 * Haftalık tablo ham verisi (pazartesi..pazar). Biçimleme istemcide (`timeclockLogic.ts`).
 * Dönüş: {days, staff:[{id,name,active}], shifts:[{id,staff_id,work_date,start,end,minutes,missing_end,
 * edited,manual,location_failed}]}.
 */
create function public.timeclock_week(p_monday date) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare v_days jsonb; v_staff jsonb; v_shifts jsonb;
begin
  perform internal.require_role('admin');
  if p_monday is null or extract(isodow from p_monday) <> 1 then perform internal.fail('timeclock_bad_week'); end if;
  select jsonb_agg(to_char(p_monday + i, 'YYYY-MM-DD') order by i) into v_days from generate_series(0, 6) i;
  select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'name', s.name, 'active', s.is_active)
                            order by lower(s.name)), '[]'::jsonb)
    into v_staff from public.timeclock_staff s;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', sh.id, 'staff_id', sh.staff_id, 'work_date', to_char(sh.work_date, 'YYYY-MM-DD'),
           'start', internal.timeclock_local(sh.started_at),
           'end', case when sh.ended_at is not null then internal.timeclock_local(sh.ended_at) end,
           'minutes', case when sh.ended_at is not null
                           then floor(extract(epoch from sh.ended_at - sh.started_at) / 60)::int end,
           'missing_end', sh.ended_at is null and now() - sh.started_at >= interval '16 hours',
           'edited', exists (select 1 from public.timeclock_shift_edits e where e.shift_id = sh.id),
           'manual', sh.in_source = 'manual' or coalesce(sh.out_source = 'manual', false),
           'location_failed', coalesce(sh.in_location_ok = false, false) or coalesce(sh.out_location_ok = false, false))
         order by sh.started_at), '[]'::jsonb)
    into v_shifts
    from public.timeclock_shifts sh
   where sh.work_date between p_monday and p_monday + 6;
  return jsonb_build_object('days', v_days, 'staff', v_staff, 'shifts', v_shifts);
end $$;

/** Elle mesai ekler. `p_start`/`p_end` Berlin yerel saati; çıkış boşsa mesai açık kalır. */
create function public.timeclock_add_shift(p_staff_id uuid, p_start timestamp, p_end timestamp, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_from timestamptz; v_to timestamptz; v_reason text; v_id uuid;
begin
  v_me := internal.require_role('admin');
  if not exists (select 1 from public.timeclock_staff s where s.id = p_staff_id) then
    perform internal.fail('timeclock_not_found');
  end if;
  select r.from_ts, r.to_ts into v_from, v_to from internal.timeclock_range(p_start, p_end) r;
  v_reason := internal.timeclock_reason(p_reason);
  insert into public.timeclock_shifts (staff_id, work_date, started_at, ended_at, in_source, out_source)
  values (p_staff_id, (v_from at time zone 'Europe/Berlin')::date, v_from, v_to, 'manual',
          case when v_to is not null then 'manual' end)
  returning id into v_id;
  insert into public.timeclock_shift_edits (shift_id, new_started_at, new_ended_at, reason, edited_by)
  values (v_id, v_from, v_to, v_reason, v_me.id);
  return v_id;
end $$;

/** Mesai saatini düzeltir; eski değerler geçmişte kalır. */
create function public.timeclock_edit_shift(p_id uuid, p_start timestamp, p_end timestamp, p_reason text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_old public.timeclock_shifts; v_from timestamptz; v_to timestamptz; v_reason text;
begin
  v_me := internal.require_role('admin');
  select r.from_ts, r.to_ts into v_from, v_to from internal.timeclock_range(p_start, p_end) r;
  v_reason := internal.timeclock_reason(p_reason);
  select * into v_old from public.timeclock_shifts sh where sh.id = p_id for update;
  if not found then perform internal.fail('timeclock_not_found'); end if;
  update public.timeclock_shifts
     set work_date = (v_from at time zone 'Europe/Berlin')::date, started_at = v_from, ended_at = v_to,
         out_source = case when v_to is null then null else coalesce(v_old.out_source, 'manual') end,
         updated_at = now()
   where id = p_id;
  insert into public.timeclock_shift_edits
    (shift_id, old_started_at, old_ended_at, new_started_at, new_ended_at, reason, edited_by)
  values (p_id, v_old.started_at, v_old.ended_at, v_from, v_to, v_reason, v_me.id);
end $$;

/** Düzeltme geçmişi, yeniden eskiye. */
create function public.timeclock_shift_edits(p_id uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
begin
  perform internal.require_role('admin');
  return (select coalesce(jsonb_agg(jsonb_build_object(
            'old_start', case when e.old_started_at is not null then internal.timeclock_local(e.old_started_at) end,
            'old_end', case when e.old_ended_at is not null then internal.timeclock_local(e.old_ended_at) end,
            'new_start', internal.timeclock_local(e.new_started_at),
            'new_end', case when e.new_ended_at is not null then internal.timeclock_local(e.new_ended_at) end,
            'reason', e.reason, 'by', p.display_name, 'at', internal.timeclock_local(e.edited_at))
          order by e.edited_at desc), '[]'::jsonb)
          from public.timeclock_shift_edits e
          left join public.profiles p on p.id = e.edited_by
          where e.shift_id = p_id);
end $$;

/** Konum ayarları. Verilmeyen (null) alan değişmez; lat/lng birlikte verilir. */
create function public.timeclock_save_settings(p_location_check boolean default null, p_lat float8 default null,
                                               p_lng float8 default null, p_radius_m int default null)
returns void language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('admin');
  if (p_lat is null) <> (p_lng is null) or abs(p_lat) > 90 or abs(p_lng) > 180 then
    perform internal.fail('timeclock_bad_location');
  end if;
  update public.timeclock_settings
     set location_check = coalesce(p_location_check, location_check),
         lat = coalesce(p_lat, lat), lng = coalesce(p_lng, lng),
         radius_m = case when p_radius_m is null then radius_m else least(1000, greatest(50, p_radius_m)) end,
         updated_at = now()
   where id = 1;
end $$;

/** Eski QR'ı geçersiz kılar: basılı olan yeniden basılmalı. */
create function public.timeclock_rotate_qr() returns text
language plpgsql security definer set search_path = '' as $$
declare v text := encode(extensions.gen_random_bytes(16), 'hex');
begin
  perform internal.require_role('admin');
  update public.timeclock_settings set qr_token = v, updated_at = now() where id = 1;
  return v;
end $$;

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

-- 0016: menu-sync iç fonksiyonları yalnız service_role (Edge Function).
revoke execute on function public.menu_sync_pull(text, timestamptz, int) from public, anon, authenticated;
revoke execute on function public.menu_sync_push(text, jsonb) from public, anon, authenticated;
revoke execute on function public.menu_sync_touch(text, text) from public, anon, authenticated;
grant execute on function public.menu_sync_pull(text, timestamptz, int) to service_role;
grant execute on function public.menu_sync_push(text, jsonb) to service_role;
grant execute on function public.menu_sync_touch(text, text) to service_role;

-- 0011: müşteri QR menüsü anon'a açık — toplu revoke'tan SONRA.
grant execute on function public.public_menu() to anon, authenticated;
-- 0020: mesai okutma sayfası (girişsiz personel telefonu) anon'a açık.
grant execute on function public.timeclock_config(text) to anon, authenticated;
grant execute on function public.timeclock_pair(text) to anon, authenticated;
grant execute on function public.timeclock_scan(text, text, float8, float8, float8) to anon, authenticated;
