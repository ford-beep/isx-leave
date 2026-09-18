-- ===========================================================================
-- ISX Leave Management Dashboard — 0022 Weekly Plan
-- ---------------------------------------------------------------------------
-- Weekly Plan is a living work plan:
--   * employees can create/edit/delete their own items
--   * admins can read everyone's items
--   * no submit / approval / completion status
--   * empty days are valid and require no database row
--   * plans may be created for past or future weeks
--   * all seven days (Monday-Sunday) are supported
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Category
-- ---------------------------------------------------------------------------
do $$ begin
  create type weekly_plan_category as enum ('priority', 'other');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Weekly plan items
-- ---------------------------------------------------------------------------
create table if not exists public.weekly_plan_items (
  id          uuid primary key default gen_random_uuid(),

  employee_id uuid not null
    references public.users(id) on delete cascade,

  -- Always the Monday that identifies this item's week.
  week_start  date not null,

  -- May be any day Monday-Sunday within week_start.
  work_date   date not null,

  category    weekly_plan_category not null,

  content     text not null
    check (
      length(btrim(content)) between 1 and 1000
    ),

  -- Allows multiple tasks in the same day/category and preserves their order.
  sort_order  integer not null default 0
    check (sort_order >= 0),

  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),

  -- week_start must actually be a Monday.
  constraint weekly_plan_week_start_monday
    check (extract(isodow from week_start) = 1),

  -- work_date must belong to that Monday-Sunday week.
  constraint weekly_plan_work_date_in_week
    check (
      work_date >= week_start
      and work_date <= week_start + 6
    )
);

create index if not exists weekly_plan_items_employee_week_idx
  on public.weekly_plan_items (employee_id, week_start);

create index if not exists weekly_plan_items_week_idx
  on public.weekly_plan_items (week_start, employee_id);

create index if not exists weekly_plan_items_day_category_idx
  on public.weekly_plan_items (
    employee_id,
    work_date,
    category,
    sort_order
  );

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------
create or replace function app.touch_weekly_plan_item_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists weekly_plan_items_touch_updated_at
  on public.weekly_plan_items;

create trigger weekly_plan_items_touch_updated_at
before update on public.weekly_plan_items
for each row
execute function app.touch_weekly_plan_item_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.weekly_plan_items enable row level security;

drop policy if exists weekly_plan_items_select
  on public.weekly_plan_items;

drop policy if exists weekly_plan_items_insert_own
  on public.weekly_plan_items;

drop policy if exists weekly_plan_items_update_own
  on public.weekly_plan_items;

drop policy if exists weekly_plan_items_delete_own
  on public.weekly_plan_items;

-- Employees can read only their own plan.
-- Admins can read everyone's plan.
create policy weekly_plan_items_select
on public.weekly_plan_items
for select
using (
  employee_id = app.current_user_id()
  or app.is_admin()
);

-- Even admins create items only for themselves.
create policy weekly_plan_items_insert_own
on public.weekly_plan_items
for insert
with check (
  employee_id = app.current_user_id()
);

-- Even admins edit only their own plan.
create policy weekly_plan_items_update_own
on public.weekly_plan_items
for update
using (
  employee_id = app.current_user_id()
)
with check (
  employee_id = app.current_user_id()
);

-- Even admins delete only their own plan.
create policy weekly_plan_items_delete_own
on public.weekly_plan_items
for delete
using (
  employee_id = app.current_user_id()
);

-- ---------------------------------------------------------------------------
-- Runtime permissions
-- ---------------------------------------------------------------------------
do $$
declare
  r text;
begin
  foreach r in array array['isx_app', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format(
        'grant select, insert, update, delete on table public.weekly_plan_items to %I',
        r
      );
    end if;
  end loop;
end $$;
