BEGIN;

-- ============================================================
-- 0014_historical_import_cleanup.sql
--
-- Historical import is complete.
-- Restore the normal leave validation/audit triggers and remove
-- the temporary historical-import function introduced in 0013.
-- ============================================================


-- ------------------------------------------------------------
-- 1. Restore normal leave validation trigger
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_leave_requests_validate
ON public.leave_requests;

CREATE TRIGGER trg_leave_requests_validate
BEFORE INSERT OR UPDATE
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION app.validate_leave_request();


-- ------------------------------------------------------------
-- 2. Restore normal leave audit trigger
-- ------------------------------------------------------------

DROP TRIGGER IF EXISTS trg_leave_requests_audit
ON public.leave_requests;

CREATE TRIGGER trg_leave_requests_audit
AFTER INSERT OR UPDATE
ON public.leave_requests
FOR EACH ROW
EXECUTE FUNCTION app.audit_leave_request();


-- ------------------------------------------------------------
-- 3. Remove temporary historical import function
-- ------------------------------------------------------------

REVOKE ALL ON FUNCTION app.import_historical_leave(
  uuid,
  text,
  date,
  date,
  text,
  numeric,
  text,
  text
) FROM PUBLIC;

REVOKE ALL ON FUNCTION app.import_historical_leave(
  uuid,
  text,
  date,
  date,
  text,
  numeric,
  text,
  text
) FROM isx_app;

DROP FUNCTION app.import_historical_leave(
  uuid,
  text,
  date,
  date,
  text,
  numeric,
  text,
  text
);


COMMIT;