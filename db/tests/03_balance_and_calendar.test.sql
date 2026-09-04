-- ===========================================================================
-- SUITE 3 — Leave balance arithmetic (§10, §11, §23) and the working
--            calendar (§14, §22)
-- ---------------------------------------------------------------------------
-- Rolled back at the end; runs as the RLS-bound runtime role.
-- ===========================================================================
\set ON_ERROR_STOP on
\i _helpers.sql

\set jane  '22222222-2222-4222-8222-222222222222'
\set john  '33333333-3333-4333-8333-333333333333'
\set mike  '44444444-4444-4444-8444-444444444444'
\set admin '11111111-1111-4111-8111-111111111111'

\echo '--- SUITE 3: balance + working calendar ---'
begin;

select pg_temp.act_as(:'admin');

-- ---------------------------------------------------------------------------
-- The §22 worked example, end to end.
-- "Friday 18 Sep – Tuesday 22 Sep, working days Monday–Friday => 3 days"
-- ---------------------------------------------------------------------------
select pg_temp.eq(
  (app.calc_leave_days('2026-09-18', '2026-09-22') ->> 'totalCalendarDays')::int,
  5,
  'worked example: 5 calendar days'
);

select pg_temp.eq(
  (app.calc_leave_days('2026-09-18', '2026-09-22') ->> 'excludedNonOfficeDays')::int,
  2,
  'worked example: 2 non-working days excluded (Sat, Sun)'
);

select pg_temp.eq(
  (app.calc_leave_days('2026-09-18', '2026-09-22') ->> 'excludedHolidays')::int,
  0,
  'worked example: no holidays in range'
);

select pg_temp.eq(
  (app.calc_leave_days('2026-09-18', '2026-09-22') ->> 'leaveDays')::int,
  3,
  'worked example: 3 working days deducted'
);

-- A range that includes a Bank of Thailand holiday on a working day.
-- 12–13 Oct 2026 = Mon + Tue, and 13 Oct is a BOT public holiday.
select pg_temp.eq(
  (app.calc_leave_days('2026-10-12', '2026-10-13') ->> 'leaveDays')::int,
  1,
  'a BOT holiday falling on a working day is not deducted'
);

select pg_temp.eq(
  (app.calc_leave_days('2026-10-12', '2026-10-13') -> 'holidays' -> 0 ->> 'name'),
  'H.M. King Bhumibol Adulyadej The Great Memorial Day',
  'the breakdown names the holiday that was excluded'
);

select pg_temp.eq(
  (app.calc_leave_days('2026-10-12', '2026-10-13') -> 'holidays' -> 0 ->> 'source'),
  'BOT',
  'the breakdown records the holiday source as BOT'
);

-- Whole-year sanity: 2026 has 20 seeded BOT holidays.
select pg_temp.eq(
  (select count(*) from holidays where year = 2026 and active)::int,
  20,
  '20 Bank of Thailand holidays are loaded for 2026'
);

-- ---------------------------------------------------------------------------
-- Only APPROVED leave reduces the official balance (§10)
-- ---------------------------------------------------------------------------

-- Mike: entitlement 12.
-- Approved: 2 days (Aug).
-- Cancelled 2-day leave is ignored.
-- remaining = 12 - 2 = 10.
select pg_temp.eq(
  (select remaining from app.leave_balance(:'mike'::uuid, 2026)),
  10::numeric,
  'cancelled leave does not reduce the balance'
);

-- Jane: entitlement 15.
-- Approved: 7 days (Jun) + 3 days (Sep) = 10.
-- Rejected 1-day leave is ignored.
-- remaining = 15 - 10 = 5.
select pg_temp.eq(
  (select remaining from app.leave_balance(:'jane'::uuid, 2026)),
  5::numeric,
  'rejected leave does not reduce the balance'
);

-- John: entitlement 20.
-- Approved Annual Leave: 0 days.
-- Pending Annual Leave: 7 days.
-- remaining = 20 - 0 = 20.
-- available = 20 - 0 - 7 = 13.
select pg_temp.eq(
  (select remaining from app.leave_balance(:'john'::uuid, 2026)),
  20::numeric,
  'pending leave does NOT reduce the official remaining balance'
);

select pg_temp.eq(
  (select available from app.leave_balance(:'john'::uuid, 2026)),
  13::numeric,
  'pending leave IS reserved against what can still be booked'
);

-- Approving the 7 pending days moves them from pending into approved.
-- Approved becomes 7 days.
-- remaining = 20 - 7 = 13.
update leave_requests
set status = 'approved'
where employee_id = :'john'::uuid
  and status = 'pending';

select pg_temp.eq(
  (select remaining from app.leave_balance(:'john'::uuid, 2026)),
  13::numeric,
  'approving 7 pending days drops remaining from 20 to 13'
);

select pg_temp.eq(
  (select pending from app.leave_balance(:'john'::uuid, 2026)),
  0::numeric,
  'nothing is left pending afterwards'
);

-- ---------------------------------------------------------------------------
-- Entitlement changes flow straight through (§10)
-- ---------------------------------------------------------------------------

-- John now has 7 approved Annual Leave days.
-- Raising entitlement to 25 gives remaining = 25 - 7 = 18.
update leave_entitlements
set total_days = 25
where employee_id = :'john'::uuid
  and year = 2026;

select pg_temp.eq(
  (select remaining from app.leave_balance(:'john'::uuid, 2026)),
  18::numeric,
  'raising the entitlement to 25 raises remaining to 18'
);

-- ---------------------------------------------------------------------------
-- Balance is re-checked at APPROVAL time, not only at submission (§11)
-- ---------------------------------------------------------------------------

update leave_entitlements
set total_days = 30
where employee_id = :'mike'::uuid
  and year = 2026;

select pg_temp.act_as(:'mike');

insert into leave_requests (
  employee_id,
  leave_type,
  start_date,
  end_date,
  reason
)
-- 17 Mon-Fri working days in the range, minus the 7 Dec public holiday = 16 days.
values (
  :'mike'::uuid,
  'annual',
  '2026-11-16',
  '2026-12-08',
  'Long break'
);

select pg_temp.eq(
  (
    select leave_days
    from leave_requests
    where employee_id = :'mike'::uuid
      and reason = 'Long break'
  ),
  16::numeric,
  'the 16 Nov - 8 Dec range costs 16 days (17 working days minus one BOT holiday)'
);

-- Mike has 2 approved Annual Leave days.
-- With entitlement temporarily raised to 30:
-- available = 30 - 2 approved - 16 pending = 12.
select pg_temp.eq(
  (select available from app.leave_balance(:'mike'::uuid, 2026)),
  12::numeric,
  'Mike has 12 bookable days left after that 16-day pending request'
);

select pg_temp.act_as(:'admin');

-- HR now cuts Mike's entitlement below what is already pending.
update leave_entitlements
set total_days = 15
where employee_id = :'mike'::uuid
  and year = 2026;

select pg_temp.raises(
  'update leave_requests set status = ''approved''
   where employee_id = ''44444444-4444-4444-8444-444444444444''
     and reason = ''Long break''',
  'LEAVE_INSUFFICIENT_BALANCE_ON_APPROVE',
  'approval is refused when the entitlement no longer covers the request'
);

-- ---------------------------------------------------------------------------
-- Yearly isolation (§23)
-- ---------------------------------------------------------------------------

select pg_temp.eq(
  (select entitlement from app.leave_balance(:'jane'::uuid, 2027)),
  15::numeric,
  '2027 carries its own entitlement row'
);

select pg_temp.eq(
  (select approved from app.leave_balance(:'jane'::uuid, 2027)),
  0::numeric,
  '2026 usage does not bleed into the 2027 balance'
);

-- ---------------------------------------------------------------------------
-- Changing office days (§14): future maths changes, history does not
-- ---------------------------------------------------------------------------
-- John's approved 24 Aug – 1 Sep request was stored as 7 working days
-- under the Monday-Friday working calendar.

select pg_temp.eq(
  (
    select leave_days
    from leave_requests
    where employee_id = :'john'::uuid
      and start_date = '2026-08-24'
      and end_date = '2026-09-01'
  ),
  7::numeric,
  'baseline: the stored request is 7 days'
);

-- Admin changes the working calendar to Monday–Thursday,
-- backdated to 1 August. Friday becomes a non-working day.
select app.set_office_days(array[1, 2, 3, 4], '2026-08-01');

select pg_temp.eq(
  (app.calc_leave_days('2026-08-24', '2026-09-01') ->> 'leaveDays')::int,
  6,
  'recalculating that same range NOW yields 6 days (Friday is no longer a working day)'
);

select pg_temp.eq(
  (
    select leave_days
    from leave_requests
    where employee_id = :'john'::uuid
      and start_date = '2026-08-24'
      and end_date = '2026-09-01'
  ),
  7::numeric,
  'the stored, already-decided request is STILL 7 days — history is not rewritten'
);

select pg_temp.eq(
  (
    select (calc_breakdown ->> 'leaveDays')::int
    from leave_requests
    where employee_id = :'john'::uuid
      and start_date = '2026-08-24'
      and end_date = '2026-09-01'
  ),
  7,
  'its saved breakdown still explains the original 7 days'
);

-- The previous configuration generation was closed, not deleted.
select pg_temp.eq(
  (
    select count(*)
    from office_days
    where effective_to is not null
  )::int,
  7,
  'the superseded office-day generation is retained with an end date'
);

select pg_temp.ok(
  app.is_office_day('2026-07-31') = true,
  'a Friday BEFORE the change is still a working day (point-in-time lookup)'
);

select pg_temp.ok(
  app.is_office_day('2026-08-28') = false,
  'a Friday AFTER the change is no longer a working day'
);

-- Reconfiguration is audited (§17).
select pg_temp.ok(
  (
    select count(*)
    from audit_logs
    where entity_type = 'office_day'
      and created_at > now() - interval '1 minute'
  ) > 0,
  'office-day changes are written to the audit trail'
);

-- ---------------------------------------------------------------------------
-- "Next upcoming leave" (§12) — the query the employee dashboard runs
-- ---------------------------------------------------------------------------

select pg_temp.act_as(:'jane');

select pg_temp.eq(
  (
    select start_date
    from leave_requests
    where employee_id = :'jane'::uuid
      and status = 'approved'
      and end_date >= date '2026-08-14'
    order by start_date
    limit 1
  ),
  date '2026-09-18',
  'Jane''s next upcoming approved leave is 18 Sep 2026'
);

select pg_temp.summary('SUITE 3 balance + calendar');
rollback;