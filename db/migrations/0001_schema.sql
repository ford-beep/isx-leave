-- ===========================================================================
-- ISX Leave Management Dashboard — 0001 schema
-- ---------------------------------------------------------------------------
-- Design notes
--  * `app` schema holds security + business-logic functions so that RLS
--    policies and triggers can reference them without polluting `public`.
--  * Leave types live in a TABLE (not an enum) so new types can be added by
--    an admin without a migration (requirement §6 "architecture so more leave
--    types can be added later").
--  * Entitlements are keyed by (employee_id, year) — never a single permanent
--    balance column (requirement §23).
--  * `leave_requests.leave_days` + `calc_breakdown` are an immutable SNAPSHOT
--    of the working-calendar maths at submission time. Changing office days or
--    holidays later never rewrites history (requirement §14).
-- ===========================================================================

create extension if not exists "pgcrypto";
create extension if not exists "citext";

create schema if not exists app;

-- --------------------------------------------------------------------------
-- Enums
-- --------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('employee', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type leave_status as enum ('pending', 'approved', 'rejected', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  -- 'public'  = statutory / Bank of Thailand financial-institution holiday
  -- 'company' = ISX-specific closure
  create type holiday_type as enum ('public', 'company');
exception when duplicate_object then null; end $$;

-- --------------------------------------------------------------------------
-- users
-- --------------------------------------------------------------------------
-- `password_hash` is only populated in LOCAL auth mode. When running on
-- Supabase Auth the column stays null and `users.id` mirrors `auth.users.id`.
create table if not exists public.users (
  id            uuid primary key default gen_random_uuid(),
  name          text        not null check (length(btrim(name)) between 1 and 120),
  email         citext      not null unique check (email ~ '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'),
  role          user_role   not null default 'employee',
  active        boolean     not null default true,
  password_hash text,
  job_title     text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists users_role_idx   on public.users (role);
create index if not exists users_active_idx on public.users (active);

-- --------------------------------------------------------------------------
-- leave_types  (extensible catalogue)
-- --------------------------------------------------------------------------
-- deducts_balance lets a future policy add e.g. unpaid leave that does not
-- consume the annual entitlement, without schema changes.
create table if not exists public.leave_types (
  code            text primary key check (code ~ '^[a-z_]{2,32}$'),
  label           text    not null,
  description     text,
  deducts_balance boolean not null default true,
  active          boolean not null default true,
  sort_order      int     not null default 100,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- leave_entitlements  (per employee, per YEAR)
-- --------------------------------------------------------------------------
create table if not exists public.leave_entitlements (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.users(id) on delete cascade,
  year        int  not null check (year between 2000 and 2100),
  total_days  numeric(5,2) not null check (total_days >= 0 and total_days <= 366),
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (employee_id, year)
);

create index if not exists leave_entitlements_employee_idx on public.leave_entitlements (employee_id, year);

-- --------------------------------------------------------------------------
-- holidays
-- --------------------------------------------------------------------------
-- `source` records provenance, e.g. 'BOT' (Bank of Thailand official financial
-- institution holiday calendar) or 'ISX' for company holidays.
create table if not exists public.holidays (
  id           uuid primary key default gen_random_uuid(),
  holiday_date date         not null,
  name         text         not null,
  name_th      text,
  type         holiday_type not null default 'public',
  source       text         not null default 'BOT',
  year         int generated always as (extract(year from holiday_date)::int) stored,
  active       boolean      not null default true,
  note         text,
  created_at   timestamptz  not null default now(),
  updated_at   timestamptz  not null default now(),
  unique (holiday_date, name)
);

create index if not exists holidays_date_idx on public.holidays (holiday_date) where active;
create index if not exists holidays_year_idx on public.holidays (year);

-- --------------------------------------------------------------------------
-- office_days  (versioned working-calendar configuration)
-- --------------------------------------------------------------------------
-- weekday uses the JS/Postgres `dow` convention: 0 = Sunday … 6 = Saturday.
-- A configuration "generation" is 7 rows sharing an effective_from. Superseded
-- generations get effective_to set, so historical calculations stay explainable.
create table if not exists public.office_days (
  id             uuid primary key default gen_random_uuid(),
  weekday        int  not null check (weekday between 0 and 6),
  is_office_day  boolean not null,
  effective_from date not null,
  effective_to   date,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from),
  unique (weekday, effective_from)
);

create index if not exists office_days_lookup_idx on public.office_days (weekday, effective_from desc);

-- --------------------------------------------------------------------------
-- work_schedule
-- --------------------------------------------------------------------------
-- Work location for a specific working date.
-- This does NOT affect leave-day calculation.
-- A working day may be either Office or WFH.

create type work_mode as enum ('office', 'wfh');

create table if not exists public.work_schedule (
  id          uuid primary key default gen_random_uuid(),
  work_date   date not null unique,
  mode        work_mode not null,
  note        text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists work_schedule_date_idx
  on public.work_schedule (work_date);


-- --------------------------------------------------------------------------
-- leave_requests
-- --------------------------------------------------------------------------
create table if not exists public.leave_requests (
  id               uuid primary key default gen_random_uuid(),
  employee_id      uuid not null references public.users(id) on delete cascade,
  leave_type       text not null references public.leave_types(code),
  start_date       date not null,
  end_date         date not null,
  leave_days       numeric(5,2) not null default 0,
  calc_breakdown   jsonb not null default '{}'::jsonb,
  reason           text check (reason is null or length(reason) <= 1000),
  status           leave_status not null default 'pending',
  approved_by      uuid references public.users(id) on delete set null,
  approved_at      timestamptz,
  rejection_reason text check (rejection_reason is null or length(rejection_reason) <= 1000),
  cancelled_at     timestamptz,
  leave_year       int generated always as (extract(year from start_date)::int) stored,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint leave_requests_date_order check (end_date >= start_date),
  constraint leave_requests_rejection_reason_required
    check (status <> 'rejected' or (rejection_reason is not null and length(btrim(rejection_reason)) > 0))
);

create index if not exists leave_requests_employee_idx on public.leave_requests (employee_id, start_date desc);
create index if not exists leave_requests_status_idx   on public.leave_requests (status) where status = 'pending';
create index if not exists leave_requests_range_idx    on public.leave_requests (start_date, end_date);
create index if not exists leave_requests_year_idx     on public.leave_requests (employee_id, leave_year, status);

-- Hard guarantee at the storage layer: one employee cannot hold two
-- simultaneously-live (pending or approved) requests over the same dates.
-- This is belt-and-braces alongside the validation trigger.
create extension if not exists btree_gist;
alter table public.leave_requests drop constraint if exists leave_requests_no_overlap;
alter table public.leave_requests add constraint leave_requests_no_overlap
  exclude using gist (
    employee_id with =,
    daterange(start_date, end_date, '[]') with &&
  ) where (status in ('pending', 'approved'));

-- --------------------------------------------------------------------------
-- audit_logs
-- --------------------------------------------------------------------------
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references public.users(id) on delete set null,
  action      text not null,
  entity_type text not null,
  entity_id   uuid,
  metadata    jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_created_idx on public.audit_logs (created_at desc);
create index if not exists audit_logs_entity_idx  on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_actor_idx   on public.audit_logs (actor_id);

-- --------------------------------------------------------------------------
-- notifications  (in-app, V1). Architected so an email/Slack dispatcher can
-- later consume unsent rows without schema change.
-- --------------------------------------------------------------------------
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.users(id) on delete cascade,
  title       text not null,
  body        text,
  link        text,
  read_at     timestamptz,
  emailed_at  timestamptz,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, created_at desc);

-- --------------------------------------------------------------------------
-- app_settings  (single-row key/value for tunables such as the default
-- entitlement, so admins can change it without a deploy)
-- --------------------------------------------------------------------------
create table if not exists public.app_settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz not null default now()
);

-- --------------------------------------------------------------------------
-- updated_at maintenance
-- --------------------------------------------------------------------------
create or replace function app.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'users','leave_types','leave_entitlements','holidays','office_days','leave_requests'
  ] loop
    execute format('drop trigger if exists trg_%s_touch on public.%I', t, t);
    execute format(
      'create trigger trg_%s_touch before update on public.%I
       for each row execute function app.touch_updated_at()', t, t);
  end loop;
end $$;
