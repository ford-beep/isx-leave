-- ===========================================================================
-- ISX Leave Management Dashboard — DEMO seed
-- ---------------------------------------------------------------------------
-- Executed by `npm run db:seed` (scripts/seed.ts injects the password hashes
-- and the BOT holiday rows; everything else is declared here).
--
-- IMPORTANT — demo vs production separation:
--   * Every row created here carries `demo = true` in its audit metadata and
--     the users get emails on the @demo.isx.local domain.
--   * `npm run db:seed` refuses to run when NODE_ENV=production.
--   * Production bootstrap is `npm run admin:create`, which creates ONE admin
--     from environment variables and nothing else.
--
-- Note the seed deliberately writes leave requests THROUGH the normal
-- validation trigger (by setting app.current_user_id per statement), so the
-- demo data can only exist if the real business rules accept it.
-- ===========================================================================

\set ON_ERROR_STOP on

begin;

-- --------------------------------------------------------------------------
-- Company-wide settings
-- --------------------------------------------------------------------------
insert into public.app_settings (key, value) values
  ('default_annual_entitlement', '15'::jsonb),
  ('company_name',               '"ISX Company"'::jsonb),
  ('company_timezone',           '"Asia/Bangkok"'::jsonb)
on conflict (key) do update set value = excluded.value, updated_at = now();

-- --------------------------------------------------------------------------
-- Leave types (§6 — extensible catalogue, not an enum)
-- --------------------------------------------------------------------------
insert into public.leave_types (code, label, description, deducts_balance, sort_order) values
  ('annual', 'Annual Leave', 'Paid time off from the yearly entitlement.', true, 10),
  ('sick',   'Sick Leave',   'Illness. Medical certificate may be requested.', false, 30)
on conflict (code) do update
  set label = excluded.label,
      description = excluded.description,
      deducts_balance = excluded.deducts_balance,
      sort_order = excluded.sort_order;

-- --------------------------------------------------------------------------
-- Company working days — Monday to Friday.
-- Office/WFH is managed separately in work_schedule.
-- weekday: 0=Sun 1=Mon 2=Tue 3=Wed 4=Thu 5=Fri 6=Sat

delete from public.office_days;

insert into public.office_days (weekday, is_office_day, effective_from)
select
  w,
  w in (1, 2, 3, 4, 5),
  date '2026-01-01'
from generate_series(0, 6) as w;

-- Default work-mode schedule for 2026.
-- Mon-Tue = Office
-- Wed-Fri = WFH
-- Weekends are not inserted because they are non-working days.

delete from public.work_schedule;

insert into public.work_schedule (work_date, mode)
select
  d::date,
  case
    when extract(dow from d) in (1, 2) then 'office'::work_mode
    else 'wfh'::work_mode
  end
from generate_series(
  date '2026-01-01',
  date '2026-12-31',
  interval '1 day'
) d
where extract(dow from d) between 1 and 5;

-- --------------------------------------------------------------------------
-- People
-- --------------------------------------------------------------------------
-- :hash_admin / :hash_emp are scrypt hashes supplied by scripts/seed.ts.
insert into public.users (id, name, email, role, active, password_hash, job_title) values
  ('11111111-1111-4111-8111-111111111111', 'Somchai Wattana', 'admin@demo.isx.local',  'admin',    true, :'hash_admin', 'HR & Operations Lead'),
  ('22222222-2222-4222-8222-222222222222', 'Jane Mitchell',   'jane@demo.isx.local',   'employee', true, :'hash_emp',   'Senior Retoucher'),
  ('33333333-3333-4333-8333-333333333333', 'John Prasert',    'john@demo.isx.local',   'employee', true, :'hash_emp',   'Photographer'),
  ('44444444-4444-4444-8444-444444444444', 'Mike Chen',       'mike@demo.isx.local',   'employee', true, :'hash_emp',   'Studio Coordinator'),
  ('55555555-5555-4555-8555-555555555555', 'Ploy Sirikul',    'ploy@demo.isx.local',   'employee', false, :'hash_emp',  'Producer (inactive)')
on conflict (id) do update
  set name = excluded.name, email = excluded.email, role = excluded.role,
      active = excluded.active, password_hash = excluded.password_hash,
      job_title = excluded.job_title;

-- --------------------------------------------------------------------------
-- Yearly entitlements (§10, §23 — per employee AND per year)
-- --------------------------------------------------------------------------
insert into public.leave_entitlements (employee_id, year, total_days, note) values
  ('11111111-1111-4111-8111-111111111111', 2026, 15, 'Standard'),
  ('22222222-2222-4222-8222-222222222222', 2026, 15, 'Standard'),
  ('33333333-3333-4333-8333-333333333333', 2026, 20, 'Long service — 5 extra days'),
  ('44444444-4444-4444-8444-444444444444', 2026, 12, 'Joined mid-2025, pro-rated'),
  ('55555555-5555-4555-8555-555555555555', 2026, 15, 'Standard'),
  ('22222222-2222-4222-8222-222222222222', 2027, 15, 'Standard'),
  ('33333333-3333-4333-8333-333333333333', 2027, 20, 'Long service')
on conflict (employee_id, year) do update
  set total_days = excluded.total_days, note = excluded.note;

-- --------------------------------------------------------------------------
-- Leave requests — normal advance leave is submitted as the employee.
-- Historical/emergency fixtures inside the 7-day window are entered by
-- the admin, matching the application's emergency-leave workflow.
-- --------------------------------------------------------------------------

create or replace function pg_temp.as_user(p uuid) returns void
language sql as $$
  select set_config('app.current_user_id', p::text, true);
$$;

create or replace function pg_temp.submit(
  p_emp uuid, p_type text, p_start date, p_end date, p_reason text
) returns uuid
language plpgsql as $$
declare
  new_id uuid;
  admin_id uuid := '11111111-1111-4111-8111-111111111111';
  today_bangkok date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if p_start < today_bangkok + 7 then
    perform pg_temp.as_user(admin_id);
  else
    perform pg_temp.as_user(p_emp);
  end if;

  insert into public.leave_requests (
    employee_id,
    leave_type,
    start_date,
    end_date,
    reason
  )
  values (p_emp, p_type, p_start, p_end, p_reason)
  returning id into new_id;

  return new_id;
end $$;

create or replace function pg_temp.decide(
  p_admin uuid, p_id uuid, p_status leave_status, p_reason text default null
) returns void
language plpgsql as $$
begin
  perform pg_temp.as_user(p_admin);
  update public.leave_requests
     set status = p_status, rejection_reason = p_reason
   where id = p_id;
end $$;

do $$
declare
  admin_id uuid := '11111111-1111-4111-8111-111111111111';
  jane     uuid := '22222222-2222-4222-8222-222222222222';
  john     uuid := '33333333-3333-4333-8333-333333333333';
  mike     uuid := '44444444-4444-4444-8444-444444444444';
  r uuid;
begin
  -- ---- Jane -------------------------------------------------------------
  -- Past, approved (Mon 8, Tue 9, Mon 15, Tue 16 June = 4 days)
  r := pg_temp.submit(jane, 'annual', '2026-06-08', '2026-06-16', 'Family trip to Chiang Mai');
  perform pg_temp.decide(admin_id, r, 'approved');

  -- Upcoming, approved — the §6 worked example:
  -- Fri 18 Sep to Tue 22 Sep with Mon+Tue office days => 2 days deducted.
  r := pg_temp.submit(jane, 'annual', '2026-09-18', '2026-09-22', 'Long weekend');
  perform pg_temp.decide(admin_id, r, 'approved');




  -- Rejected, with a reason (28 & 29 Jul are holidays, so 1 day was requested)
  r := pg_temp.submit(jane, 'annual', '2026-07-27', '2026-07-29', 'Extending the holiday week');
  perform pg_temp.decide(admin_id, r, 'rejected', 'Client shoot scheduled that Monday — please re-submit for a later week.');

  -- ---- John -------------------------------------------------------------
  perform pg_temp.submit(john, 'annual', '2026-08-24', '2026-09-01', 'Holiday in Japan');

  -- ---- Mike -------------------------------------------------------------


  -- Imminent approved leave, so the admin dashboard has something upcoming.
  r := pg_temp.submit(mike, 'annual', '2026-08-17', '2026-08-18', 'Short break');
  perform pg_temp.decide(admin_id, r, 'approved');

  -- Cancelled by an admin — must NOT consume any balance.
r := pg_temp.submit(mike, 'annual', '2026-11-09', '2026-11-10', 'Plans changed');
perform pg_temp.decide(admin_id, r, 'cancelled');

  perform set_config('app.current_user_id', '', true);
end $$;

commit;
