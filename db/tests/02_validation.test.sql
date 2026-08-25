-- ===========================================================================
-- SUITE 2 — Leave request validation rules (§21) and state machine (§7)
-- ---------------------------------------------------------------------------
-- Runs inside a transaction that is rolled back, so the demo data is
-- untouched. Executed as the RLS-bound runtime role.
-- ===========================================================================
\set ON_ERROR_STOP on
\i _helpers.sql

\set jane  '22222222-2222-4222-8222-222222222222'
\set john  '33333333-3333-4333-8333-333333333333'
\set admin '11111111-1111-4111-8111-111111111111'

\echo '--- SUITE 2: validation rules ---'
begin;

select pg_temp.act_as(:'jane');

-- ---------------------------------------------------------------------------
-- Date sanity
-- ---------------------------------------------------------------------------
select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date)
   values (''22222222-2222-4222-8222-222222222222'', ''annual'', ''2026-11-24'', ''2026-11-16'')',
  'LEAVE_END_BEFORE_START', 'start date after end date is rejected (trigger; a CHECK constraint backs it up)');

select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date)
   values (''22222222-2222-4222-8222-222222222222'', ''annual'', ''2026-12-28'', ''2027-01-05'')',
  'LEAVE_SPANS_TWO_YEARS', 'a request may not straddle two leave years');

-- ---------------------------------------------------------------------------
-- Non-working ranges
-- ---------------------------------------------------------------------------
-- 19–20 Sep 2026 is a Sat/Sun; no working days are deducted.
select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date)
   values (''22222222-2222-4222-8222-222222222222'', ''annual'', ''2026-09-19'', ''2026-09-20'')',
  'LEAVE_NO_WORKING_DAYS', 'a range containing no office days is rejected');

-- 13 Oct 2026 is a Tuesday AND a public holiday -> still zero deductible days.
select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date)
   values (''22222222-2222-4222-8222-222222222222'', ''annual'', ''2026-10-13'', ''2026-10-13'')',
  'LEAVE_NO_WORKING_DAYS', 'a single public holiday cannot be booked as leave');

-- ---------------------------------------------------------------------------
-- Overlap (§21) — against approved AND against pending
-- ---------------------------------------------------------------------------
-- Jane already has 18–22 Sep approved.
select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date)
   values (''22222222-2222-4222-8222-222222222222'', ''annual'', ''2026-09-21'', ''2026-09-21'')',
  'leave_requests_no_overlap',
  'overlapping an APPROVED request is refused');

-- Jane already has leave covering 12–13 Oct.
select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date)
   values (''22222222-2222-4222-8222-222222222222'', ''annual'', ''2026-10-13'', ''2026-10-20'')',
  'leave_requests_no_overlap', 'overlapping a PENDING request is refused');

-- Double submission of the identical range (rapid double-click / replayed POST)
insert into leave_requests (employee_id, leave_type, start_date, end_date, reason)
values (:'jane'::uuid, 'annual', '2026-11-16', '2026-11-17', 'Test A');
select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date, reason)
   values (''22222222-2222-4222-8222-222222222222'', ''annual'', ''2026-11-16'', ''2026-11-17'', ''Test A'')',
  'leave_requests_no_overlap', 'duplicate submission of the same range is refused');

-- ---------------------------------------------------------------------------
-- Balance ceiling (§10) — approved + pending may not exceed the entitlement
-- ---------------------------------------------------------------------------
-- Jane has 2 bookable days available under the current seeded data.
select pg_temp.eq(
  (select available from app.leave_balance(:'jane'::uuid, 2026)),
  2::numeric,
  'Jane has 2 bookable days left after the test request above');

select pg_temp.raises(
  'insert into leave_requests (employee_id, leave_type, start_date, end_date)
   values (''22222222-2222-4222-8222-222222222222'', ''annual'', ''2026-11-23'', ''2026-12-22'')',
  'LEAVE_INSUFFICIENT_BALANCE', 'requesting more days than remain is refused');

-- ---------------------------------------------------------------------------
-- Immutability after submission (§14 auditability)
-- ---------------------------------------------------------------------------
select pg_temp.raises(
  'update leave_requests set start_date = ''2026-11-30''
   where employee_id = ''22222222-2222-4222-8222-222222222222'' and reason = ''Test A''',
  'LEAVE_IMMUTABLE_AFTER_SUBMIT', 'an employee cannot move the dates of a submitted request');

select pg_temp.raises(
  'update leave_requests set leave_days = 0.5
   where employee_id = ''22222222-2222-4222-8222-222222222222'' and reason = ''Test A''',
  'LEAVE_IMMUTABLE_AFTER_SUBMIT', 'nobody can hand-edit the calculated day count');

-- ---------------------------------------------------------------------------
-- State machine (§7)
-- ---------------------------------------------------------------------------
select pg_temp.raises(
  'update leave_requests set status = ''approved''
   where employee_id = ''22222222-2222-4222-8222-222222222222'' and reason = ''Test A''',
  'LEAVE_INVALID_TRANSITION', 'an employee cannot approve their own request');

select pg_temp.raises(
  'update leave_requests set status = ''rejected'', rejection_reason = ''nope''
   where employee_id = ''22222222-2222-4222-8222-222222222222'' and reason = ''Test A''',
  'LEAVE_INVALID_TRANSITION', 'an employee cannot reject a request');

-- Employees MAY withdraw their own pending request.
update leave_requests set status = 'cancelled'
 where employee_id = :'jane'::uuid and reason = 'Test A';
select pg_temp.eq(
  (select status::text from leave_requests where employee_id = :'jane'::uuid and reason = 'Test A'),
  'cancelled', 'an employee can cancel their own pending request');
select pg_temp.ok(
  (select cancelled_at is not null from leave_requests
    where employee_id = :'jane'::uuid and reason = 'Test A'),
  'cancelling stamps cancelled_at automatically');

-- …but not one that has already been decided. The RLS USING clause only
-- exposes still-pending rows for UPDATE, so this silently matches nothing
-- rather than erroring — the row is simply out of reach.
with u as (
  update leave_requests set status = 'cancelled'
   where employee_id = :'jane'::uuid and start_date = '2026-09-18' returning 1
) select pg_temp.eq((select count(*) from u)::int, 0,
  'an employee cannot cancel an already-approved request (0 rows reachable)');
select pg_temp.eq(
  (select status::text from leave_requests where employee_id = :'jane'::uuid and start_date = '2026-09-18'),
  'approved', 'the approved request is still approved afterwards');

-- Create a dedicated pending request for admin decision tests.
select pg_temp.act_as(:'jane');

insert into leave_requests (
  employee_id,
  leave_type,
  start_date,
  end_date,
  reason
)
values (
  :'jane'::uuid,
  'annual',
  '2026-12-23',
  '2026-12-23',
  'Admin decision test'
);




-- ---------------------------------------------------------------------------
-- Admin decisions
-- ---------------------------------------------------------------------------
select pg_temp.act_as(:'admin');

select pg_temp.raises(
  'update leave_requests
   set status = ''rejected'',
       rejection_reason = null
   where employee_id = ''22222222-2222-4222-8222-222222222222''
     and reason = ''Admin decision test''
     and status = ''pending''',
  'LEAVE_REJECTION_REASON_REQUIRED',
  'rejecting without a reason is refused (§31)');

select pg_temp.raises(
  'update leave_requests set status = ''approved''
   where employee_id = ''22222222-2222-4222-8222-222222222222'' and start_date = ''2026-07-27''',
  'LEAVE_ALREADY_DECIDED', 'a rejected request cannot be re-approved');

-- A valid approval stamps the approver and the timestamp.
update leave_requests
set status = 'approved'
where employee_id = :'jane'::uuid
  and reason = 'Admin decision test';
select pg_temp.eq(
  (
    select approved_by
    from leave_requests
    where employee_id = :'jane'::uuid
      and reason = 'Admin decision test'
  ),
  :'admin'::uuid,
  'approval records who approved it'
);

select pg_temp.ok(
  (
    select approved_at is not null
    from leave_requests
    where employee_id = :'jane'::uuid
      and reason = 'Admin decision test'
  ),
  'approval records when it happened'
);

-- Every decision leaves an audit entry (§17).
select pg_temp.ok(
  (select count(*) from audit_logs
    where action = 'leave.approved' and actor_id = :'admin'::uuid) > 0,
  'approving writes an audit_logs entry attributed to the admin');

-- …and notifies the employee (§30). Read it back AS JANE: an admin has no
-- policy granting sight of another person's notifications, which is itself
-- the behaviour we want.
select pg_temp.eq((select count(*) from notifications where user_id = :'jane'::uuid)::int, 0,
  'the admin cannot read Jane''s notification inbox');
select pg_temp.act_as(:'jane');
select pg_temp.ok(
  (select count(*) from notifications
    where user_id = :'jane'::uuid and title ilike '%approved%') > 0,
  'approving notifies the employee in-app');

select pg_temp.summary('SUITE 2 validation');
rollback;
