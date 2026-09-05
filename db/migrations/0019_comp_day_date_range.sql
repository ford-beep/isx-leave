BEGIN;

-- ============================================================================
-- COMPENSATORY LEAVE DATE RANGE
-- ============================================================================
-- Full Day Compensatory Leave may span a date range.
--
-- Eligible Comp Day usage:
-- - Monday-Friday
-- - not an active company/public holiday
-- - effective work mode is WFH
--
-- Weekends, holidays and Office days inside a Full Day range are skipped.
-- Half Day Compensatory Leave remains single-date and must itself be eligible.
--
-- Existing Annual Leave, Sick Leave, cancellation and status-transition
-- behaviour is preserved.
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
  comp_days             jsonb;
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


    -- Advance notice applies only to Annual / Comp Day.
    -- Sick Leave is recorded by Admin and may be same-day or historical.
    if new.leave_type <> 'sick'
       and new.start_date < earliest_start
       and (
         new.leave_type = 'comp_day'
         or not caller_admin
       ) then
      raise exception
        'LEAVE_REQUIRES_7_DAY_ADVANCE:%',
        earliest_start;
    end if;


    -- ========================================================================
    -- COMP DAY
    -- ========================================================================

    if new.leave_type = 'comp_day' then

      -- ----------------------------------------------------------------------
      -- Comp Day Half Day
      -- ----------------------------------------------------------------------
      -- Half Day remains a single-date request and the selected date itself
      -- must be an eligible WFH weekday.
      -- ----------------------------------------------------------------------

      if new.leave_session in (
        'morning'::public.leave_session,
        'afternoon'::public.leave_session,
        'half_day'::public.leave_session
      ) then

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


        requested_days := 0.5;

        comp_days :=
          jsonb_build_array(
            jsonb_build_object(
              'date',
                to_char(
                  new.start_date,
                  'YYYY-MM-DD'
                ),
              'officeDay',
                false,
              'holiday',
                null,
              'deducted',
                true
            )
          );


      -- ----------------------------------------------------------------------
      -- Comp Day Full Day
      -- ----------------------------------------------------------------------
      -- Count only eligible WFH weekdays in the selected range.
      -- Weekends, active holidays and Office days remain in the range but
      -- consume no Comp Day balance.
      -- ----------------------------------------------------------------------

      elsif new.leave_session =
            'full_day'::public.leave_session then

        select
          count(*) filter (
            where not x.is_weekend
              and not x.is_holiday
              and x.mode = 'wfh'::work_mode
          )::numeric,

          coalesce(
            jsonb_agg(
              jsonb_build_object(
                'date',
                  to_char(
                    x.day,
                    'YYYY-MM-DD'
                  ),
                'officeDay',
                  x.mode = 'office'::work_mode,
                'holiday',
                  case
                    when x.is_holiday
                    then x.holiday_name
                    else null
                  end,
                'deducted',
                  (
                    not x.is_weekend
                    and not x.is_holiday
                    and x.mode = 'wfh'::work_mode
                  )
              )
              order by x.day
            ),
            '[]'::jsonb
          )
        into
          requested_days,
          comp_days
        from (
          select
            d.day::date as day,

            extract(
              isodow from d.day
            ) in (6, 7) as is_weekend,

            app.effective_work_mode(
              d.day::date
            ) as mode,

            exists (
              select 1
              from public.holidays h
              where h.holiday_date = d.day::date
                and h.active
            ) as is_holiday,

            (
              select h.name
              from public.holidays h
              where h.holiday_date = d.day::date
                and h.active
              order by h.name
              limit 1
            ) as holiday_name

          from generate_series(
            new.start_date,
            new.end_date,
            interval '1 day'
          ) as d(day)
        ) x;


        if requested_days <= 0 then
          raise exception 'COMP_DAY_NO_ELIGIBLE_WFH_DAYS';
        end if;

      else
        raise exception
          'LEAVE_SESSION_NOT_SUPPORTED:%',
          new.leave_session;
      end if;


      new.leave_days := requested_days;


      new.calc_breakdown :=
        jsonb_build_object(
          'leaveType',
            'comp_day',
          'leaveSession',
            new.leave_session::text,
          'startDate',
            to_char(
              new.start_date,
              'YYYY-MM-DD'
            ),
          'endDate',
            to_char(
              new.end_date,
              'YYYY-MM-DD'
            ),
          'leaveDays',
            requested_days,
          'days',
            comp_days,
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
        and lr.status in (
          'approved',
          'pending'
        );


      if approved_elsewhere + requested_days > ent then
        raise exception
          'COMP_DAY_INSUFFICIENT_BALANCE:%:%',
          ent - approved_elsewhere,
          requested_days;
      end if;


      return new;

    end if;


    -- ========================================================================
    -- SICK LEAVE
    -- ========================================================================

    if new.leave_type = 'sick' then

      -- Sick Leave is Admin-created only.
      if not caller_admin then
        raise exception 'SICK_LEAVE_ADMIN_ONLY';
      end if;


      -- Half Day Sick Leave
      if new.leave_session in (
        'morning'::public.leave_session,
        'afternoon'::public.leave_session,
        'half_day'::public.leave_session
      ) then

        is_weekend :=
          extract(dow from new.start_date)::int in (0, 6);

        if is_weekend then
          raise exception 'SICK_LEAVE_WEEKDAY_ONLY';
        end if;


        select exists (
          select 1
          from public.holidays h
          where h.holiday_date = new.start_date
            and h.active
        )
        into is_holiday;

        if is_holiday then
          raise exception 'SICK_LEAVE_NOT_ON_HOLIDAY';
        end if;


        new.leave_days := 0.5;

        new.calc_breakdown :=
          jsonb_build_object(
            'leaveType',
              'sick',
            'leaveSession',
              new.leave_session::text,
            'startDate',
              to_char(
                new.start_date,
                'YYYY-MM-DD'
              ),
            'endDate',
              to_char(
                new.end_date,
                'YYYY-MM-DD'
              ),
            'leaveDays',
              0.5,
            'computedAt',
              to_char(
                current_timestamp,
                'YYYY-MM-DD"T"HH24:MI:SSOF'
              )
          );


      -- Full Day Sick Leave
      else

        select count(*)::numeric
        into requested_days
        from generate_series(
          new.start_date,
          new.end_date,
          interval '1 day'
        ) as d(day)
        where extract(
          isodow from d.day
        ) between 1 and 5
          and not exists (
            select 1
            from public.holidays h
            where h.holiday_date =
              d.day::date
              and h.active
          );


        if requested_days <= 0 then
          raise exception 'LEAVE_NO_WORKING_DAYS';
        end if;


        new.leave_days := requested_days;

        new.calc_breakdown :=
          jsonb_build_object(
            'leaveType',
              'sick',
            'leaveSession',
              'full_day',
            'startDate',
              to_char(
                new.start_date,
                'YYYY-MM-DD'
              ),
            'endDate',
              to_char(
                new.end_date,
                'YYYY-MM-DD'
              ),
            'leaveDays',
              requested_days,
            'computedAt',
              to_char(
                current_timestamp,
                'YYYY-MM-DD"T"HH24:MI:SSOF'
              )
          );

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

        is_weekend :=
          extract(dow from new.start_date)::int in (0, 6);

        if is_weekend then
          raise exception 'HALF_DAY_WEEKDAY_ONLY';
        end if;


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

        new.calc_breakdown :=
          jsonb_build_object(
            'leaveType',
              'annual',
            'leaveSession',
              new.leave_session::text,
            'startDate',
              to_char(
                new.start_date,
                'YYYY-MM-DD'
              ),
            'endDate',
              to_char(
                new.end_date,
                'YYYY-MM-DD'
              ),
            'leaveDays',
              0.5,
            'holiday',
              false,
            'weekend',
              false,
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
          calc ||
          jsonb_build_object(
            'leaveType',
              'annual',
            'leaveSession',
              'full_day'
          );

      end if;


      if new.leave_days <= 0 then
        raise exception 'LEAVE_NO_WORKING_DAYS';
      end if;


      select *
      into bal
      from app.leave_balance(
        new.employee_id,
        extract(
          year from new.start_date
        )::int
      );


      if new.leave_days > bal.available then
        raise exception
          'LEAVE_INSUFFICIENT_BALANCE:%:%',
          bal.available,
          new.leave_days;
      end if;


      return new;

    end if;


    raise exception
      'LEAVE_TYPE_NOT_SUPPORTED:%',
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

        elsif old.status = 'approved'
              and new.status = 'cancelled' then
          null;

        elsif old.status in (
          'rejected',
          'cancelled'
        ) then
          raise exception 'LEAVE_ALREADY_DECIDED';

        else
          raise exception 'LEAVE_INVALID_TRANSITION';
        end if;


      else

        -- Employee self-cancel:
        -- - own leave only
        -- - Annual / Comp Day only
        -- - Pending or Approved only
        -- - must cancel before the leave start date (Asia/Bangkok)
        if new.status <> 'cancelled'
           or old.status not in (
             'pending',
             'approved'
           )
           or old.employee_id is distinct from caller
           or old.leave_type not in (
             'annual',
             'comp_day'
           )
           or (
             current_timestamp
             at time zone 'Asia/Bangkok'
           )::date >= old.start_date then
          raise exception 'LEAVE_INVALID_TRANSITION';
        end if;

      end if;


      -- ======================================================================
      -- APPROVE
      -- ======================================================================

      if new.status = 'approved' then

        yr :=
          extract(
            year from new.start_date
          )::int;


        -- --------------------------------------------------------------------
        -- COMP DAY
        -- --------------------------------------------------------------------

        if new.leave_type = 'comp_day' then

          -- Re-check the complete Comp Day request because Work Mode
          -- or Holiday configuration may have changed after submission.

          if new.leave_session in (
            'morning'::public.leave_session,
            'afternoon'::public.leave_session,
            'half_day'::public.leave_session
          ) then

            is_weekend :=
              extract(
                dow from new.start_date
              )::int in (0, 6);

            if is_weekend then
              raise exception 'COMP_DAY_WEEKDAY_ONLY';
            end if;


            select exists (
              select 1
              from public.holidays h
              where h.holiday_date =
                new.start_date
                and h.active
            )
            into is_holiday;

            if is_holiday then
              raise exception 'COMP_DAY_NOT_ON_HOLIDAY';
            end if;


            effective_mode :=
              app.effective_work_mode(
                new.start_date
              );

            if effective_mode <>
               'wfh'::work_mode then
              raise exception 'COMP_DAY_WFH_ONLY';
            end if;


            requested_days := 0.5;


          elsif new.leave_session =
                'full_day'::public.leave_session then

            select count(*)::numeric
            into requested_days
            from generate_series(
              new.start_date,
              new.end_date,
              interval '1 day'
            ) as d(day)
            where extract(
              isodow from d.day
            ) between 1 and 5

              and not exists (
                select 1
                from public.holidays h
                where h.holiday_date =
                  d.day::date
                  and h.active
              )

              and app.effective_work_mode(
                d.day::date
              ) = 'wfh'::work_mode;


            if requested_days <= 0 then
              raise exception
                'COMP_DAY_NO_ELIGIBLE_WFH_DAYS';
            end if;

          else
            raise exception
              'LEAVE_SESSION_NOT_SUPPORTED:%',
              new.leave_session;
          end if;


          -- The request snapshot is immutable after submission.
          -- If eligibility changed enough to alter its leave-day amount,
          -- Admin must not approve a stale request.
          if requested_days <>
             new.leave_days then
            raise exception
              'COMP_DAY_ELIGIBILITY_CHANGED:%:%',
              new.leave_days,
              requested_days;
          end if;


          select count(*)::numeric
          into ent
          from public.comp_day_credits c
          where c.employee_id =
            new.employee_id
            and c.earned_year = yr;


          -- Count only OTHER approved Comp Day requests.
          select coalesce(
            sum(lr.leave_days),
            0
          )
          into approved_elsewhere
          from public.leave_requests lr
          where lr.employee_id =
            new.employee_id
            and lr.leave_year = yr
            and lr.leave_type =
              'comp_day'
            and lr.status =
              'approved'
            and lr.id <> new.id;


          if approved_elsewhere +
             new.leave_days > ent then
            raise exception
              'COMP_DAY_INSUFFICIENT_BALANCE_ON_APPROVE:%:%',
              ent - approved_elsewhere,
              new.leave_days;
          end if;


        -- --------------------------------------------------------------------
        -- ANNUAL LEAVE
        -- --------------------------------------------------------------------

        elsif new.leave_type = 'annual' then

          select coalesce(
            sum(lr.leave_days),
            0
          )
          into approved_elsewhere
          from public.leave_requests lr
          join public.leave_types lt
            on lt.code = lr.leave_type
          where lr.employee_id =
            new.employee_id
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


          if approved_elsewhere +
             new.leave_days > ent then
            raise exception
              'LEAVE_INSUFFICIENT_BALANCE_ON_APPROVE:%:%',
              ent - approved_elsewhere,
              new.leave_days;
          end if;


        -- --------------------------------------------------------------------
        -- SICK LEAVE
        -- --------------------------------------------------------------------

        elsif new.leave_type = 'sick' then
          null;

        else
          raise exception
            'LEAVE_TYPE_NOT_SUPPORTED:%',
            new.leave_type;
        end if;


        new.approved_by :=
          coalesce(
            new.approved_by,
            caller
          );

        new.approved_at :=
          coalesce(
            new.approved_at,
            now()
          );


      -- ======================================================================
      -- REJECT
      -- ======================================================================

      elsif new.status = 'rejected' then

        if new.rejection_reason is null
           or length(
             btrim(
               new.rejection_reason
             )
           ) = 0 then
          raise exception
            'LEAVE_REJECTION_REASON_REQUIRED';
        end if;

        new.approved_by :=
          coalesce(
            new.approved_by,
            caller
          );

        new.approved_at :=
          coalesce(
            new.approved_at,
            now()
          );


      -- ======================================================================
      -- CANCEL
      -- ======================================================================

      elsif new.status = 'cancelled' then

        new.cancelled_at :=
          coalesce(
            new.cancelled_at,
            now()
          );

      end if;

    end if;


    return new;

  end if;


  return new;

end;
$$;

COMMIT;
