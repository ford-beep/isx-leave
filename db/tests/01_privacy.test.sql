-- ===========================================================================
-- SUITE 1 — Employee privacy (§20) and role-based access (§2)
-- ---------------------------------------------------------------------------
-- Run as the RUNTIME role (isx_app), which is not a table owner and has no
-- BYPASSRLS. Everything here is what an attacker would get if they replayed
-- the app's own database connection with hand-written SQL — i.e. strictly
-- more power than tampering with a URL, a form payload or the client bundle.
-- ===========================================================================
\set ON_ERROR_STOP on
\i _helpers.sql

\set jane  '22222222-2222-4222-8222-222222222222'
\set john  '33333333-3333-4333-8333-333333333333'
\set mike  '44444444-4444-4444-8444-444444444444'
\set admin '11111111-1111-4111-8111-111111111111'

\echo '--- SUITE 1: employee privacy ---'

-- Sanity: confirm the connection really is RLS-bound.
select pg_temp.ok(
  (select not rolbypassrls and not rolsuper from pg_roles where rolname = current_user),
  'runtime role has neither SUPERUSER nor BYPASSRLS');

-- ---------------------------------------------------------------------------
-- 1. Anonymous / unauthenticated sees nothing at all
-- ---------------------------------------------------------------------------
select pg_temp.anon();
select pg_temp.eq((select count(*) from users)::int, 0, 'anonymous: users is empty');
select pg_temp.eq((select count(*) from leave_requests)::int, 0, 'anonymous: leave_requests is empty');
select pg_temp.eq((select count(*) from leave_entitlements)::int, 0, 'anonymous: entitlements are empty');
select pg_temp.eq((select count(*) from holidays)::int, 0, 'anonymous: holidays are hidden');

-- ---------------------------------------------------------------------------
-- 2. Employee sees ONLY themselves
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:'jane');

select pg_temp.eq((select count(*) from users)::int, 1, 'Jane sees exactly 1 user row');
select pg_temp.eq((select id from users), :'jane'::uuid, 'Jane sees only her own user row');

-- Explicitly asking for John by primary key returns nothing.
select pg_temp.eq((select count(*) from users where id = :'john'::uuid)::int, 0,
  'Jane cannot read John by direct id lookup');
select pg_temp.eq((select count(*) from users where email = 'john@demo.isx.local')::int, 0,
  'Jane cannot enumerate John by email');

-- ---------------------------------------------------------------------------
-- 3. Employee cannot see another employee's leave — dates, type, reason
-- ---------------------------------------------------------------------------
select pg_temp.eq((select count(*) from leave_requests where employee_id <> :'jane'::uuid)::int, 0,
  'Jane sees zero leave requests belonging to anyone else');
select pg_temp.eq((select count(distinct employee_id) from leave_requests)::int, 1,
  'Jane sees exactly one distinct employee_id in leave_requests');
select pg_temp.eq((select count(*) from leave_requests)::int, 3,
  'Jane sees all three of her own requests');

-- Try to reach John's rows by every obvious lever an attacker has.
select pg_temp.eq((select count(*) from leave_requests where employee_id = :'john'::uuid)::int, 0,
  'Jane: filtering by John employee_id leaks nothing');
select pg_temp.eq((select count(*) from leave_requests where start_date = '2026-08-24')::int, 0,
  'Jane: guessing John''s leave dates leaks nothing');
select pg_temp.eq((select count(*) from leave_requests where reason ilike '%Japan%')::int, 0,
  'Jane: searching John''s reason text leaks nothing');
select pg_temp.eq((select count(*) from leave_requests lr where lr.id in
    (select id from leave_requests))::int, 3,
  'Jane: subquery re-entry does not widen visibility');

-- ---------------------------------------------------------------------------
-- 4. Employee cannot see another employee's balance or entitlement
-- ---------------------------------------------------------------------------
select pg_temp.eq((select count(*) from leave_entitlements where employee_id <> :'jane'::uuid)::int, 0,
  'Jane sees zero entitlements belonging to others');

select pg_temp.eq((select entitlement from app.leave_balance(:'john'::uuid, 2026)), 15::numeric,
  'Jane calling leave_balance(John) gets only the public default, not John''s 20 days');
select pg_temp.eq((select approved from app.leave_balance(:'john'::uuid, 2026)), 0::numeric,
  'Jane calling leave_balance(John) sees 0 approved days (no leakage)');
select pg_temp.eq((select approved from app.leave_balance(:'jane'::uuid, 2026)), 10::numeric,
  'Jane calling leave_balance(self) sees her real 10 approved days');

-- ---------------------------------------------------------------------------
-- 5. Employee cannot WRITE to anyone else's data
-- ---------------------------------------------------------------------------
-- Note on error identifiers: a BEFORE-INSERT trigger fires ahead of the RLS
-- WITH CHECK clause, so writes that both layers forbid surface the trigger's
-- message. The RLS layer is proven independently by the users / holidays /
-- office_days / entitlements cases below, which have no trigger guard at all.
select pg_temp.raises(
  format('insert into leave_requests (employee_id, leave_type, start_date, end_date)
          values (%L, ''annual'', ''2026-11-16'', ''2026-11-17'')', :'john'),
  'FORBIDDEN_EMPLOYEE_MISMATCH', 'Jane cannot file leave on John''s behalf');

select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date, status)
   values (''22222222-2222-4222-8222-222222222222'', ''annual'', ''2026-11-16'', ''2026-11-17'', ''approved'')',
  'LEAVE_MUST_START_PENDING', 'Jane cannot self-approve at INSERT time');

-- UPDATEs against invisible rows simply affect zero rows — no error, no leak.
with u as (
  update leave_requests set status = 'approved'
   where employee_id = :'john'::uuid returning 1
) select pg_temp.eq((select count(*) from u)::int, 0, 'Jane approving John''s leave updates 0 rows');

with u as (
  update users set role = 'admin' where id = :'jane'::uuid returning 1
) select pg_temp.eq((select count(*) from u)::int, 0, 'Jane cannot escalate herself to admin');

select pg_temp.raises(
  'insert into users (name, email) values (''Mallory'', ''mallory@demo.isx.local'')',
  'row-level security', 'Jane cannot create users');

select pg_temp.raises(
  'insert into holidays (holiday_date, name) values (''2026-12-24'', ''Fake Holiday'')',
  'row-level security', 'Jane cannot invent public holidays');

select pg_temp.raises(
  'insert into office_days (weekday, is_office_day, effective_from) values (3, false, ''2026-01-01'')',
  'row-level security', 'Jane cannot reconfigure office days');

select pg_temp.raises(
  'insert into leave_entitlements (employee_id, year, total_days)
   values (''22222222-2222-4222-8222-222222222222'', 2028, 99)',
  'row-level security', 'Jane cannot grant herself extra entitlement');

select pg_temp.raises(
  'select app.set_office_days(array[1,2,3], ''2026-09-01'')',
  'FORBIDDEN_ADMIN_ONLY', 'Jane cannot call the admin office-day RPC');

-- ---------------------------------------------------------------------------
-- 6. Audit trail is invisible and untouchable to employees
-- ---------------------------------------------------------------------------
select pg_temp.eq((select count(*) from audit_logs)::int, 0, 'Jane sees no audit log entries');
select pg_temp.raises(
  'insert into audit_logs (action, entity_type) values (''forged'', ''user'')',
  'permission denied', 'Jane has no INSERT privilege on audit_logs (not even a policy check)');

-- ---------------------------------------------------------------------------
-- 7. Notifications are personal
-- ---------------------------------------------------------------------------
select pg_temp.eq((select count(*) from notifications where user_id <> :'jane'::uuid)::int, 0,
  'Jane sees no notifications addressed to others');

-- ---------------------------------------------------------------------------
-- 8. Inactive users are locked out even with a valid id
-- ---------------------------------------------------------------------------
select pg_temp.act_as('55555555-5555-4555-8555-555555555555');
select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date)
   values (''55555555-5555-4555-8555-555555555555'', ''annual'', ''2026-11-16'', ''2026-11-17'')',
  'row-level security', 'deactivated employee cannot file leave');

-- ---------------------------------------------------------------------------
-- 9. Admin CAN see everything (the policies are not simply "deny all")
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:'admin');
select pg_temp.eq((select count(*) from users)::int, 5, 'admin sees all five users');
select pg_temp.eq((select count(distinct employee_id) from leave_requests)::int, 3,
  'admin sees leave for all three requesting employees');
select pg_temp.ok((select count(*) from audit_logs) > 0, 'admin can read the audit trail');
select pg_temp.eq((select entitlement from app.leave_balance(:'john'::uuid, 2026)), 20::numeric,
  'admin sees John''s real 20-day entitlement');

-- ---------------------------------------------------------------------------
-- 10. Even an admin cannot forge audit rows directly
-- ---------------------------------------------------------------------------
select pg_temp.raises(
  'insert into audit_logs (action, entity_type) values (''forged'', ''user'')',
  'permission denied', 'admin cannot hand-write audit rows either (append-only via SECURITY DEFINER)');
select pg_temp.raises(
  'delete from audit_logs', 'permission denied', 'admin cannot delete audit history');

select pg_temp.summary('SUITE 1 privacy');
