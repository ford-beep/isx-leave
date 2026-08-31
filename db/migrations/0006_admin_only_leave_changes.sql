-- ===========================================================================
-- 0006 — Leave status changes are admin-only
--
-- Employees can submit leave requests, but once submitted they cannot change
-- the request status themselves. Cancellation or other status decisions must
-- be handled by an admin.
-- ===========================================================================

create or replace function app.enforce_admin_leave_status_change()
returns trigger
language plpgsql
as $$
begin
  if new.status is distinct from old.status
     and not app.is_admin() then
    raise exception 'LEAVE_STATUS_CHANGE_ADMIN_ONLY';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_leave_requests_admin_status
  on public.leave_requests;

create trigger trg_leave_requests_admin_status
before update of status on public.leave_requests
for each row
execute function app.enforce_admin_leave_status_change();