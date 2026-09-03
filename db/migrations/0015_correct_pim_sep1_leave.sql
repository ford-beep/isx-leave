BEGIN;

-- ============================================================
-- 0015_correct_pim_sep1_leave.sql
--
-- Data correction:
-- Pim's Annual Leave on 2026-09-01 was imported as a half day
-- (afternoon / 0.50), but the correct historical record is
-- a full day (full_day / 1.00).
--
-- Local/demo databases may not contain Pim, so they safely skip.
-- If Pim exists, the original Production record must match
-- exactly before any correction is allowed.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Verify the original record before touching anything
-- ------------------------------------------------------------

DO $$
DECLARE
  pim_exists boolean;
  matching_rows integer;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(email) = 'pimpon@imagesolutionx.com'
  )
  INTO pim_exists;

  -- Local/demo DB may not contain the real employee.
  IF NOT pim_exists THEN
    RAISE NOTICE 'Pim not present in this database; skipping Production data correction.';
    RETURN;
  END IF;

  SELECT count(*)
  INTO matching_rows
  FROM public.leave_requests lr
  JOIN public.users u
    ON u.id = lr.employee_id
  WHERE lr.id = '9a07b308-23bf-4d28-b2c1-ca60d37679c1'::uuid
    AND lower(u.email) = 'pimpon@imagesolutionx.com'
    AND lr.start_date = DATE '2026-09-01'
    AND lr.end_date = DATE '2026-09-01'
    AND lr.leave_type = 'annual'
    AND lr.leave_session = 'afternoon'::public.leave_session
    AND lr.leave_days = 0.5
    AND lr.status = 'approved';

  IF matching_rows <> 1 THEN
    RAISE EXCEPTION
      'PIM_SEP1_CORRECTION_ABORTED: expected exactly 1 matching original record, found %',
      matching_rows;
  END IF;
END
$$;


-- ------------------------------------------------------------
-- 2. Temporarily bypass only the immutable-details validator
--
-- Normal UPDATE validation intentionally prevents changing
-- leave_days / leave_session after submission.
--
-- This trigger change is transaction-scoped: if anything below
-- fails, PostgreSQL rolls the trigger state back as well.
-- ------------------------------------------------------------

ALTER TABLE public.leave_requests
  DISABLE TRIGGER trg_leave_requests_validate;


-- ------------------------------------------------------------
-- 3. Correct the historical record
-- ------------------------------------------------------------

UPDATE public.leave_requests lr
SET
  leave_session = 'full_day'::public.leave_session,
  leave_days = 1.00,
  calc_breakdown =
    COALESCE(lr.calc_breakdown, '{}'::jsonb)
    || jsonb_build_object(
      'leaveType', 'annual',
      'leaveSession', 'full_day',
      'startDate', '2026-09-01',
      'endDate', '2026-09-01',
      'leaveDays', 1
    )
FROM public.users u
WHERE lr.employee_id = u.id
  AND lr.id = '9a07b308-23bf-4d28-b2c1-ca60d37679c1'::uuid
  AND lower(u.email) = 'pimpon@imagesolutionx.com'
  AND lr.start_date = DATE '2026-09-01'
  AND lr.end_date = DATE '2026-09-01'
  AND lr.leave_type = 'annual'
  AND lr.leave_session = 'afternoon'::public.leave_session
  AND lr.leave_days = 0.5
  AND lr.status = 'approved';


-- Restore normal validation immediately.
ALTER TABLE public.leave_requests
  ENABLE TRIGGER trg_leave_requests_validate;


-- ------------------------------------------------------------
-- 4. Verify final state
-- ------------------------------------------------------------

DO $$
DECLARE
  pim_exists boolean;
  corrected_rows integer;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM public.users
    WHERE lower(email) = 'pimpon@imagesolutionx.com'
  )
  INTO pim_exists;

  IF NOT pim_exists THEN
    RETURN;
  END IF;

  SELECT count(*)
  INTO corrected_rows
  FROM public.leave_requests lr
  JOIN public.users u
    ON u.id = lr.employee_id
  WHERE lr.id = '9a07b308-23bf-4d28-b2c1-ca60d37679c1'::uuid
    AND lower(u.email) = 'pimpon@imagesolutionx.com'
    AND lr.start_date = DATE '2026-09-01'
    AND lr.end_date = DATE '2026-09-01'
    AND lr.leave_type = 'annual'
    AND lr.leave_session = 'full_day'::public.leave_session
    AND lr.leave_days = 1.0
    AND lr.status = 'approved'
    AND lr.calc_breakdown ->> 'leaveSession' = 'full_day'
    AND (lr.calc_breakdown ->> 'leaveDays')::numeric = 1;

  IF corrected_rows <> 1 THEN
    RAISE EXCEPTION
      'PIM_SEP1_CORRECTION_VERIFY_FAILED: expected 1 corrected record, found %',
      corrected_rows;
  END IF;
END
$$;

COMMIT;