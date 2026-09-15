-- 0001 — Ramo's sipariş sistemi şeması (spec §5)

create type public.staff_role       as enum ('admin', 'waiter', 'kitchen', 'printer');
create type public.session_status   as enum ('open', 'closed');
create type public.order_status     as enum ('in_kitchen', 'ready', 'served', 'cancelled');
create type public.item_status      as enum ('active', 'cancelled');
create type public.print_job_type   as enum ('order', 'addition', 'storno', 'table_move', 'reprint', 'test');
create type public.print_job_status as enum ('pending', 'printing', 'printed', 'failed');
create type public.ticket_format    as enum ('label_values', 'values_only', 'plus_each');

create table public.profiles (
  id            uuid primary key references auth.users (id) on delete restrict,
  username      text not null unique check (username ~ '^[a-z0-9._-]{3,32}$'),
  display_name  text not null check (length(display_name) between 1 and 60),
  role          public.staff_role not null,
  locale        text not null default 'tr' check (locale in ('tr', 'de')),
  is_active     boolean not null default true,
  on_duty_since timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.categories (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  name_de     text not null,
  name_tr     text,
  is_beverage boolean not null default false,
  sort        int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.products (
  id               uuid primary key default gen_random_uuid(),
  slug             text not null unique,
  category_id      uuid not null references public.categories (id),
  code             text,
  name             text not null,
  description      text,
  base_price_cents int check (base_price_cents >= 0),
  allergens        text,
  image_path       text,                          -- Storage yolu (product-images); boş = yer tutucu
  is_active        boolean not null default true,
  is_sold_out      boolean not null default false,
  sort             int not null default 0,
  archived_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create unique index products_code_unique on public.products (code)
  where archived_at is null and code is not null;
create index products_category_idx on public.products (category_id, sort);

create table public.product_variants (
  id          uuid primary key default gen_random_uuid(),
  product_id  uuid not null references public.products (id) on delete cascade,
  name_de     text not null,
  name_tr     text,
  price_cents int not null check (price_cents >= 0),
  is_default  boolean not null default false,
  sort        int not null default 0,
  is_active   boolean not null default true
);
create index product_variants_product_idx on public.product_variants (product_id, sort);

create table public.ingredients (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique,
  name_de   text not null,
  name_tr   text,
  is_active boolean not null default true
);

create table public.product_ingredients (
  product_id    uuid not null references public.products (id) on delete cascade,
  ingredient_id uuid not null references public.ingredients (id) on delete restrict,
  sort          int not null default 0,
  primary key (product_id, ingredient_id)
);
create index product_ingredients_ingredient_idx on public.product_ingredients (ingredient_id);  -- FK indeksi

create table public.option_groups (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  admin_label   text not null,
  name_de       text not null,
  name_tr       text,
  min_select    int not null default 0 check (min_select >= 0),
  max_select    int not null default 1 check (max_select >= 1),
  ticket_format public.ticket_format not null default 'label_values',
  sort          int not null default 0,
  is_active     boolean not null default true,
  check (min_select <= max_select)
);

create table public.options (
  id                uuid primary key default gen_random_uuid(),
  group_id          uuid not null references public.option_groups (id) on delete cascade,
  name_de           text not null,
  name_tr           text,
  price_delta_cents int not null default 0,
  is_default        boolean not null default false,
  is_exclusive      boolean not null default false,
  sort              int not null default 0,
  is_active         boolean not null default true
);
create index options_group_idx on public.options (group_id, sort);

create table public.product_option_groups (
  product_id uuid not null references public.products (id) on delete cascade,
  group_id   uuid not null references public.option_groups (id) on delete restrict,
  sort       int not null default 0,
  primary key (product_id, group_id)
);
create index product_option_groups_group_idx on public.product_option_groups (group_id);  -- FK indeksi

create table public.dining_tables (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique,
  sort       int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.table_sessions (
  id        uuid primary key default gen_random_uuid(),
  table_id  uuid not null references public.dining_tables (id),
  status    public.session_status not null default 'open',
  opened_by uuid not null references public.profiles (id),
  opened_at timestamptz not null default now(),
  closed_by uuid references public.profiles (id),
  closed_at timestamptz
);
create unique index table_sessions_one_open on public.table_sessions (table_id) where status = 'open';

create table public.orders (
  id            uuid primary key,                       -- istemci üretir (idempotency)
  session_id    uuid not null references public.table_sessions (id),
  waiter_id     uuid not null references public.profiles (id),
  business_date date not null,
  order_no      int not null,
  round_no      int not null,
  status        public.order_status not null default 'in_kitchen',
  note          text check (length(note) <= 500),
  created_at    timestamptz not null default now(),
  ready_at      timestamptz,
  ready_by      uuid references public.profiles (id),
  served_at     timestamptz,
  served_by     uuid references public.profiles (id),
  cancelled_at  timestamptz,
  unique (business_date, order_no)
);
create index orders_status_idx on public.orders (status, created_at);
create index orders_session_idx on public.orders (session_id);
create index orders_waiter_idx on public.orders (waiter_id);  -- FK indeksi

create table public.order_items (
  id                  uuid primary key default gen_random_uuid(),
  order_id            uuid not null references public.orders (id),
  product_id          uuid not null references public.products (id),
  category_sort       int not null,
  is_beverage         boolean not null default false,
  product_code        text,
  product_name        text not null,
  variant_id          uuid references public.product_variants (id),
  variant_name_de     text,
  variant_name_tr     text,
  unit_price_cents    int not null check (unit_price_cents >= 0),
  quantity            int not null check (quantity between 1 and 99),
  removed_ingredients jsonb not null default '[]'::jsonb,
  selected_options    jsonb not null default '[]'::jsonb,
  note                text check (length(note) <= 200),
  status              public.item_status not null default 'active',
  cancel_reason       text,
  cancelled_by        uuid references public.profiles (id),
  cancelled_at        timestamptz,
  sort                int not null default 0
);
create index order_items_order_idx on public.order_items (order_id);
create index order_items_product_idx on public.order_items (product_id);  -- FK indeksi

create table public.print_jobs (
  id              uuid primary key default gen_random_uuid(),
  type            public.print_job_type not null,
  order_id        uuid references public.orders (id),
  session_id      uuid references public.table_sessions (id),
  payload         jsonb not null,
  status          public.print_job_status not null default 'pending',
  attempts        int not null default 0,
  next_attempt_at timestamptz not null default now(),
  last_error      text,
  claimed_by      text,
  claimed_at      timestamptz,
  printed_at      timestamptz,
  created_by      uuid references public.profiles (id),
  created_at      timestamptz not null default now()
);
create index print_jobs_queue_idx on public.print_jobs (status, next_attempt_at);
create index print_jobs_order_idx on public.print_jobs (order_id);
create index print_jobs_session_idx on public.print_jobs (session_id);  -- FK indeksi

create table public.printer_status (
  id                text primary key default 'main' check (id = 'main'),
  agent_id          text,
  agent_version     text,
  host              text,
  last_seen_at      timestamptz,
  printer_reachable boolean,
  printer_state     jsonb not null default '{}'::jsonb,
  last_error        text,
  last_printed_at   timestamptz
);
insert into public.printer_status (id) values ('main');

create table public.push_subscriptions (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles (id) on delete cascade,
  endpoint        text not null unique,
  p256dh          text not null,
  auth            text not null,
  user_agent      text,
  created_at      timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);

create table public.settings (
  id                      int primary key default 1 check (id = 1),
  restaurant_name         text not null default 'Ramo''s Döner & Grill House',
  ticket_header           text not null default 'RAMO''S · KÜCHE',
  ticket_footer           text not null default '',
  business_day_start      time not null default '05:00',
  printer_host            text not null default '',
  printer_port            int not null default 9100 check (printer_port between 1 and 65535),
  printer_codepage        text not null default 'cp857',
  printer_codepage_number int not null default 61 check (printer_codepage_number between 0 and 255),
  printer_transliterate   boolean not null default false,
  quick_notes             jsonb not null default '[]'::jsonb,
  cancel_reasons          jsonb not null default '[]'::jsonb,
  allergen_legend         jsonb not null default '[]'::jsonb,
  updated_at              timestamptz not null default now(),
  updated_by              uuid references public.profiles (id)
);
insert into public.settings (id) values (1);

create table public.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor_id  uuid,
  action    text not null,
  entity    text not null,
  entity_id text,
  details   jsonb not null default '{}'::jsonb
);
create index audit_log_at_idx on public.audit_log (at desc);

create table public.daily_counters (
  business_date date primary key,
  last_order_no int not null default 0
);

-- updated_at otomatik
create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger profiles_touch   before update on public.profiles   for each row execute function public.touch_updated_at();
create trigger categories_touch before update on public.categories for each row execute function public.touch_updated_at();
create trigger products_touch   before update on public.products   for each row execute function public.touch_updated_at();
create trigger settings_touch   before update on public.settings   for each row execute function public.touch_updated_at();

-- RLS her tabloda açık; politikalar 0002'de. anon'un hiçbir yetkisi yok.
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','categories','products','product_variants','ingredients','product_ingredients',
    'option_groups','options','product_option_groups','dining_tables','table_sessions','orders',
    'order_items','print_jobs','printer_status','push_subscriptions','settings','audit_log',
    'daily_counters'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon', t);
  end loop;
end $$;
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke execute on functions from anon, public;
