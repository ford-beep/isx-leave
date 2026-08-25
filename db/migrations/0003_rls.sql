-- ===========================================================================
-- ISX Leave Management Dashboard — 0003 Row Level Security
-- ---------------------------------------------------------------------------
-- THE privacy requirement (§20) is enforced here, not in the UI.
--
-- The Next.js runtime connects as a role that is NOT the table owner and does
-- NOT have BYPASSRLS. Every statement it issues is rewritten by these
-- policies. Tampering with a URL, an id in a server action payload, or the
-- REST endpoints changes nothing: the database refuses to return another
-- employee's rows.
--
-- On Supabase these same policies apply to the `authenticated` role and
-- app.current_user_id() resolves from the Supabase JWT — no edits needed.
-- ===========================================================================

alter table public.users              enable row level security;
alter table public.leave_requests     enable row level security;
alter table public.leave_entitlements enable row level security;
alter table public.holidays           enable row level security;
alter table public.office_days        enable row level security;
alter table public.work_schedule      enable row level security;
alter table public.leave_types        enable row level security;
alter table public.audit_logs         enable row level security;
alter table public.notifications      enable row level security;
alter table public.app_settings       enable row level security;

-- Drop-and-recreate so the migration is idempotent.
do $$
declare r record;
begin
  for r in
    select schemaname, tablename, policyname from pg_policies where schemaname = 'public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- users
-- ---------------------------------------------------------------------------
-- An employee can read exactly one row: their own.
create policy users_select_self_or_admin on public.users
  for select using (id = app.current_user_id() or app.is_admin());

create policy users_insert_admin on public.users
  for insert with check (app.is_admin());

create policy users_update_admin on public.users
  for update using (app.is_admin()) with check (app.is_admin());

create policy users_delete_admin on public.users
  for delete using (app.is_admin() and id <> app.current_user_id());

create policy work_schedule_select_authenticated
on public.work_schedule
for select
using (app.current_user_id() is not null);

create policy work_schedule_write_admin
on public.work_schedule
for all
using (app.is_admin())
with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- leave_requests
-- ---------------------------------------------------------------------------
create policy leave_select_own_or_admin on public.leave_requests
  for select using (employee_id = app.current_user_id() or app.is_admin());

-- Employees may only file for themselves and only as 'pending'.
create policy leave_insert_own on public.leave_requests
  for insert with check (
    app.is_active_user()
    and (app.is_admin() or (employee_id = app.current_user_id() and status = 'pending'))
  );

-- Employees may only touch their OWN request while it is still pending; the
-- validation trigger then restricts them to the pending -> cancelled move.
create policy leave_update_own_pending_or_admin on public.leave_requests
  for update
  using (app.is_admin() or (employee_id = app.current_user_id() and status = 'pending'))
  with check (app.is_admin() or employee_id = app.current_user_id());

create policy leave_delete_admin on public.leave_requests
  for delete using (app.is_admin());

-- ---------------------------------------------------------------------------
-- leave_entitlements
-- ---------------------------------------------------------------------------
create policy entitlements_select_own_or_admin on public.leave_entitlements
  for select using (employee_id = app.current_user_id() or app.is_admin());

create policy entitlements_write_admin on public.leave_entitlements
  for all using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- Shared reference data: readable by any active signed-in user, writable only
-- by admins. Holidays and office days are company-wide, non-personal facts.
-- ---------------------------------------------------------------------------
create policy holidays_select_authenticated on public.holidays
  for select using (app.is_active_user());
create policy holidays_write_admin on public.holidays
  for all using (app.is_admin()) with check (app.is_admin());

create policy office_days_select_authenticated on public.office_days
  for select using (app.is_active_user());
create policy office_days_write_admin on public.office_days
  for all using (app.is_admin()) with check (app.is_admin());

create policy leave_types_select_authenticated on public.leave_types
  for select using (app.is_active_user());
create policy leave_types_write_admin on public.leave_types
  for all using (app.is_admin()) with check (app.is_admin());

create policy app_settings_select_authenticated on public.app_settings
  for select using (app.is_active_user());
create policy app_settings_write_admin on public.app_settings
  for all using (app.is_admin()) with check (app.is_admin());

-- ---------------------------------------------------------------------------
-- audit_logs — admin-readable, append-only.
-- No INSERT/UPDATE/DELETE policy exists for anyone: rows can only be created
-- by app.write_audit(), which is SECURITY DEFINER.
-- ---------------------------------------------------------------------------
create policy audit_select_admin on public.audit_logs
  for select using (app.is_admin());

-- ---------------------------------------------------------------------------
-- notifications — strictly personal.
-- ---------------------------------------------------------------------------
create policy notifications_select_own on public.notifications
  for select using (user_id = app.current_user_id());
create policy notifications_update_own on public.notifications
  for update using (user_id = app.current_user_id())
  with check (user_id = app.current_user_id());

-- ---------------------------------------------------------------------------
-- Password self-service without granting employees UPDATE on public.users.
-- ---------------------------------------------------------------------------
create or replace function app.set_own_password(p_hash text) returns void
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare uid uuid := app.current_user_id();
begin
  if uid is null then raise exception 'NOT_AUTHENTICATED'; end if;
  if p_hash is null or length(p_hash) < 20 then raise exception 'INVALID_PASSWORD_HASH'; end if;
  update public.users set password_hash = p_hash where id = uid;
  perform app.write_audit('user.password_changed', 'user', uid, '{}'::jsonb);
end $$;

-- Login lookup must work BEFORE a session exists, so it cannot go through RLS.
-- Returns only what the authenticator needs.
create or replace function app.auth_lookup(p_email text)
returns table (id uuid, name text, email text, role user_role, active boolean, password_hash text)
language sql security definer set search_path = public, app, pg_temp as $$
  select u.id, u.name, u.email::text, u.role, u.active, u.password_hash
  from public.users u
  where u.email = p_email::citext
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Grants for the runtime role(s)
-- ---------------------------------------------------------------------------
do $$
declare r text;
begin
  foreach r in array array['isx_app', 'authenticated'] loop
    if exists (select 1 from pg_roles where rolname = r) then
      execute format('grant usage on schema public, app to %I', r);
      execute format('grant select, insert, update, delete on all tables in schema public to %I', r);
      execute format('grant execute on all functions in schema app to %I', r);
      execute format('alter default privileges in schema public grant select, insert, update, delete on tables to %I', r);
      execute format('alter default privileges in schema app grant execute on functions to %I', r);
      -- Explicitly withhold the audit trail from direct writes.
      execute format('revoke insert, update, delete on public.audit_logs from %I', r);
    end if;
  end loop;
end $$;
