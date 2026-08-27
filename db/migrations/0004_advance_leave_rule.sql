-- ===========================================================================
-- 0004 — Advance leave rule
--
-- Employees must submit leave at least 7 calendar days before the start date.
-- Emergency leave inside the 7-day window must be submitted by an admin.
-- ===========================================================================

create or replace function app.enforce_leave_advance_notice()
returns trigger
language plpgsql
as $$
declare
  today_bangkok date := (now() at time zone 'Asia/Bangkok')::date;
begin
  -- Admins may submit emergency leave on behalf of an employee.
  if app.is_admin() then
    return new;
  end if;

  -- Employees must submit at least 7 calendar days in advance.
  if new.start_date < today_bangkok + 7 then
    raise exception 'LEAVE_REQUIRES_7_DAYS_NOTICE';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leave_requests_advance_notice
  on public.leave_requests;

create trigger trg_leave_requests_advance_notice
before insert on public.leave_requests
for each row
execute function app.enforce_leave_advance_notice();