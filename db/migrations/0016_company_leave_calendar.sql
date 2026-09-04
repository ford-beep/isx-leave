BEGIN;

-- ============================================================
-- 0016_company_leave_calendar.sql
--
-- Allow active employees to see company-wide leave dates
-- for calendar display without granting access to the full
-- leave_requests rows.
--
-- Exposed information:
--   - employee id
--   - employee name
--   - start/end date
--   - whether the leave belongs to the current user
--
-- Private request details remain protected by RLS.
-- ============================================================

CREATE OR REPLACE FUNCTION app.company_leave_calendar(
  p_start_date date,
  p_end_date date
)
RETURNS TABLE (
  employee_id uuid,
  employee_name text,
  start_date date,
  end_date date,
  is_my_leave boolean
)
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public, app, pg_temp
AS $$
  SELECT
    lr.employee_id,
    u.name AS employee_name,
    lr.start_date,
    lr.end_date,
    lr.employee_id = app.current_user_id() AS is_my_leave
  FROM public.leave_requests lr
  JOIN public.users u
    ON u.id = lr.employee_id
  WHERE app.is_active_user()
    AND u.active = true

    -- Company calendar only shows actual approved absences.
    AND lr.status = 'approved'

    -- Include requests that overlap the requested calendar range.
    AND daterange(lr.start_date, lr.end_date, '[]')
        && daterange(p_start_date, p_end_date, '[]')

  ORDER BY lr.start_date, u.name;
$$;


REVOKE ALL
ON FUNCTION app.company_leave_calendar(date, date)
FROM PUBLIC;

GRANT EXECUTE
ON FUNCTION app.company_leave_calendar(date, date)
TO isx_app;

COMMIT;