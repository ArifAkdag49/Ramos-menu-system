-- 0002 — yardımcı fonksiyonlar ve RLS politikaları (spec §5.3, §12)

-- ---------- internal yardımcılar (PostgREST'e açık değil) ----------
create function internal.fail(p_key text, p_detail text default null) returns void
language plpgsql set search_path = '' as $$
begin
  raise exception using message = p_key, errcode = 'P0001', detail = coalesce(p_detail, '');
end $$;

create function internal.require_role(variadic p_roles public.staff_role[]) returns public.profiles
language plpgsql stable security definer set search_path = '' as $$
declare v public.profiles;
begin
  select * into v from public.profiles p
  where p.id = auth.uid() and p.is_active and p.role = any (p_roles);
  if not found then
    perform internal.fail('not_authorized');
  end if;
  return v;
end $$;

create function internal.audit(p_action text, p_entity text, p_entity_id text,
                               p_details jsonb default '{}'::jsonb) returns void
language sql security definer set search_path = '' as $$
  insert into public.audit_log (actor_id, action, entity, entity_id, details)
  values (auth.uid(), p_action, p_entity, p_entity_id, coalesce(p_details, '{}'::jsonb));
$$;

-- ---------- public yardımcılar ----------
create function public.is_active_staff() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active);
$$;

create function public.has_role(variadic p_roles public.staff_role[]) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid() and p.is_active and p.role = any (p_roles));
$$;

create function public.business_date(p_ts timestamptz default now()) returns date
language sql stable security definer set search_path = '' as $$
  select ((p_ts at time zone 'Europe/Berlin')
          - (select s.business_day_start from public.settings s where s.id = 1)::interval)::date;
$$;

create function public.current_business_day_start() returns timestamptz
language sql stable security definer set search_path = '' as $$
  select (public.business_date(now())::timestamp
          + (select s.business_day_start from public.settings s where s.id = 1)::interval)
         at time zone 'Europe/Berlin';
$$;

create function public.is_on_duty(p_since timestamptz) returns boolean
language sql stable security definer set search_path = '' as $$
  select p_since is not null and p_since >= public.current_business_day_start();
$$;

create function public.staff_names()
returns table (id uuid, display_name text, role public.staff_role)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.role
  from public.profiles p
  where public.is_active_staff() and p.role <> 'printer'
  order by p.display_name;
$$;

-- ---------- RLS: menü + masalar (personel okur, admin yazar) ----------
do $$
declare t text;
begin
  foreach t in array array['categories','products','product_variants','ingredients','product_ingredients',
                           'option_groups','options','product_option_groups','dining_tables'] loop
    execute format($f$create policy %1$s_read on public.%1$I for select to authenticated
      using ((select public.has_role('admin','waiter','kitchen')))$f$, t);
    execute format($f$create policy %1$s_ins on public.%1$I for insert to authenticated
      with check ((select public.has_role('admin')))$f$, t);
    execute format($f$create policy %1$s_upd on public.%1$I for update to authenticated
      using ((select public.has_role('admin'))) with check ((select public.has_role('admin')))$f$, t);
    execute format($f$create policy %1$s_del on public.%1$I for delete to authenticated
      using ((select public.has_role('admin')))$f$, t);
  end loop;
end $$;

-- ---------- RLS: diğer tablolar ----------
create policy profiles_read on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.has_role('admin')));

create policy settings_read on public.settings for select to authenticated
  using ((select public.is_active_staff()));
create policy settings_upd on public.settings for update to authenticated
  using ((select public.has_role('admin'))) with check ((select public.has_role('admin')));

create policy table_sessions_read on public.table_sessions for select to authenticated
  using ((select public.has_role('admin','waiter','kitchen')));
create policy orders_read on public.orders for select to authenticated
  using ((select public.has_role('admin','waiter','kitchen')));
create policy order_items_read on public.order_items for select to authenticated
  using ((select public.has_role('admin','waiter','kitchen')));

create policy print_jobs_read on public.print_jobs for select to authenticated
  using ((select public.has_role('admin','waiter','kitchen','printer')));
create policy printer_status_read on public.printer_status for select to authenticated
  using ((select public.is_active_staff()));

create policy push_subscriptions_read on public.push_subscriptions for select to authenticated
  using (user_id = (select auth.uid()));
create policy push_subscriptions_del on public.push_subscriptions for delete to authenticated
  using (user_id = (select auth.uid()));

create policy audit_log_read on public.audit_log for select to authenticated
  using ((select public.has_role('admin')));
-- daily_counters: politika yok → yalnızca security definer RPC'ler kullanır.
-- orders / order_items / table_sessions / print_jobs: yazma politikası yok → yalnızca RPC.

-- ---------- Storage: ürün görselleri (herkese açık okuma, yalnız admin yazar/siler/listeler) ----------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('product-images', 'product-images', true, 5242880, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy product_images_admin_select on storage.objects for select to authenticated
  using (bucket_id = 'product-images' and (select public.has_role('admin')));
create policy product_images_admin_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'product-images' and (select public.has_role('admin')));
create policy product_images_admin_update on storage.objects for update to authenticated
  using (bucket_id = 'product-images' and (select public.has_role('admin')))
  with check (bucket_id = 'product-images' and (select public.has_role('admin')));
create policy product_images_admin_delete on storage.objects for delete to authenticated
  using (bucket_id = 'product-images' and (select public.has_role('admin')));

-- ---------- tablo ve sequence yetkileri ----------
-- Açık grant: şema Supabase'in değişen varsayılan yetkilerine bağlı kalmaz; satır erişimini RLS belirler.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant all on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to authenticated, service_role;
-- anon'un sequence yetkisi de yok (spec §5: anon'un hiçbir erişimi yok).
revoke all on all sequences in schema public from anon;
alter default privileges in schema public revoke all on sequences from anon;

-- ---------- fonksiyon yetkileri ----------
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
revoke all on all functions in schema internal from public, anon, authenticated;
