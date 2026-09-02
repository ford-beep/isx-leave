-- ============================================================================
-- 0011_user_birthday.sql
-- Adds birthday to employee profiles and provides a safe self-service
-- profile update function.
-- ============================================================================

alter table public.users
  add column if not exists birthday date;


-- ---------------------------------------------------------------------------
-- Self-service profile update
--
-- Employees must not receive general UPDATE permission on public.users,
-- because that row also contains privileged fields such as role, active,
-- email, and password_hash.
--
-- This function exposes only the fields an authenticated user may edit:
-- name and birthday.
-- ---------------------------------------------------------------------------

create or replace function app.update_own_profile(
  p_name text,
  p_birthday date
)
returns void
language plpgsql
security definer
set search_path = public, app
as $$
declare
  v_user_id uuid;
  v_name text;
begin
  v_user_id := app.current_user_id();
  v_name := btrim(p_name);

  if v_user_id is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if length(v_name) < 1 or length(v_name) > 120 then
    raise exception 'INVALID_PROFILE_NAME';
  end if;

  if p_birthday is not null
     and p_birthday > current_date then
    raise exception 'INVALID_BIRTHDAY';
  end if;

  update public.users
     set name = v_name,
         birthday = p_birthday,
         updated_at = now()
   where id = v_user_id
     and active = true;

  if not found then
    raise exception 'USER_NOT_FOUND_OR_INACTIVE';
  end if;
end;
$$;

revoke all on function app.update_own_profile(text, date)
  from public;

grant execute on function app.update_own_profile(text, date)
  to isx_app;