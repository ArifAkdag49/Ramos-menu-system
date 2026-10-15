-- 0019 — 3 saatten uzun süre basılamayan fiş otomatik iptal edilir (işletme talebi, 16.10.2026).
--
-- Sorun: yazıcı arızalıyken ya da istasyon (telefon) kapalıyken fişler kuyrukta 'pending' bekliyor. Yazıcı saatler
-- sonra geri gelince hepsi art arda basılıyordu — mutfak çoktan servis edilmiş siparişlerin fişleriyle doluyordu.
--
-- Kural: SON PLANLANMIŞ DENEMESİ (`next_attempt_at`) 3 saatten eski olan iş artık basılmaz, 'expired' olur.
-- Neden `created_at` değil: yeni iş için ikisi aynıdır (`next_attempt_at` varsayılanı now()); ama admin
-- "Tekrar dene" ile başarısız bir işi yeniden kuyruğa aldığında `retry_print_job` `next_attempt_at = now()`
-- yazar — saat o andan yeniden başlar. `created_at`'e bakılsaydı 3 saatten eski bir işi elle yeniden denemek
-- imkânsız olurdu (anında yine iptal edilirdi).
--
-- Kapsam:
-- - 'pending' işler ve 60 sn'den uzun süredir 'printing'de takılı kalmış işler (sahiplenme kuralıyla aynı
--   eşik). Şu an basılmakta olan iş (60 sn içinde sahiplenilmiş) ellenmez: yazıcıya gitmiş olabilir.
-- - 'failed' işlere dokunulmaz (admin kartında "Tekrar dene" ile duruyor).
-- - 'expired' bir iş yeniden denenemez (`retry_print_job` yalnız 'failed' kabul eder); gerekirse sipariş
--   "Tekrar bas" (`reprint_order`) ile bilinçli olarak yeniden basılır.
-- - Son hata korunur: `last_error` = 'expired: …' + varsa önceki hata (neden basılamadığı kaybolmasın).
--
-- Nerede çalışır: TÜM baskı yolları (bilgisayar ajanı, tablet istasyonu, arka plan istasyonu, Epson SDP) işi
-- `internal.claim_print_jobs` ile sahiplenir; süre aşımı her sahiplenmeden hemen önce uygulanır. Yani yazıcı
-- geri geldiği AN eski fişler basılmadan iptal edilir — ayrı bir zamanlayıcı (pg_cron) gerekmez.

create function internal.expire_print_jobs() returns int
language plpgsql set search_path = '' as $$
declare v_n int;
begin
  with stale as (
    select j.id from public.print_jobs j
     where j.next_attempt_at < now() - interval '3 hours'
       and (j.status = 'pending'
            or (j.status = 'printing' and j.claimed_at < now() - interval '60 seconds'))
     for update skip locked
  )
  update public.print_jobs j
     set status = 'expired',
         last_error = left('expired: 3 saat içinde basılamadı, otomatik iptal edildi'
                           || coalesce(' · son hata: ' || j.last_error, ''), 500)
    from stale
   where j.id = stale.id;
  get diagnostics v_n = row_count;
  return v_n;
end $$;

-- 0013'teki sahiplenme; tek fark: önce süresi dolan işler iptal edilir.
create or replace function internal.claim_print_jobs(p_claimed_by text, p_limit int) returns setof public.print_jobs
language plpgsql set search_path = '' as $$
begin
  perform internal.expire_print_jobs();
  return query
  with next_jobs as (
    select j.id from public.print_jobs j
    where (j.status = 'pending' and j.next_attempt_at <= now())
       or (j.status = 'printing' and j.claimed_at < now() - interval '60 seconds')
    order by j.created_at
    for update skip locked
    limit p_limit
  ), claimed as (
    update public.print_jobs j
       set status = 'printing', claimed_by = p_claimed_by, claimed_at = now()
      from next_jobs
     where j.id = next_jobs.id
    returning j.*
  )
  select * from claimed;
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

-- 0011: anon'un çağırabildiği TEK fonksiyon — toplu revoke'tan SONRA.
grant execute on function public.public_menu() to anon, authenticated;
