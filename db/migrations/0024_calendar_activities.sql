BEGIN;

-- ============================================================================
-- CALENDAR ACTIVITIES
-- ============================================================================
-- Shared company activities shown on the calendar.
--
-- Permissions:
-- - Any active signed-in user may view activities.
-- - Only users listed in calendar_activity_managers may create/edit/delete.
-- - Activity permissions are intentionally separate from the general admin role.
-- ============================================================================


-- ============================================================================
-- ACTIVITY MANAGERS
-- ============================================================================

create table if not exists public.calendar_activity_managers (
  user_id uuid primary key
    references public.users(id) on delete cascade,

  created_at timestamptz not null default now()
);


-- ============================================================================
-- CALENDAR ACTIVITIES
-- ============================================================================

create table if not exists public.calendar_activities (
  id uuid primary key default gen_random_uuid(),

  activity_date date not null,

  title text not null
    check (
      length(btrim(title)) between 1 and 160
    ),

  start_time time,
  end_time time,

  location text
    check (
      location is null
      or length(btrim(location)) <= 200
    ),

  description text
    check (
      description is null
      or length(btrim(description)) <= 2000
    ),

  created_by uuid not null
    references public.users(id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint calendar_activities_time_range
    check (
      start_time is null
      or end_time is null
      or end_time > start_time
    )
);


create index if not exists calendar_activities_date_idx
  on public.calendar_activities (
    activity_date,
    start_time,
    created_at
  );


-- ============================================================================
-- MANAGER PERMISSION HELPER
-- ============================================================================
-- SECURITY DEFINER is intentional here:
-- the application does not receive direct access to the manager table.
-- It may only ask whether the current user is allowed to manage activities.

create or replace function app.can_manage_calendar_activities()
returns boolean
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select exists (
    select 1
    from public.calendar_activity_managers cam
    join public.users u
      on u.id = cam.user_id
    where cam.user_id = app.current_user_id()
      and u.active = true
  );
$$;

revoke all
on function app.can_manage_calendar_activities()
from public;


-- ============================================================================
-- UPDATED_AT
-- ============================================================================

create or replace function app.touch_calendar_activity_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();

  -- The creator is audit information and must not change after creation.
  new.created_by := old.created_by;

  return new;
end;
$$;


drop trigger if exists calendar_activities_touch_updated_at
  on public.calendar_activities;

create trigger calendar_activities_touch_updated_at
before update on public.calendar_activities
for each row
execute function app.touch_calendar_activity_updated_at();


-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

alter table public.calendar_activity_managers
  enable row level security;

alter table public.calendar_activities
  enable row level security;


drop policy if exists calendar_activities_select_authenticated
  on public.calendar_activities;

drop policy if exists calendar_activities_insert_manager
  on public.calendar_activities;

drop policy if exists calendar_activities_update_manager
  on public.calendar_activities;

drop policy if exists calendar_activities_delete_manager
  on public.calendar_activities;


-- Everyone in the active company account may view shared activities.
create policy calendar_activities_select_authenticated
on public.calendar_activities
for select
using (
  app.is_active_user()
);


-- Only an Activity Manager may create an activity.
-- created_by must always be the signed-in manager.
create policy calendar_activities_insert_manager
on public.calendar_activities
for insert
with check (
  app.can_manage_calendar_activities()
  and created_by = app.current_user_id()
);


-- Only Activity Managers may edit activities.
create policy calendar_activities_update_manager
on public.calendar_activities
for update
using (
  app.can_manage_calendar_activities()
)
with check (
  app.can_manage_calendar_activities()
);


-- Only Activity Managers may delete activities.
create policy calendar_activities_delete_manager
on public.calendar_activities
for delete
using (
  app.can_manage_calendar_activities()
);


-- ============================================================================
-- RUNTIME PERMISSIONS
-- ============================================================================

do $$
declare
  r text;
begin
  foreach r in array array['isx_app', 'authenticated'] loop
    if exists (
      select 1
      from pg_roles
      where rolname = r
    ) then

      -- Everyone may access the activities table.
      -- RLS decides which operation is allowed.
      execute format(
        'grant select, insert, update, delete on table public.calendar_activities to %I',
        r
      );

      -- The manager list itself is intentionally hidden.
      execute format(
        'revoke all on table public.calendar_activity_managers from %I',
        r
      );

      execute format(
        'grant execute on function app.can_manage_calendar_activities() to %I',
        r
      );
    end if;
  end loop;
end $$;


COMMIT;
