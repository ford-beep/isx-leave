BEGIN;

-- ============================================================================
-- COMP DAY FIFO USAGE MAPPING
-- ============================================================================

CREATE TABLE public.comp_day_usages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  request_id uuid NOT NULL
    REFERENCES public.leave_requests(id)
    ON DELETE CASCADE,

  credit_id uuid NOT NULL
    REFERENCES public.comp_day_credits(id)
    ON DELETE RESTRICT,

  amount numeric(5,2) NOT NULL
    CHECK (
      amount > 0
      AND amount <= 1
    ),

  created_at timestamptz NOT NULL DEFAULT now(),

  allocation_source text NOT NULL DEFAULT 'live_fifo'
    CHECK (
      allocation_source IN (
        'live_fifo',
        'legacy_backfill'
      )
    ),

  UNIQUE (request_id, credit_id)
);


CREATE INDEX comp_day_usages_request_idx
  ON public.comp_day_usages(request_id);


CREATE INDEX comp_day_usages_credit_idx
  ON public.comp_day_usages(credit_id);


-- ============================================================================
-- RLS
-- ============================================================================

ALTER TABLE public.comp_day_usages
  ENABLE ROW LEVEL SECURITY;


CREATE POLICY comp_day_usages_select_own_or_admin
ON public.comp_day_usages
FOR SELECT
USING (
  EXISTS (
    SELECT 1
    FROM public.leave_requests lr
    WHERE lr.id = comp_day_usages.request_id
      AND (
        lr.employee_id = app.current_user_id()
        OR app.is_admin()
      )
  )
);


-- ============================================================================
-- INTERNAL HELPER
--
-- Active usage means:
--   pending  = reserved
--   approved = consumed
--
-- rejected / cancelled usage rows remain for audit, but no longer consume
-- available balance.
-- ============================================================================

CREATE OR REPLACE FUNCTION app.comp_day_credit_used_amount(
  p_credit_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'app'
AS $function$
  SELECT
    COALESCE(
      SUM(u.amount),
      0
    )::numeric

  FROM public.comp_day_usages u

  JOIN public.leave_requests lr
    ON lr.id = u.request_id

  WHERE u.credit_id = p_credit_id
    AND lr.status IN (
      'pending',
      'approved'
    );
$function$;


-- ============================================================================
-- LEGACY BACKFILL
--
-- Existing Comp Day requests were created before per-credit FIFO tracking
-- existed.
--
-- Legacy behavior was year-balance based, therefore this reconstruction does
-- NOT require earned_date <= leave start date. Requiring that would make some
-- valid historical requests impossible to migrate.
--
-- Only active requests are allocated:
--   pending
--   approved
--
-- rejected / cancelled historical requests do not consume credits.
--
-- Allocation order:
--   oldest active request first
--   oldest credit first
--
-- IMPORTANT:
-- This is reconstructed historical allocation. It establishes a consistent
-- FIFO ledger from the data available at migration time; it does not claim
-- that these exact credit/request pairings were recorded historically.
-- ============================================================================

DO $backfill$
DECLARE
  group_row record;
  req record;
  credit record;

  required_total numeric;
  available_credit_count numeric;

  remaining_needed numeric;
  credit_used numeric;
  credit_available numeric;
  allocate_amount numeric;

  mapped_total numeric;
BEGIN

  -- --------------------------------------------------------------------------
  -- Preflight
  --
  -- Fail before backfilling if an employee/year has more active Comp Day leave
  -- than existing earned credits can support.
  -- --------------------------------------------------------------------------

  FOR group_row IN
    SELECT DISTINCT
      lr.employee_id,
      lr.leave_year

    FROM public.leave_requests lr

    WHERE lr.leave_type = 'comp_day'
      AND lr.status IN (
        'pending',
        'approved'
      )

    ORDER BY
      lr.employee_id,
      lr.leave_year
  LOOP

    SELECT
      COALESCE(
        SUM(lr.leave_days),
        0
      )::numeric

    INTO required_total

    FROM public.leave_requests lr

    WHERE lr.employee_id = group_row.employee_id
      AND lr.leave_year = group_row.leave_year
      AND lr.leave_type = 'comp_day'
      AND lr.status IN (
        'pending',
        'approved'
      );


    SELECT
      COUNT(*)::numeric

    INTO available_credit_count

    FROM public.comp_day_credits c

    WHERE c.employee_id = group_row.employee_id
      AND c.earned_year = group_row.leave_year;


    IF required_total > available_credit_count THEN
      RAISE EXCEPTION
        'COMP_DAY_FIFO_BACKFILL_INSUFFICIENT_CREDITS:%:%:%:%',
        group_row.employee_id,
        group_row.leave_year,
        required_total,
        available_credit_count;
    END IF;

  END LOOP;


  -- --------------------------------------------------------------------------
  -- Reconstruct historical FIFO.
  -- --------------------------------------------------------------------------

  FOR req IN
    SELECT
      lr.id,
      lr.employee_id,
      lr.leave_year,
      lr.leave_days,
      lr.created_at

    FROM public.leave_requests lr

    WHERE lr.leave_type = 'comp_day'
      AND lr.status IN (
        'pending',
        'approved'
      )

    ORDER BY
      lr.created_at ASC,
      lr.id ASC

    FOR UPDATE
  LOOP

    remaining_needed := req.leave_days;


    IF remaining_needed IS NULL
       OR remaining_needed <= 0 THEN

      RAISE EXCEPTION
        'COMP_DAY_FIFO_BACKFILL_INVALID_REQUEST_AMOUNT:%:%',
        req.id,
        remaining_needed;

    END IF;


    FOR credit IN
      SELECT
        c.id,
        c.earned_date,
        c.created_at

      FROM public.comp_day_credits c

      WHERE c.employee_id = req.employee_id
        AND c.earned_year = req.leave_year

      ORDER BY
        c.earned_date ASC,
        c.created_at ASC,
        c.id ASC

      FOR UPDATE
    LOOP

      SELECT
        COALESCE(
          SUM(u.amount),
          0
        )::numeric

      INTO credit_used

      FROM public.comp_day_usages u

      JOIN public.leave_requests lr
        ON lr.id = u.request_id

      WHERE u.credit_id = credit.id
        AND lr.status IN (
          'pending',
          'approved'
        );


      credit_available :=
        1 - credit_used;


      IF credit_available <= 0 THEN
        CONTINUE;
      END IF;


      allocate_amount :=
        LEAST(
          credit_available,
          remaining_needed
        );


      INSERT INTO public.comp_day_usages (
        request_id,
        credit_id,
        amount,
        allocation_source
      )
      VALUES (
        req.id,
        credit.id,
        allocate_amount,
        'legacy_backfill'
      );


      remaining_needed :=
        remaining_needed - allocate_amount;


      EXIT WHEN remaining_needed <= 0;

    END LOOP;


    IF remaining_needed > 0 THEN
      RAISE EXCEPTION
        'COMP_DAY_FIFO_BACKFILL_ALLOCATION_FAILED:%:%',
        req.id,
        remaining_needed;
    END IF;

  END LOOP;


  -- --------------------------------------------------------------------------
  -- Final integrity validation.
  --
  -- For every employee/year, active mapped amount must exactly equal active
  -- Comp Day leave_days.
  -- --------------------------------------------------------------------------

  FOR group_row IN
    SELECT DISTINCT
      lr.employee_id,
      lr.leave_year

    FROM public.leave_requests lr

    WHERE lr.leave_type = 'comp_day'
      AND lr.status IN (
        'pending',
        'approved'
      )

    ORDER BY
      lr.employee_id,
      lr.leave_year
  LOOP

    SELECT
      COALESCE(
        SUM(lr.leave_days),
        0
      )::numeric

    INTO required_total

    FROM public.leave_requests lr

    WHERE lr.employee_id = group_row.employee_id
      AND lr.leave_year = group_row.leave_year
      AND lr.leave_type = 'comp_day'
      AND lr.status IN (
        'pending',
        'approved'
      );


    SELECT
      COALESCE(
        SUM(u.amount),
        0
      )::numeric

    INTO mapped_total

    FROM public.comp_day_usages u

    JOIN public.leave_requests lr
      ON lr.id = u.request_id

    WHERE lr.employee_id = group_row.employee_id
      AND lr.leave_year = group_row.leave_year
      AND lr.leave_type = 'comp_day'
      AND lr.status IN (
        'pending',
        'approved'
      );


    IF mapped_total <> required_total THEN
      RAISE EXCEPTION
        'COMP_DAY_FIFO_BACKFILL_VALIDATION_FAILED:%:%:%:%',
        group_row.employee_id,
        group_row.leave_year,
        required_total,
        mapped_total;
    END IF;

  END LOOP;

END;
$backfill$;


-- ============================================================================
-- FIFO ALLOCATION FOR NEW REQUESTS
-- ============================================================================

CREATE OR REPLACE FUNCTION app.allocate_comp_day_fifo(
  p_request_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app'
AS $function$
DECLARE
  req record;
  credit record;

  caller uuid;

  required_amount numeric;
  remaining_needed numeric;

  credit_used numeric;
  credit_available numeric;
  allocate_amount numeric;
BEGIN

  caller := app.current_user_id();


  SELECT
    lr.id,
    lr.employee_id,
    lr.leave_type,
    lr.start_date,
    lr.leave_year,
    lr.leave_days,
    lr.status

  INTO req

  FROM public.leave_requests lr

  WHERE lr.id = p_request_id

  FOR UPDATE;


  IF NOT FOUND THEN
    RAISE EXCEPTION 'COMP_DAY_REQUEST_NOT_FOUND';
  END IF;


  IF caller IS NULL THEN
    RAISE EXCEPTION 'COMP_DAY_ALLOCATION_UNAUTHENTICATED';
  END IF;


  IF req.employee_id <> caller
     AND NOT app.is_admin() THEN

    RAISE EXCEPTION 'COMP_DAY_ALLOCATION_FORBIDDEN';

  END IF;


  IF req.leave_type <> 'comp_day' THEN
    RAISE EXCEPTION 'COMP_DAY_ALLOCATION_WRONG_LEAVE_TYPE';
  END IF;


  IF req.status NOT IN (
    'pending',
    'approved'
  ) THEN

    RAISE EXCEPTION 'COMP_DAY_ALLOCATION_INVALID_STATUS';

  END IF;


  required_amount := req.leave_days;


  IF required_amount IS NULL
     OR required_amount <= 0 THEN

    RAISE EXCEPTION 'COMP_DAY_ALLOCATION_INVALID_AMOUNT';

  END IF;


  IF EXISTS (
    SELECT 1
    FROM public.comp_day_usages u
    WHERE u.request_id = p_request_id
  ) THEN

    RAISE EXCEPTION 'COMP_DAY_REQUEST_ALREADY_ALLOCATED';

  END IF;


  remaining_needed := required_amount;


  -- --------------------------------------------------------------------------
  -- Strict FIFO for new requests.
  --
  -- Unlike legacy backfill, a new request may not use a credit that has not
  -- yet been earned as of the request start date.
  -- --------------------------------------------------------------------------

  FOR credit IN
    SELECT
      c.id,
      c.earned_date,
      c.created_at

    FROM public.comp_day_credits c

    WHERE c.employee_id = req.employee_id
      AND c.earned_year = req.leave_year
      AND c.earned_date <= req.start_date

    ORDER BY
      c.earned_date ASC,
      c.created_at ASC,
      c.id ASC

    FOR UPDATE
  LOOP

    SELECT
      COALESCE(
        SUM(u.amount),
        0
      )::numeric

    INTO credit_used

    FROM public.comp_day_usages u

    JOIN public.leave_requests lr
      ON lr.id = u.request_id

    WHERE u.credit_id = credit.id
      AND lr.status IN (
        'pending',
        'approved'
      );


    credit_available :=
      1 - credit_used;


    IF credit_available <= 0 THEN
      CONTINUE;
    END IF;


    allocate_amount :=
      LEAST(
        credit_available,
        remaining_needed
      );


    INSERT INTO public.comp_day_usages (
      request_id,
      credit_id,
      amount
    )
    VALUES (
      p_request_id,
      credit.id,
      allocate_amount
    );


    remaining_needed :=
      remaining_needed - allocate_amount;


    EXIT WHEN remaining_needed <= 0;

  END LOOP;


  IF remaining_needed > 0 THEN

    RAISE EXCEPTION
      'COMP_DAY_FIFO_INSUFFICIENT_EARNED_BALANCE:%:%',
      required_amount,
      required_amount - remaining_needed;

  END IF;

END;
$function$;


-- ============================================================================
-- REQUEST ALLOCATION DETAILS
--
-- SECURITY DEFINER is retained, but authorization is explicit:
--   employee may read own request
--   admin may read any request
-- ============================================================================

CREATE OR REPLACE FUNCTION app.comp_day_usage_details(
  p_request_id uuid
)
RETURNS TABLE(
  credit_id uuid,
  earned_date date,
  credit_note text,
  amount numeric,
  request_status public.leave_status
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'app'
AS $function$
DECLARE
  caller uuid;
  request_employee_id uuid;
BEGIN

  caller := app.current_user_id();


  IF caller IS NULL THEN
    RAISE EXCEPTION 'COMP_DAY_USAGE_UNAUTHENTICATED';
  END IF;


  SELECT lr.employee_id
  INTO request_employee_id
  FROM public.leave_requests lr
  WHERE lr.id = p_request_id;


  IF NOT FOUND THEN
    RETURN;
  END IF;


  IF request_employee_id <> caller
     AND NOT app.is_admin() THEN

    RAISE EXCEPTION 'COMP_DAY_USAGE_FORBIDDEN';

  END IF;


  RETURN QUERY

  SELECT
    c.id,
    c.earned_date,
    c.note,
    u.amount,
    lr.status

  FROM public.comp_day_usages u

  JOIN public.comp_day_credits c
    ON c.id = u.credit_id

  JOIN public.leave_requests lr
    ON lr.id = u.request_id

  WHERE u.request_id = p_request_id

  ORDER BY
    c.earned_date ASC,
    c.created_at ASC,
    c.id ASC;

END;
$function$;


-- ============================================================================
-- EMPLOYEE COMP DAY LEDGER
--
-- SECURITY DEFINER is retained, but authorization is explicit:
--   employee may read own ledger
--   admin may read any employee ledger
-- ============================================================================

CREATE OR REPLACE FUNCTION app.comp_day_credit_ledger(
  p_employee_id uuid,
  p_year integer
)
RETURNS TABLE(
  credit_id uuid,
  earned_date date,
  credit_note text,
  created_by uuid,
  created_at timestamptz,
  reserved_amount numeric,
  used_amount numeric,
  available_amount numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'app'
AS $function$
DECLARE
  caller uuid;
BEGIN

  caller := app.current_user_id();


  IF caller IS NULL THEN
    RAISE EXCEPTION 'COMP_DAY_LEDGER_UNAUTHENTICATED';
  END IF;


  IF p_employee_id <> caller
     AND NOT app.is_admin() THEN

    RAISE EXCEPTION 'COMP_DAY_LEDGER_FORBIDDEN';

  END IF;


  RETURN QUERY

  SELECT
    c.id,
    c.earned_date,
    c.note,
    c.created_by,
    c.created_at,

    COALESCE(
      SUM(u.amount) FILTER (
        WHERE lr.status = 'pending'
      ),
      0
    )::numeric
      AS reserved_amount,

    COALESCE(
      SUM(u.amount) FILTER (
        WHERE lr.status = 'approved'
      ),
      0
    )::numeric
      AS used_amount,

    (
      1 -
      COALESCE(
        SUM(u.amount) FILTER (
          WHERE lr.status IN (
            'pending',
            'approved'
          )
        ),
        0
      )
    )::numeric
      AS available_amount

  FROM public.comp_day_credits c

  LEFT JOIN public.comp_day_usages u
    ON u.credit_id = c.id

  LEFT JOIN public.leave_requests lr
    ON lr.id = u.request_id

  WHERE c.employee_id = p_employee_id
    AND c.earned_year = p_year

  GROUP BY
    c.id,
    c.earned_date,
    c.note,
    c.created_by,
    c.created_at

  ORDER BY
    c.earned_date DESC,
    c.created_at DESC,
    c.id DESC;

END;
$function$;


-- ============================================================================
-- FUNCTION PERMISSIONS
-- ============================================================================

REVOKE ALL
  ON FUNCTION app.allocate_comp_day_fifo(uuid)
  FROM PUBLIC;

REVOKE ALL
  ON FUNCTION app.comp_day_credit_used_amount(uuid)
  FROM PUBLIC;

REVOKE ALL
  ON FUNCTION app.comp_day_usage_details(uuid)
  FROM PUBLIC;

REVOKE ALL
  ON FUNCTION app.comp_day_credit_ledger(uuid, integer)
  FROM PUBLIC;


GRANT EXECUTE
  ON FUNCTION app.allocate_comp_day_fifo(uuid)
  TO isx_app;

GRANT EXECUTE
  ON FUNCTION app.comp_day_usage_details(uuid)
  TO isx_app;

GRANT EXECUTE
  ON FUNCTION app.comp_day_credit_ledger(uuid, integer)
  TO isx_app;


-- The app directly reads this table for FIFO UI/email traceability.
-- Inserts are performed by SECURITY DEFINER FIFO functions instead.
GRANT SELECT
  ON TABLE public.comp_day_usages
  TO isx_app;


COMMIT;