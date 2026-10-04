BEGIN;

-- ============================================================================
-- COMPANY CALENDAR BIRTHDAYS
-- ============================================================================
-- Employees may see active coworkers' birthdays on the shared calendar.
--
-- Privacy:
-- - Exposes only employee id, display name, and month/day.
-- - Does not expose birth year, email, role, or other user fields.
-- - Keeps the existing users table RLS unchanged.
-- ============================================================================

create or replace function app.company_calendar_birthdays()
returns table (
  employee_id uuid,
  employee_name text,
  birthday_md text
)
language plpgsql
stable
security definer
set search_path = public, app, pg_temp
as $$
begin
  if app.current_user_id() is null
     or not app.is_active_user() then
    raise exception 'UNAUTHORIZED';
  end if;

  return query
  select
    u.id,
    u.name,
    to_char(u.birthday, 'MM-DD')
  from public.users u
  where u.active = true
    and u.birthday is not null
  order by u.name;
end;
$$;

revoke all
on function app.company_calendar_birthdays()
from public;

grant execute
on function app.company_calendar_birthdays()
to isx_app;

COMMIT;
