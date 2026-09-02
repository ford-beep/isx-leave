-- 0010_half_day_leave.sql
-- Add Full Day / Half Day support to Annual Leave and Comp Day.
--
-- leave_session:
--   full_day  = normal full-day leave
--   morning   = AM half-day leave
--   afternoon = PM half-day leave
--   half_day  = historical half-day where AM/PM is unknown
--
-- The application should expose full_day / morning / afternoon only.
-- half_day is reserved for historical imports.

begin;


-- ============================================================================
-- LEAVE SESSION
-- ============================================================================

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where n.nspname = 'public'
      and t.typname = 'leave_session'
  ) then
    create type public.leave_session as enum (
      'full_day',
      'morning',
      'afternoon',
      'half_day'
    );
  end if;
end
$$;


alter table public.leave_requests
  add column if not exists leave_session public.leave_session;


-- Existing requests were created before Half Day existed,
-- therefore they are full-day requests.
update public.leave_requests
set leave_session = 'full_day'
where leave_session is null;


alter table public.leave_requests
  alter column leave_session set default 'full_day',
  alter column leave_session set not null;


-- ============================================================================
-- VALIDATION
-- ============================================================================

create or replace function app.validate_leave_request()
returns trigger
language plpgsql
as $$
declare
  calc                  jsonb;
  bal                   record;
  caller_admin          boolean := app.is_admin();
  caller                uuid := app.current_user_id();
  approved_elsewhere    numeric;
  ent                   numeric;
  yr                    int;
  effective_mode        work_mode;
  is_holiday            boolean;
  is_weekend            boolean;
  earliest_start        date;
  requested_days        numeric;
begin

  -- ==========================================================================
  -- INSERT
  -- ==========================================================================

  if tg_op = 'INSERT' then

    if not caller_admin
       and new.employee_id is distinct from caller then
      raise exception 'FORBIDDEN_EMPLOYEE_MISMATCH';
    end if;

    if new.status <> 'pending' then
      raise exception 'LEAVE_MUST_START_PENDING';
    end if;

    if new.end_date < new.start_date then
      raise exception 'LEAVE_END_BEFORE_START';
    end if;

    if extract(year from new.start_date)
       <> extract(year from new.end_date) then
      raise exception 'LEAVE_SPANS_TWO_YEARS';
    end if;


    -- Half Day must always be a single calendar date.
    if new.leave_session in (
      'morning'::public.leave_session,
      'afternoon'::public.leave_session,
      'half_day'::public.leave_session
    )
    and new.start_date <> new.end_date then
      raise exception 'HALF_DAY_SINGLE_DATE_ONLY';
    end if;


    earliest_start :=
      (current_timestamp at time zone 'Asia/Bangkok')::date + 7;


    -- Employees must request leave at least 7 calendar days in advance.
    -- Comp Day always requires 7 days in advance.
    -- Admin may bypass the Annual Leave rule for emergency/admin handling.
    if new.start_date < earliest_start
       and (
         new.leave_type = 'comp_day'
         or not caller_admin
       ) then
      raise exception 'LEAVE_REQUIRES_7_DAY_ADVANCE:%', earliest_start;
    end if;


    -- ========================================================================
    -- COMP DAY
    -- ========================================================================

    if new.leave_type = 'comp_day' then

      -- Comp Day remains a single-date request.
      if new.start_date <> new.end_date then
        raise exception 'COMP_DAY_SINGLE_DAY_ONLY';
      end if;


      is_weekend :=
        extract(dow from new.start_date)::int in (0, 6);

      if is_weekend then
        raise exception 'COMP_DAY_WEEKDAY_ONLY';
      end if;


      select exists (
        select 1
        from public.holidays h
        where h.holiday_date = new.start_date
          and h.active
      )
      into is_holiday;

      if is_holiday then
        raise exception 'COMP_DAY_NOT_ON_HOLIDAY';
      end if;


      effective_mode :=
        app.effective_work_mode(new.start_date);

      if effective_mode <> 'wfh'::work_mode then
        raise exception 'COMP_DAY_WFH_ONLY';
      end if;


      if new.leave_session = 'full_day'::public.leave_session then
  requested_days := 1;

elsif new.leave_session in (
  'morning'::public.leave_session,
  'afternoon'::public.leave_session,
  'half_day'::public.leave_session
) then
  requested_days := 0.5;

else
  raise exception 'LEAVE_SESSION_NOT_SUPPORTED:%',
    new.leave_session;
end if;

      new.leave_days := requested_days;


      new.calc_breakdown := jsonb_build_object(
        'leaveType', 'comp_day',
        'leaveSession', new.leave_session::text,
        'startDate', to_char(new.start_date, 'YYYY-MM-DD'),
        'endDate', to_char(new.end_date, 'YYYY-MM-DD'),
        'leaveDays', requested_days,
        'effectiveWorkMode', effective_mode::text,
        'holiday', false,
        'weekend', false,
        'computedAt',
          to_char(
            current_timestamp,
            'YYYY-MM-DD"T"HH24:MI:SSOF'
          )
      );


      select count(*)::numeric
      into ent
      from public.comp_day_credits c
      where c.employee_id = new.employee_id
        and c.earned_year =
          extract(year from new.start_date)::int;


      select coalesce(sum(lr.leave_days), 0)
      into approved_elsewhere
      from public.leave_requests lr
      where lr.employee_id = new.employee_id
        and lr.leave_year =
          extract(year from new.start_date)::int
        and lr.leave_type = 'comp_day'
        and lr.status in ('approved', 'pending');


      if approved_elsewhere + requested_days > ent then
        raise exception 'COMP_DAY_INSUFFICIENT_BALANCE:%:%',
          ent - approved_elsewhere,
          requested_days;
      end if;


      return new;

    end if;


    -- ========================================================================
    -- ANNUAL LEAVE
    -- ========================================================================

    if new.leave_type = 'annual' then

      -- ----------------------------------------------------------------------
      -- Annual Half Day
      -- ----------------------------------------------------------------------

      if new.leave_session in (
        'morning'::public.leave_session,
        'afternoon'::public.leave_session,
        'half_day'::public.leave_session
      ) then

        -- Half Day must be a weekday.
        is_weekend :=
          extract(dow from new.start_date)::int in (0, 6);

        if is_weekend then
          raise exception 'HALF_DAY_WEEKDAY_ONLY';
        end if;


        -- Half Day cannot be requested on a company holiday.
        select exists (
          select 1
          from public.holidays h
          where h.holiday_date = new.start_date
            and h.active
        )
        into is_holiday;

        if is_holiday then
          raise exception 'HALF_DAY_NOT_ON_HOLIDAY';
        end if;


        new.leave_days := 0.5;

        new.calc_breakdown := jsonb_build_object(
          'leaveType', 'annual',
          'leaveSession', new.leave_session::text,
          'startDate', to_char(new.start_date, 'YYYY-MM-DD'),
          'endDate', to_char(new.end_date, 'YYYY-MM-DD'),
          'leaveDays', 0.5,
          'holiday', false,
          'weekend', false,
          'computedAt',
            to_char(
              current_timestamp,
              'YYYY-MM-DD"T"HH24:MI:SSOF'
            )
        );

      -- ----------------------------------------------------------------------
      -- Annual Full Day
      -- ----------------------------------------------------------------------

      else

        calc :=
          app.calc_leave_days(
            new.start_date,
            new.end_date
          );

        new.leave_days :=
          (calc ->> 'leaveDays')::numeric;

        new.calc_breakdown :=
          calc || jsonb_build_object(
            'leaveType', 'annual',
            'leaveSession', 'full_day'
          );

      end if;


      if new.leave_days <= 0 then
        raise exception 'LEAVE_NO_WORKING_DAYS';
      end if;


      select *
      into bal
      from app.leave_balance(
        new.employee_id,
        extract(year from new.start_date)::int
      );


      if new.leave_days > bal.available then
        raise exception 'LEAVE_INSUFFICIENT_BALANCE:%:%',
          bal.available,
          new.leave_days;
      end if;


      return new;

    end if;


    raise exception 'LEAVE_TYPE_NOT_SUPPORTED:%',
      new.leave_type;

  end if;


  -- ==========================================================================
  -- UPDATE
  -- ==========================================================================

  if tg_op = 'UPDATE' then

    -- Submitted request details are immutable.
    if new.start_date is distinct from old.start_date
       or new.end_date is distinct from old.end_date
       or new.leave_days is distinct from old.leave_days
       or new.employee_id is distinct from old.employee_id
       or new.leave_type is distinct from old.leave_type
       or new.leave_session is distinct from old.leave_session
       or new.calc_breakdown is distinct from old.calc_breakdown then
      raise exception 'LEAVE_IMMUTABLE_AFTER_SUBMIT';
    end if;


    if new.status is distinct from old.status then

      -- ======================================================================
      -- ALLOWED STATUS TRANSITIONS
      -- ======================================================================

      if caller_admin then

        if old.status = 'pending'
           and new.status in (
             'approved',
             'rejected',
             'cancelled'
           ) then
          null;

        -- Preserve migration 0007.
        elsif old.status = 'approved'
              and new.status = 'cancelled' then
          null;

        elsif old.status in ('rejected', 'cancelled') then
          raise exception 'LEAVE_ALREADY_DECIDED';

        else
          raise exception 'LEAVE_INVALID_TRANSITION';
        end if;

      else

        -- Defence in depth.
        -- Migration 0006 already prevents non-admin status changes.
        if new.status <> 'cancelled'
           or old.status <> 'pending'
           or old.employee_id is distinct from caller then
          raise exception 'LEAVE_INVALID_TRANSITION';
        end if;

      end if;


      -- ======================================================================
      -- APPROVE
      -- ======================================================================

      if new.status = 'approved' then

        yr :=
          extract(year from new.start_date)::int;


        -- --------------------------------------------------------------------
        -- COMP DAY
        -- --------------------------------------------------------------------

        if new.leave_type = 'comp_day' then

          -- Re-check because Admin may have changed Work Mode
          -- after submission.
          is_weekend :=
            extract(dow from new.start_date)::int in (0, 6);

          if is_weekend then
            raise exception 'COMP_DAY_WEEKDAY_ONLY';
          end if;


          select exists (
            select 1
            from public.holidays h
            where h.holiday_date = new.start_date
              and h.active
          )
          into is_holiday;

          if is_holiday then
            raise exception 'COMP_DAY_NOT_ON_HOLIDAY';
          end if;


          effective_mode :=
            app.effective_work_mode(new.start_date);

          if effective_mode <> 'wfh'::work_mode then
            raise exception 'COMP_DAY_WFH_ONLY';
          end if;


          select count(*)::numeric
          into ent
          from public.comp_day_credits c
          where c.employee_id = new.employee_id
            and c.earned_year = yr;


          -- Count only OTHER approved Comp Day requests.
          select coalesce(sum(lr.leave_days), 0)
          into approved_elsewhere
          from public.leave_requests lr
          where lr.employee_id = new.employee_id
            and lr.leave_year = yr
            and lr.leave_type = 'comp_day'
            and lr.status = 'approved'
            and lr.id <> new.id;


          if approved_elsewhere + new.leave_days > ent then
            raise exception
              'COMP_DAY_INSUFFICIENT_BALANCE_ON_APPROVE:%:%',
              ent - approved_elsewhere,
              new.leave_days;
          end if;


        -- --------------------------------------------------------------------
        -- ANNUAL LEAVE
        -- --------------------------------------------------------------------

        elsif new.leave_type = 'annual' then

          select coalesce(sum(lr.leave_days), 0)
          into approved_elsewhere
          from public.leave_requests lr
          join public.leave_types lt
            on lt.code = lr.leave_type
          where lr.employee_id = new.employee_id
            and lr.leave_year = yr
            and lr.status = 'approved'
            and lr.id <> new.id
            and lt.deducts_balance;


          select b.entitlement
          into ent
          from app.leave_balance(
            new.employee_id,
            yr
          ) b;


          if approved_elsewhere + new.leave_days > ent then
            raise exception
              'LEAVE_INSUFFICIENT_BALANCE_ON_APPROVE:%:%',
              ent - approved_elsewhere,
              new.leave_days;
          end if;

        else
          raise exception 'LEAVE_TYPE_NOT_SUPPORTED:%',
            new.leave_type;
        end if;


        new.approved_by :=
          coalesce(new.approved_by, caller);

        new.approved_at :=
          coalesce(new.approved_at, now());


      -- ======================================================================
      -- REJECT
      -- ======================================================================

      elsif new.status = 'rejected' then

        if new.rejection_reason is null
           or length(btrim(new.rejection_reason)) = 0 then
          raise exception 'LEAVE_REJECTION_REASON_REQUIRED';
        end if;

        new.approved_by :=
          coalesce(new.approved_by, caller);

        new.approved_at :=
          coalesce(new.approved_at, now());


      -- ======================================================================
      -- CANCEL
      -- ======================================================================

      elsif new.status = 'cancelled' then

        new.cancelled_at :=
          coalesce(new.cancelled_at, now());

      end if;

    end if;


    return new;

  end if;


  return new;

end;
$$;


commit;