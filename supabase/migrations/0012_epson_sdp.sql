-- 0012 — Epson Server Direct Print (SDP): yazıcı fişi bilgisayarsız, sunucudan kendisi çeker.
-- Yazıcı (ör. TM-m30III) belirli aralıkla `supabase/functions/epson-sdp`'ye POST atar; fonksiyon
-- aşağıdaki service_role fonksiyonlarıyla kuyruktan iş alır ve sonucu kaydeder. Protokol notları:
-- docs/epson-server-direct-print.md.
--
-- Baskı yolu tek seçimdir (`settings.print_route`): 'agent' iken yalnız bilgisayar programı,
-- 'epson_sdp' iken yalnız SDP yazıcıları iş alır — aynı fiş iki yoldan basılmasın.
--
-- KURAL (0010/0011 notları): dosya sonundaki toplu revoke/grant bloğundan SONRA ready_push_targets
-- daraltması, public_menu anon izni ve bu dosyanın sdp_* daraltmaları tekrarlanır.

alter table public.settings
  add column print_route text not null default 'agent'
  constraint settings_print_route_check check (print_route in ('agent', 'epson_sdp'));

-- ---------- SDP yazıcıları ----------
-- Anahtar (token) düz hâliyle ASLA saklanmaz: yalnız sha256 hex özeti. Düz anahtar yalnız
-- create/rotate yanıtında bir kez döner; admin ekranı onu bir kez gösterir.
create table public.sdp_printers (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(btrim(name)) between 1 and 60),
  token_hash   text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  last_seen_at timestamptz,
  last_error   text
);
alter table public.sdp_printers enable row level security;
revoke all on public.sdp_printers from anon, authenticated;
-- Admin listeyi okur ama token_hash sütununu göremez (sütun düzeyinde izin). Yazım yalnız RPC'lerle.
grant select (id, name, is_active, created_at, last_seen_at, last_error) on public.sdp_printers to authenticated;
create policy sdp_printers_admin_read on public.sdp_printers for select to authenticated
  using ((select public.has_role('admin')));

-- ---------- admin RPC'leri ----------
create function public.create_sdp_printer(p_name text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_name text := btrim(coalesce(p_name, '')); v_token text; v_id uuid;
begin
  perform internal.require_role('admin');
  if length(v_name) not between 1 and 60 then perform internal.fail('printer_name_invalid'); end if;
  v_token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.sdp_printers (name, token_hash)
  values (v_name, encode(sha256(convert_to(v_token, 'UTF8')), 'hex'))
  returning id into v_id;
  perform internal.audit('sdp_printer_create', 'sdp_printer', v_id::text, jsonb_build_object('name', v_name));
  return jsonb_build_object('id', v_id, 'token', v_token);
end $$;

-- Eski anahtar anında geçersiz olur: yazıcıdaki URL güncellenene kadar yazıcı 401 alır.
create function public.rotate_sdp_printer_token(p_id uuid) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_token text := encode(extensions.gen_random_bytes(32), 'hex');
begin
  perform internal.require_role('admin');
  update public.sdp_printers set token_hash = encode(sha256(convert_to(v_token, 'UTF8')), 'hex')
   where id = p_id;
  if not found then perform internal.fail('sdp_printer_not_found'); end if;
  perform internal.audit('sdp_printer_rotate', 'sdp_printer', p_id::text, '{}'::jsonb);
  return jsonb_build_object('id', p_id, 'token', v_token);
end $$;

create function public.set_sdp_printer_active(p_id uuid, p_active boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('admin');
  update public.sdp_printers set is_active = coalesce(p_active, false) where id = p_id;
  if not found then perform internal.fail('sdp_printer_not_found'); end if;
  perform internal.audit(case when p_active then 'sdp_printer_activate' else 'sdp_printer_deactivate' end,
                         'sdp_printer', p_id::text, '{}'::jsonb);
end $$;

-- ---------- service_role: Edge Function (epson-sdp) ----------
-- Yazıcının periyodik isteği. Dönüş: {printer: 'ok'|'unknown'|'inactive', jobs: [...], settings: {...}}.
-- Yazıcı tanınmıyor/pasifse hiçbir şey değişmez. Baskı yolu 'epson_sdp' değilse yalnız yazıcının
-- last_seen_at'i güncellenir (Ayarlar'da "son görülme" doğru çıksın) ve iş verilmez; ajanın
-- printer_status satırına dokunulmaz.
-- İşler claim_print_job ile aynı kuralla alınır (sıradaki pending ya da 60 sn'den eski printing);
-- bir istekte en fazla 5 iş (yanıtta ayrı <ePOSPrint> blokları).
create function public.sdp_claim_next(p_token_hash text) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_p public.sdp_printers; v_agent text; v_s public.settings; v_jobs jsonb;
begin
  select * into v_p from public.sdp_printers p where p.token_hash = p_token_hash;
  if not found then return jsonb_build_object('printer', 'unknown', 'jobs', '[]'::jsonb); end if;
  if not v_p.is_active then return jsonb_build_object('printer', 'inactive', 'jobs', '[]'::jsonb); end if;

  update public.sdp_printers set last_seen_at = now() where id = v_p.id;
  select * into v_s from public.settings s where s.id = 1;
  v_agent := 'epson-sdp:' || v_p.id::text;

  if v_s.print_route <> 'epson_sdp' then
    return jsonb_build_object('printer', 'ok', 'jobs', '[]'::jsonb);
  end if;

  -- Yazıcı bizi çağırabildiğine göre çevrimiçi. Başka bir kaynaktan (ajan / başka SDP yazıcısı)
  -- devralınıyorsa eski ulaşılamaz/hata durumu temizlenir; aynı yazıcının son baskı hatası korunur.
  update public.printer_status ps
     set printer_reachable = case when ps.agent_id is distinct from v_agent then true else ps.printer_reachable end,
         printer_state     = case when ps.agent_id is distinct from v_agent then '{}'::jsonb else ps.printer_state end,
         last_error        = case when ps.agent_id is distinct from v_agent then null else ps.last_error end,
         agent_id = v_agent, agent_version = null, host = 'Epson SDP', last_seen_at = now()
   where ps.id = 'main';

  with next_jobs as (
    select j.id from public.print_jobs j
    where (j.status = 'pending' and j.next_attempt_at <= now())
       or (j.status = 'printing' and j.claimed_at < now() - interval '60 seconds')
    order by j.created_at
    for update skip locked
    limit 5
  ), claimed as (
    update public.print_jobs j
       set status = 'printing', claimed_by = v_agent, claimed_at = now()
      from next_jobs
     where j.id = next_jobs.id
    returning j.id, j.type, j.payload, j.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object('id', c.id, 'type', c.type, 'payload', c.payload)
                            order by c.created_at), '[]'::jsonb)
    into v_jobs from claimed c;

  return jsonb_build_object(
    'printer', 'ok',
    'jobs', v_jobs,
    'settings', jsonb_build_object('codepage', v_s.printer_codepage, 'codepageNumber', v_s.printer_codepage_number,
                                   'transliterate', v_s.printer_transliterate));
end $$;

-- Yazıcının baskı sonucu (SetResponse). complete_print_job semantiği: yalnız bu yazıcının sahiplendiği
-- 'printing' iş kapatılır; başarısızlıkta 5/15/30/60/120 sn geri çekilme, 6. hatada 'failed'.
-- Dönüş: 'ok' | 'unknown' | 'inactive' | 'job_not_found' | 'job_not_printing' (hata fırlatmaz: tek
-- istekte birden çok iş sonucu gelir, biri reddedilince diğerleri işlenmeye devam eder).
-- Hata kodu Epson'un <response code="..."> değeridir (ör. EPTR_REC_EMPTY → kağıt bitti).
create function public.sdp_complete(p_token_hash text, p_job_id uuid, p_success boolean, p_error text)
returns text
language plpgsql security definer set search_path = '' as $$
declare v_p public.sdp_printers; v_agent text; v public.print_jobs; v_backoff int[] := array[5, 15, 30, 60, 120];
        v_err text := left(coalesce(nullif(btrim(p_error), ''), 'print_failed'), 500);
begin
  select * into v_p from public.sdp_printers p where p.token_hash = p_token_hash;
  if not found then return 'unknown'; end if;
  if not v_p.is_active then return 'inactive'; end if;
  v_agent := 'epson-sdp:' || v_p.id::text;

  select * into v from public.print_jobs j where j.id = p_job_id for update;
  if not found then return 'job_not_found'; end if;
  if v.status <> 'printing' or v.claimed_by is distinct from v_agent then return 'job_not_printing'; end if;

  if p_success then
    update public.print_jobs set status = 'printed', printed_at = now(), last_error = null
     where id = p_job_id and status = 'printing' and claimed_at is not distinct from v.claimed_at;
  elsif v.attempts + 1 >= 6 then
    update public.print_jobs set status = 'failed', attempts = v.attempts + 1, last_error = v_err
     where id = p_job_id and status = 'printing' and claimed_at is not distinct from v.claimed_at;
  else
    update public.print_jobs
       set status = 'pending', attempts = v.attempts + 1, last_error = v_err,
           next_attempt_at = now() + make_interval(secs => v_backoff[v.attempts + 1])
     where id = p_job_id and status = 'printing' and claimed_at is not distinct from v.claimed_at;
  end if;

  update public.sdp_printers
     set last_seen_at = now(), last_error = case when p_success then null else v_err end
   where id = v_p.id;

  -- Admin panosu / garson şeridi (`derivePrinterProblem`) bu satırı okur.
  update public.printer_status
     set agent_id = v_agent, agent_version = null, host = 'Epson SDP', last_seen_at = now(),
         printer_reachable = p_success or v_err !~ '^(EX_BADPORT|EX_TIMEOUT|DeviceNotFound|PrintSystemError)',
         printer_state = case when p_success then '{}'::jsonb
                              else jsonb_build_object('paper_end', v_err ~ '^EPTR_REC_EMPTY',
                                                      'cover_open', v_err ~ '^EPTR_COVER_OPEN',
                                                      'error', v_err) end,
         last_error = case when p_success then null else v_err end,
         last_printed_at = case when p_success then now() else last_printed_at end
   where id = 'main';
  return 'ok';
end $$;

-- ---------- ajan: baskı yolu 'agent' değilse iş almaz (çift baskı önleme) ----------
-- Gövde 0005 ile aynı; tek fark baştaki print_route denetimi.
create or replace function public.claim_print_job(p_agent_id text) returns setof public.print_jobs
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('printer');
  if (select s.print_route from public.settings s where s.id = 1) <> 'agent' then
    return;
  end if;
  return query
  with next_job as (
    select j.id from public.print_jobs j
    where (j.status = 'pending' and j.next_attempt_at <= now())
       or (j.status = 'printing' and j.claimed_at < now() - interval '60 seconds')
    order by j.created_at
    for update skip locked
    limit 1
  ), claimed as (
    update public.print_jobs j
       set status = 'printing', claimed_by = p_agent_id, claimed_at = now()
      from next_job
     where j.id = next_job.id
    returning j.*
  )
  select * from claimed;
end $$;

-- Baskı yolu SDP iken hâlâ çalışan bir ajanın heartbeat'i tek satırlık printer_status'u ezip
-- SDP yazıcısının durumunu ("çevrimiçi") ajanın kendi yazıcısıyla ("ulaşılamıyor") değiştirmesin.
-- Gövde 0005 ile aynı; tek fark baştaki print_route denetimi.
create or replace function public.agent_heartbeat(p_agent_id text, p_version text, p_host text,
                                                  p_reachable boolean, p_state jsonb, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('printer');
  if (select s.print_route from public.settings s where s.id = 1) <> 'agent' then
    return;
  end if;
  update public.printer_status
     set agent_id = p_agent_id, agent_version = p_version, host = p_host, last_seen_at = now(),
         printer_reachable = p_reachable, printer_state = coalesce(p_state, '{}'::jsonb), last_error = p_error
   where id = 'main';
end $$;

-- ---------- toplu fonksiyon yetkileri (önceki migration'lardaki kalıp) ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;

-- 0010: ready_push_targets yalnız service_role.
revoke execute on function public.ready_push_targets(uuid) from public, anon, authenticated;
grant execute on function public.ready_push_targets(uuid) to service_role;

-- 0012: SDP iç fonksiyonları yalnız service_role (Edge Function). Anahtar özeti bilen herkes
-- yazıcı gibi davranabileceği için personel oturumlarına da KAPALI.
revoke execute on function public.sdp_claim_next(text) from public, anon, authenticated;
revoke execute on function public.sdp_complete(text, uuid, boolean, text) from public, anon, authenticated;
grant execute on function public.sdp_claim_next(text) to service_role;
grant execute on function public.sdp_complete(text, uuid, boolean, text) to service_role;

-- 0011: anon'un çağırabildiği TEK fonksiyon — toplu revoke'tan SONRA.
grant execute on function public.public_menu() to anon, authenticated;
