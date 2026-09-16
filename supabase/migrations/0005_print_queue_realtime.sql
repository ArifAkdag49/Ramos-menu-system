-- 0005 — fiş kuyruğu RPC'leri, Realtime broadcast, denetim trigger'ları (spec §6, §10, §11.1)

-- Tekrar baskı orijinal işin payload'unu birebir yineler (spec §6.2, §9.4: "NACHDRUCK: orijinal fiş"),
-- böylece baskı anındaki masa adı ve kalemler korunur.
create function public.reprint_order(p_order_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles; v_first public.print_jobs;
begin
  v_me := internal.require_role('admin', 'waiter', 'kitchen');
  select * into v_first from public.print_jobs j
  where j.order_id = p_order_id and j.type in ('order', 'addition') order by j.created_at limit 1;
  if not found then perform internal.fail('order_not_found'); end if;
  insert into public.print_jobs (type, order_id, session_id, payload, created_by)
  values ('reprint', p_order_id, v_first.session_id,
          v_first.payload || jsonb_build_object('kind', 'reprint', 'reprintOf', v_first.type::text),
          v_me.id);
  perform internal.audit('order_reprint', 'order', p_order_id::text, '{}'::jsonb);
end $$;

create function public.retry_print_job(p_job_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('admin', 'waiter', 'kitchen');
  update public.print_jobs
     set status = 'pending', attempts = 0, next_attempt_at = now(), last_error = null, claimed_by = null
   where id = p_job_id and status = 'failed';
  if not found then perform internal.fail('job_not_failed'); end if;
end $$;

create function public.enqueue_test_print() returns void
language plpgsql security definer set search_path = '' as $$
declare v_me public.profiles;
begin
  v_me := internal.require_role('admin');
  insert into public.print_jobs (type, payload, created_by)
  select 'test', jsonb_build_object(
      'kind', 'test', 'header', s.ticket_header, 'footer', s.ticket_footer, 'table', 'Tisch 12',
      'orderNo', 0, 'round', 1, 'createdAt', now(), 'waiter', v_me.display_name, 'note', 'Testdruck',
      'settings', jsonb_build_object('host', s.printer_host, 'port', s.printer_port,
                                     'codepage', s.printer_codepage, 'codepageNumber', s.printer_codepage_number,
                                     'transliterate', s.printer_transliterate),
      'sampleLine', 'ÄÖÜ äöü ß · Şş Ğğ İı Çç · 0123456789 · #*-+',
      'items', jsonb_build_array(
        jsonb_build_object('qty', 2, 'code', '05', 'name', 'Drehspieß Sandwich', 'isBeverage', false,
          'variant', 'Kalb', 'without', jsonb_build_array('Zwiebeln', 'Tomaten'),
          'groups', jsonb_build_array(
            jsonb_build_object('label', 'Soße', 'format', 'label_values', 'values', jsonb_build_array('Knoblauch', 'Kräuter')),
            jsonb_build_object('label', 'Schärfe', 'format', 'values_only', 'values', jsonb_build_array('scharf (Chili)')),
            jsonb_build_object('label', 'Extras', 'format', 'plus_each', 'values', jsonb_build_array('Extra Weichkäse'))),
          'note', 'Soße extra'),
        jsonb_build_object('qty', 1, 'code', '59', 'name', 'Kuzu Şiş', 'isBeverage', false, 'variant', null,
          'without', '[]'::jsonb,
          'groups', jsonb_build_array(jsonb_build_object('label', 'Beilage', 'format', 'values_only',
                                                         'values', jsonb_build_array('Reis'))), 'note', null),
        jsonb_build_object('qty', 3, 'code', null, 'name', 'Cola 0,33 l', 'isBeverage', true, 'variant', null,
          'without', '[]'::jsonb, 'groups', '[]'::jsonb, 'note', null))),
    v_me.id
  from public.settings s;
end $$;

create function public.claim_print_job(p_agent_id text) returns setof public.print_jobs
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('printer');
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

create function public.complete_print_job(p_job_id uuid, p_ok boolean, p_error text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare v public.print_jobs; v_backoff int[] := array[5, 15, 30, 60, 120];
begin
  perform internal.require_role('printer');
  select * into v from public.print_jobs j where j.id = p_job_id for update;
  if not found then perform internal.fail('job_not_found'); end if;
  if p_ok then
    update public.print_jobs set status = 'printed', printed_at = now(), last_error = null where id = p_job_id;
    update public.printer_status set last_printed_at = now() where id = 'main';
  elsif v.attempts + 1 >= 6 then
    update public.print_jobs set status = 'failed', attempts = v.attempts + 1, last_error = left(p_error, 500)
     where id = p_job_id;
  else
    update public.print_jobs
       set status = 'pending', attempts = v.attempts + 1, last_error = left(p_error, 500),
           next_attempt_at = now() + make_interval(secs => v_backoff[v.attempts + 1])
     where id = p_job_id;
  end if;
end $$;

create function public.agent_heartbeat(p_agent_id text, p_version text, p_host text,
                                       p_reachable boolean, p_state jsonb, p_error text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform internal.require_role('printer');
  update public.printer_status
     set agent_id = p_agent_id, agent_version = p_version, host = p_host, last_seen_at = now(),
         printer_reachable = p_reachable, printer_state = coalesce(p_state, '{}'::jsonb), last_error = p_error
   where id = 'main';
end $$;

-- ---------- Realtime: Broadcast from Database ----------
create function internal.broadcast_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform realtime.broadcast_changes(tg_argv[0], tg_op, tg_op, tg_table_name, tg_table_schema, new, old);
  return null;
end $$;

create trigger orders_bc         after insert or update or delete on public.orders
  for each row execute function internal.broadcast_change('orders');
create trigger order_items_bc    after insert or update or delete on public.order_items
  for each row execute function internal.broadcast_change('orders');
create trigger table_sessions_bc after insert or update or delete on public.table_sessions
  for each row execute function internal.broadcast_change('orders');
create trigger print_jobs_bc_orders after insert or update on public.print_jobs
  for each row execute function internal.broadcast_change('orders');
create trigger print_jobs_bc     after insert or update on public.print_jobs
  for each row execute function internal.broadcast_change('print-jobs');
create trigger settings_bc       after update on public.settings
  for each row execute function internal.broadcast_change('settings');
create trigger printer_status_bc after update on public.printer_status
  for each row when (
    old.printer_reachable is distinct from new.printer_reachable
    or old.printer_state  is distinct from new.printer_state
    or old.last_error     is distinct from new.last_error
    or old.agent_id       is distinct from new.agent_id
    or old.last_printed_at is distinct from new.last_printed_at)
  execute function internal.broadcast_change('printer-status');

do $$
declare t text;
begin
  foreach t in array array['categories','products','product_variants','ingredients','product_ingredients',
                           'option_groups','options','product_option_groups','dining_tables'] loop
    execute format('create trigger %1$s_bc after insert or update or delete on public.%1$I
                    for each row execute function internal.broadcast_change(''menu'')', t);
  end loop;
end $$;

create policy staff_receive_broadcasts on realtime.messages for select to authenticated
using (
  realtime.messages.extension = 'broadcast' and (
       ((select realtime.topic()) in ('orders', 'menu') and (select public.has_role('admin', 'waiter', 'kitchen')))
    or ((select realtime.topic()) = 'print-jobs'        and (select public.has_role('admin', 'printer')))
    or ((select realtime.topic()) in ('printer-status', 'settings') and (select public.is_active_staff()))
  )
);

-- ---------- denetim: kullanıcı kaynaklı menü/masa/ayar değişiklikleri ----------
create function internal.audit_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  if auth.uid() is null then return null; end if;   -- seed / migration loglanmaz
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), lower(tg_op), tg_table_name, coalesce(v_row->>'id', v_row->>'product_id', ''),
          case tg_op when 'UPDATE' then jsonb_build_object('old', to_jsonb(old), 'new', to_jsonb(new))
                     when 'DELETE' then jsonb_build_object('old', to_jsonb(old))
                     else jsonb_build_object('new', to_jsonb(new)) end);
  return null;
end $$;

do $$
declare t text;
begin
  foreach t in array array['categories','products','product_variants','ingredients','product_ingredients',
                           'option_groups','options','product_option_groups','dining_tables','settings'] loop
    execute format('create trigger %1$s_audit after insert or update or delete on public.%1$I
                    for each row execute function internal.audit_row()', t);
  end loop;
end $$;

revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
