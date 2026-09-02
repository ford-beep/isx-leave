-- ============================================================================
-- 0012_profile_name_only.sql
-- Birthday is administrator-managed.
-- Employees may update only their own display name.
-- ============================================================================

drop function if exists app.update_own_profile(text, date);

create or replace function app.update_own_profile(
  p_name text
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

  update public.users
     set name = v_name,
         updated_at = now()
   where id = v_user_id
     and active = true;

  if not found then
    raise exception 'USER_NOT_FOUND_OR_INACTIVE';
  end if;
end;
$$;

revoke all on function app.update_own_profile(text)
  from public;

grant execute on function app.update_own_profile(text)
  to isx_app;