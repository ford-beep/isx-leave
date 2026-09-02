begin;

-- ============================================================================
-- 0013_historical_leave_import.sql
--
-- Controlled import path for historical leave records.
--
-- IMPORTANT:
-- - Normal employee/admin leave flow remains unchanged.
-- - Historical imports are Admin-only.
-- - Normal leave validation is bypassed ONLY while the controlled import
--   function is executing.
-- - Normal leave notifications are suppressed for imported historical rows.
-- - Every imported leave writes an explicit audit record.
--
-- This facility is temporary and should be removed after the historical
-- migration is completed successfully.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Normal validation trigger
--
-- Historical import mode is accepted only when:
--   1. transaction-local flag is ON
--   2. current application user is an Admin
--
-- All normal requests continue through app.validate_leave_request().
-- ---------------------------------------------------------------------------

drop trigger if exists trg_leave_requests_validate
on public.leave_requests;

create trigger trg_leave_requests_validate
before insert or update
on public.leave_requests
for each row
when (
  not (
    coalesce(
      current_setting('app.historical_import', true),
      'off'
    ) = 'on'
    and app.is_admin()
  )
)
execute function app.validate_leave_request();


-- ---------------------------------------------------------------------------
-- Normal audit / notification trigger
--
-- Historical imports must NOT generate normal:
--   - leave.submitted
--   - "New leave request" notifications
--
-- The controlled import function writes its own historical audit instead.
-- ---------------------------------------------------------------------------

drop trigger if exists trg_leave_requests_audit
on public.leave_requests;

create trigger trg_leave_requests_audit
after insert or update
on public.leave_requests
for each row
when (
  not (
    coalesce(
      current_setting('app.historical_import', true),
      'off'
    ) = 'on'
    and app.is_admin()
  )
)
execute function app.audit_leave_request();


-- ============================================================================
-- Controlled historical leave import
-- ============================================================================

create or replace function app.import_historical_leave(
  p_employee_id uuid,
  p_leave_type text,
  p_start_date date,
  p_end_date date,
  p_leave_session text,
  p_leave_days numeric,
  p_reason text default null,
  p_source_file text default 'Leave_Data_update.xlsx'
)
returns uuid
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
declare
  v_caller uuid;
  v_leave_id uuid;
  v_session public.leave_session;
begin

  -- -------------------------------------------------------------------------
  -- Authentication / authorization
  -- -------------------------------------------------------------------------

  v_caller := app.current_user_id();

  if v_caller is null then
    raise exception 'AUTH_REQUIRED';
  end if;

  if not app.is_admin() then
    raise exception 'FORBIDDEN_ADMIN_ONLY';
  end if;


  -- -------------------------------------------------------------------------
  -- Employee
  -- -------------------------------------------------------------------------

  if p_employee_id is null then
    raise exception 'HISTORICAL_EMPLOYEE_REQUIRED';
  end if;

  if not exists (
    select 1
    from public.users u
    where u.id = p_employee_id
  ) then
    raise exception 'HISTORICAL_EMPLOYEE_NOT_FOUND:%',
      p_employee_id;
  end if;


  -- -------------------------------------------------------------------------
  -- Leave type
  -- -------------------------------------------------------------------------

  if p_leave_type not in ('annual', 'comp_day') then
    raise exception 'HISTORICAL_LEAVE_TYPE_INVALID:%',
      p_leave_type;
  end if;


  -- -------------------------------------------------------------------------
  -- Dates
  -- -------------------------------------------------------------------------

  if p_start_date is null
     or p_end_date is null then
    raise exception 'HISTORICAL_DATE_REQUIRED';
  end if;

  if p_end_date < p_start_date then
    raise exception 'HISTORICAL_END_BEFORE_START';
  end if;

  if extract(year from p_start_date)
     <> extract(year from p_end_date) then
    raise exception 'HISTORICAL_LEAVE_SPANS_TWO_YEARS';
  end if;


  -- -------------------------------------------------------------------------
  -- Session
  --
  -- "half_day" is intentionally supported for imported historical rows where
  -- the old source does not identify Morning vs Afternoon.
  -- -------------------------------------------------------------------------

  if p_leave_session not in (
    'full_day',
    'morning',
    'afternoon',
    'half_day'
  ) then
    raise exception 'HISTORICAL_SESSION_INVALID:%',
      p_leave_session;
  end if;

  v_session :=
    p_leave_session::public.leave_session;


  -- -------------------------------------------------------------------------
  -- Leave days
  -- -------------------------------------------------------------------------

  if p_leave_days is null
     or p_leave_days <= 0 then
    raise exception 'HISTORICAL_LEAVE_DAYS_INVALID:%',
      p_leave_days;
  end if;


  if v_session in (
    'morning'::public.leave_session,
    'afternoon'::public.leave_session,
    'half_day'::public.leave_session
  ) then

    if p_start_date <> p_end_date then
      raise exception 'HISTORICAL_HALF_DAY_SINGLE_DATE_ONLY';
    end if;

    if p_leave_days <> 0.5 then
      raise exception 'HISTORICAL_HALF_DAY_MUST_EQUAL_0_5:%',
        p_leave_days;
    end if;

  end if;


  -- Comp Day historical requests remain either:
  --   Full = 1.0
  --   Half = 0.5
  if p_leave_type = 'comp_day' then

    if p_start_date <> p_end_date then
      raise exception 'HISTORICAL_COMP_DAY_SINGLE_DATE_ONLY';
    end if;

    if v_session = 'full_day'::public.leave_session
       and p_leave_days <> 1 then
      raise exception 'HISTORICAL_COMP_FULL_DAY_MUST_EQUAL_1:%',
        p_leave_days;
    end if;

    if v_session in (
      'morning'::public.leave_session,
      'afternoon'::public.leave_session,
      'half_day'::public.leave_session
    )
    and p_leave_days <> 0.5 then
      raise exception 'HISTORICAL_COMP_HALF_DAY_MUST_EQUAL_0_5:%',
        p_leave_days;
    end if;

  end if;


  -- -------------------------------------------------------------------------
  -- Enable the narrowly-scoped historical mode.
  --
  -- true = transaction-local setting.
  -- We still explicitly turn it OFF immediately after the INSERT.
  -- -------------------------------------------------------------------------

  perform set_config(
    'app.historical_import',
    'on',
    true
  );


  begin

    insert into public.leave_requests (
      employee_id,
      leave_type,
      start_date,
      end_date,
      leave_session,
      leave_days,
      calc_breakdown,
      reason,
      status,
      approved_by,
      approved_at
    )
    values (
      p_employee_id,
      p_leave_type,
      p_start_date,
      p_end_date,
      v_session,
      p_leave_days,

      jsonb_build_object(
        'historicalImport', true,
        'sourceFile', p_source_file,
        'leaveType', p_leave_type,
        'leaveSession', p_leave_session,
        'startDate',
          to_char(p_start_date, 'YYYY-MM-DD'),
        'endDate',
          to_char(p_end_date, 'YYYY-MM-DD'),
        'leaveDays', p_leave_days,
        'importedAt',
          to_char(
            current_timestamp,
            'YYYY-MM-DD"T"HH24:MI:SSOF'
          )
      ),

      nullif(btrim(p_reason), ''),
      'approved',
      v_caller,
      now()
    )
    returning id
    into v_leave_id;


    -- Turn historical mode OFF immediately after the single INSERT.
    perform set_config(
      'app.historical_import',
      'off',
      true
    );


  exception
    when others then

      -- Defence in depth:
      -- never leave the bypass flag enabled after a failed INSERT.
      perform set_config(
        'app.historical_import',
        'off',
        true
      );

      raise;
  end;


  -- -------------------------------------------------------------------------
  -- Explicit historical audit.
  --
  -- The normal audit trigger was intentionally suppressed above so historical
  -- records do not generate normal leave-request notifications.
  -- -------------------------------------------------------------------------

  perform app.write_audit(
    'leave.historical_imported',
    'leave_request',
    v_leave_id,
    jsonb_build_object(
      'employee_id', p_employee_id,
      'leave_type', p_leave_type,
      'start_date', p_start_date,
      'end_date', p_end_date,
      'leave_session', p_leave_session,
      'leave_days', p_leave_days,
      'source_file', p_source_file
    )
  );


  return v_leave_id;

end;
$$;


-- ---------------------------------------------------------------------------
-- Permissions
-- ---------------------------------------------------------------------------

revoke all
on function app.import_historical_leave(
  uuid,
  text,
  date,
  date,
  text,
  numeric,
  text,
  text
)
from public;

grant execute
on function app.import_historical_leave(
  uuid,
  text,
  date,
  date,
  text,
  numeric,
  text,
  text
)
to isx_app;


comment on function app.import_historical_leave(
  uuid,
  text,
  date,
  date,
  text,
  numeric,
  text,
  text
)
is
'Temporary Admin-only function for importing approved historical leave without normal request notifications. Remove after the historical migration is complete.';


commit;