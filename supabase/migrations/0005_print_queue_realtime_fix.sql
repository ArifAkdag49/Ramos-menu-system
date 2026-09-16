-- 0005 düzeltme — complete_print_job durum/sahiplik koruması ve kuyruk indeksi (R49)
-- Eski sürüm işi yalnız id ile güncelliyordu. 60 sn'lik geri almadan sonra gecikmiş bir
-- complete_print_job çağrısı, işi yeni ajan basarken 'pending'e geri çekip üçüncü bir baskıya
-- yol açabiliyordu; ayrıca hiç sahiplenilmemiş bir iş "basıldı" sayılabiliyor ve 'failed' bir işin
-- attempts sayacı 6'nın üstüne itilebiliyordu.
-- Artık iş yalnız 'printing' durumundayken ve (p_agent_id verilmişse) onu sahiplenen ajan tarafından
-- kapatılabilir; aksi hâlde 'job_not_printing'.

-- Yeni parametre ayrı bir imza yaratır; eski 3 parametreli sürüm kalırsa çağrılar belirsizleşir.
drop function if exists public.complete_print_job(uuid, boolean, text);

create or replace function public.complete_print_job(p_job_id uuid, p_ok boolean, p_error text default null,
                                                     p_agent_id text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.print_jobs; v_backoff int[] := array[5, 15, 30, 60, 120];
begin
  perform internal.require_role('printer');
  select * into v from public.print_jobs j where j.id = p_job_id for update;
  if not found then perform internal.fail('job_not_found'); end if;
  if v.status <> 'printing' or (p_agent_id is not null and v.claimed_by is distinct from p_agent_id) then
    perform internal.fail('job_not_printing');
  end if;
  if p_ok then
    update public.print_jobs set status = 'printed', printed_at = now(), last_error = null
     where id = p_job_id and status = 'printing' and claimed_at is not distinct from v.claimed_at;
    update public.printer_status set last_printed_at = now() where id = 'main';
  elsif v.attempts + 1 >= 6 then
    update public.print_jobs set status = 'failed', attempts = v.attempts + 1, last_error = left(p_error, 500)
     where id = p_job_id and status = 'printing' and claimed_at is not distinct from v.claimed_at;
  else
    update public.print_jobs
       set status = 'pending', attempts = v.attempts + 1, last_error = left(p_error, 500),
           next_attempt_at = now() + make_interval(secs => v_backoff[v.attempts + 1])
     where id = p_job_id and status = 'printing' and claimed_at is not distinct from v.claimed_at;
  end if;
end $$;

-- Ajan bu yüklemi 5 sn'de bir sorgular; tablo hiç budanmıyor.
create index if not exists print_jobs_claim_idx on public.print_jobs (created_at)
  where status in ('pending', 'printing');

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
