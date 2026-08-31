-- Return only active admin email addresses for notification delivery.
-- SECURITY DEFINER deliberately bypasses user-row RLS without exposing
-- any other employee data.

create or replace function app.active_admin_emails()
returns table (email text)
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select u.email
  from public.users u
  where u.role = 'admin'
    and u.active = true
    and u.email is not null
    and u.email <> ''
  order by u.email;
$$;

revoke all on function app.active_admin_emails() from public;
grant execute on function app.active_admin_emails() to isx_app;