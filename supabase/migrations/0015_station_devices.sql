-- 0015 — Arka plan yazıcı istasyonu: yerel Android uygulamasının ön plan servisi (uygulama kapalı / ekran
-- kararmışken) fişleri `supabase/functions/station-feed` üzerinden çeker ve aynı Wi-Fi'daki yazıcıya basar.
--
-- Servis kullanıcı oturumu taşıyamaz: Epson SDP (0012) tasarımı gibi her cihazın kendi rastgele anahtarı
-- (token) vardır; Edge Function (verify_jwt KAPALI) anahtarın sha256 özetiyle aşağıdaki service_role
-- fonksiyonlarını çağırır. Kuyruk kuralları 0013'ün `internal.*` yardımcılarıyla AYNIDIR; iş yalnız
-- `print_route = 'station'` iken ve yazıcı adresi doluyken verilir. Kuyrukta `claimed_by = 'station-bg:<cihaz id>'`
-- (ön plandaki web istasyonu 'station:<id>' ile karışmaz).
--
-- KURAL (0010/0011/0012/0013 notları): dosya sonundaki toplu revoke/grant bloğundan SONRA ready_push_targets
-- daraltması, SDP ve station_feed_* daraltmaları ve public_menu anon izni tekrarlanır.

-- ---------- istasyon cihazları ----------
-- Anahtar düz hâliyle ASLA saklanmaz: yalnız sha256 hex özeti. Düz anahtar yalnız register yanıtında bir kez döner.
create table public.station_devices (
  id              uuid primary key default gen_random_uuid(),
  name            text not null check (length(btrim(name)) between 1 and 60),
  token_hash      text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by      uuid references public.profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  last_seen_at    timestamptz,
  last_printed_at timestamptz,
  last_error      text
);
create index station_devices_created_by_idx on public.station_devices (created_by);  -- FK indeksi
alter table public.station_devices enable row level security;
revoke all on public.station_devices from anon, authenticated;
-- Mutfak/admin listeyi okur ama token_hash sütununu göremez (sütun düzeyinde izin). Yazım yalnız RPC'lerle.
grant select (id, name, created_at, last_seen_at, last_printed_at, last_error) on public.station_devices to authenticated;
create policy station_devices_staff_read on public.station_devices for select to authenticated
  using ((select public.has_role('admin', 'kitchen')));

-- ---------- mutfak / admin RPC'leri ----------
-- Dönüş: {id, token}. Düz anahtar yalnız burada, bir kez döner; cihaz onu kendi güvenli deposunda saklar.
create function public.register_station_device(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_name text := btrim(coalesce(p_name, '')); v_token text; v_id uuid;
begin
  v_me := internal.require_role('kitchen', 'admin');
  if length(v_name) not between 1 and 60 then perform internal.fail('station_device_name_invalid'); end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.station_devices (name, token_hash, created_by)
  values (v_name, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'), v_me.id)
  returning id into v_id;
  perform internal.audit('station_device_register', 'station_device', v_id::text, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

-- Cihaz kaydı silinir, anahtarı anında geçersiz olur (station-feed 401 döner). O an cihazın elinde basılmakta olan
-- iş varsa kuyruğa geri bırakılır: 60 sn'lik devralma kuralıyla aynı sonuç (deneme sayısı artmaz), yalnız beklemeden —
-- başka bir yol (ör. ön plandaki istasyon) onu hemen alabilir.
create function public.revoke_station_device(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_name text; v_released int;
begin
  perform internal.require_role('kitchen', 'admin');
  delete from public.station_devices d where d.id = p_id returning d.name into v_name;
  if not found then perform internal.fail('station_device_not_found'); end if;
  update public.print_jobs j
     set status = 'pending', claimed_by = null, claimed_at = null
   where j.status = 'printing' and j.claimed_by = 'station-bg:' || p_id::text;
  get diagnostics v_released = row_count;
  perform internal.audit('station_device_revoke', 'station_device', p_id::text,
                         jsonb_build_object('name', v_name, 'released_jobs', v_released));
end $$;

-- ---------- service_role: Edge Function (station-feed) ----------
-- Cihazın uzun yoklaması bu fonksiyonu ~1 sn arayla çağırır; bu yüzden son görülme yazımları 5 sn'de bire
-- seyreltilir (printer_status'un yayın tetikleyicisi last_seen_at'e zaten tepki vermez).
--
-- Dönüş: {device: 'ok'|'unknown', route, printer: {host, port}, settings: {codepage, codepageNumber, transliterate},
--         job: {id, type, payload} | null}. Cihaz tanınmıyorsa yalnız {device: 'unknown', job: null}.
-- İş (en fazla bir) yalnız baskı yolu 'station' iken ve yazıcı adresi doluyken sahiplenilir. Rota 'station' değilse
-- printer_status'a dokunulmaz (ajanın / SDP'nin satırı ezilmez).
create function public.station_feed_claim(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_d public.station_devices; v_agent text; v_s public.settings; v_host text; v_job jsonb;
begin
  select * into v_d from public.station_devices d where d.token_hash = p_token_hash;
  if not found then return jsonb_build_object('device', 'unknown', 'job', null); end if;

  update public.station_devices d set last_seen_at = now()
   where d.id = v_d.id and (d.last_seen_at is null or d.last_seen_at < now() - interval '5 seconds');
  select * into v_s from public.settings s where s.id = 1;
  v_agent := 'station-bg:' || v_d.id::text;
  v_host := nullif(btrim(v_s.printer_host), '');

  if v_s.print_route = 'station' then
    -- Cihaz bizi çağırabildiğine göre çevrimiçi. Başka bir kaynaktan (ajan / SDP / başka istasyon) devralınıyorsa
    -- onun yazıcı durumu temizlenir (yazıcıya ulaşılabilirliği cihazın heartbeat'i bildirir); aynı cihazınki korunur.
    update public.printer_status ps
       set printer_reachable = case when ps.agent_id is distinct from v_agent then null else ps.printer_reachable end,
           printer_state     = case when ps.agent_id is distinct from v_agent then '{}'::jsonb else ps.printer_state end,
           last_error        = case when ps.agent_id is distinct from v_agent then null else ps.last_error end,
           agent_version     = case when ps.agent_id is distinct from v_agent then null else ps.agent_version end,
           agent_id = v_agent, host = v_d.name, last_seen_at = now()
     where ps.id = 'main'
       and (ps.agent_id is distinct from v_agent or ps.host is distinct from v_d.name
            or ps.last_seen_at is null or ps.last_seen_at < now() - interval '5 seconds');

    if v_host is not null then
      select jsonb_build_object('id', c.id, 'type', c.type, 'payload', c.payload)
        into v_job from internal.claim_print_jobs(v_agent, 1) c;
    end if;
  end if;

  return jsonb_build_object(
    'device', 'ok',
    'route', v_s.print_route,
    'printer', jsonb_build_object('host', v_host, 'port', v_s.printer_port),
    'settings', jsonb_build_object('codepage', v_s.printer_codepage, 'codepageNumber', v_s.printer_codepage_number,
                                   'transliterate', v_s.printer_transliterate),
    'job', v_job);
end $$;

-- Baskı sonucu. internal.complete_print_job semantiği: yalnız bu cihazın sahiplendiği 'printing' iş kapatılır;
-- başarısızlıkta 5/15/30/60/120 sn geri çekilme, 6. hatada 'failed'.
-- Dönüş: 'ok' | 'unknown' | 'job_not_found' | 'job_not_printing' (hata fırlatmaz).
-- Hata metni web istasyonunun biçimindedir (`<kod>: <mesaj>`, kod: offline|timeout|io|cover_open|paper_end).
create function public.station_feed_complete(p_token_hash text, p_job_id uuid, p_ok boolean, p_error text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_d public.station_devices; v_agent text; v_result text; v_ok boolean := coalesce(p_ok, false);
        v_err text := left(coalesce(nullif(btrim(p_error), ''), 'print_failed'), 500);
begin
  select * into v_d from public.station_devices d where d.token_hash = p_token_hash;
  if not found then return 'unknown'; end if;
  v_agent := 'station-bg:' || v_d.id::text;

  v_result := internal.complete_print_job(p_job_id, v_ok, v_err, v_agent);
  if v_result <> 'ok' then return v_result; end if;

  update public.station_devices
     set last_seen_at = now(),
         last_printed_at = case when v_ok then now() else last_printed_at end,
         last_error = case when v_ok then null else v_err end
   where id = v_d.id;

  if internal.print_route() = 'station' then
    update public.printer_status
       set agent_id = v_agent, host = v_d.name, last_seen_at = now(),
           printer_reachable = case when v_ok then true
                                    when v_err ~ '^(offline|timeout|io)(:|$)' then false
                                    else printer_reachable end,
           printer_state = case when v_ok then printer_state
                                when v_err ~ '^paper_end(:|$)' then printer_state || '{"paper_end": true}'::jsonb
                                when v_err ~ '^cover_open(:|$)' then printer_state || '{"cover_open": true}'::jsonb
                                else printer_state end,
           last_error = case when v_ok then null else v_err end,
           last_printed_at = case when v_ok then now() else last_printed_at end
     where id = 'main';
  elsif v_ok then
    -- Rota o arada değiştiyse yeni yolun durum satırı ezilmez; yalnız "son baskı" (istasyon yoluyla aynı).
    update public.printer_status set last_printed_at = now() where id = 'main';
  end if;
  return 'ok';
end $$;

-- Cihazın periyodik durumu. Dönüş: 'ok' | 'unknown'. Rota 'station' değilse yalnız cihaz satırı güncellenir:
-- başka yolun (ajan/SDP) printer_status satırı ezilmez.
create function public.station_feed_heartbeat(p_token_hash text, p_version text, p_reachable boolean,
                                              p_state jsonb, p_error text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_d public.station_devices; v_err text := left(nullif(btrim(p_error), ''), 500);
begin
  select * into v_d from public.station_devices d where d.token_hash = p_token_hash;
  if not found then return 'unknown'; end if;

  update public.station_devices set last_seen_at = now(), last_error = v_err where id = v_d.id;

  if internal.print_route() = 'station' then
    perform internal.write_printer_heartbeat('station-bg:' || v_d.id::text, left(p_version, 100), v_d.name,
                                             p_reachable,
                                             case when jsonb_typeof(p_state) = 'object' then p_state else '{}'::jsonb end,
                                             v_err);
  end if;
  return 'ok';
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

-- 0015: station-feed iç fonksiyonları yalnız service_role (Edge Function). Anahtar özeti bilen herkes cihaz gibi
-- davranabileceği için personel oturumlarına da KAPALI.
revoke execute on function public.station_feed_claim(text) from public, anon, authenticated;
revoke execute on function public.station_feed_complete(text, uuid, boolean, text) from public, anon, authenticated;
revoke execute on function public.station_feed_heartbeat(text, text, boolean, jsonb, text) from public, anon, authenticated;
grant execute on function public.station_feed_claim(text) to service_role;
grant execute on function public.station_feed_complete(text, uuid, boolean, text) to service_role;
grant execute on function public.station_feed_heartbeat(text, text, boolean, jsonb, text) to service_role;

-- 0011: anon'un çağırabildiği TEK fonksiyon — toplu revoke'tan SONRA.
grant execute on function public.public_menu() to anon, authenticated;
