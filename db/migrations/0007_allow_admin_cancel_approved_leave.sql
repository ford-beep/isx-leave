-- ===========================================================================
-- 0007 — Allow admins to cancel approved leave
--
-- Valid status transitions:
--   pending  -> approved
--   pending  -> rejected
--   pending  -> cancelled
--   approved -> cancelled
--
-- Rejected and cancelled requests remain final.
-- Employee status changes are still blocked by migration 0006.
-- ===========================================================================

create or replace function app.validate_leave_request() returns trigger
language plpgsql as $$
declare
  calc      jsonb;
  bal       record;
  caller_admin boolean := app.is_admin();
  caller    uuid := app.current_user_id();
  approved_elsewhere numeric;
  ent numeric;
  yr  int;
begin
  if tg_op = 'INSERT' then
    -- An employee may only file for themselves; admins may file on behalf.
    if not caller_admin and new.employee_id is distinct from caller then
      raise exception 'FORBIDDEN_EMPLOYEE_MISMATCH';
    end if;

    if new.status <> 'pending' then
      raise exception 'LEAVE_MUST_START_PENDING';
    end if;

    if new.end_date < new.start_date then
      raise exception 'LEAVE_END_BEFORE_START';
    end if;

    -- V1 simplification: a request lives inside one leave year so the yearly
    -- entitlement arithmetic stays unambiguous.
    if extract(year from new.start_date) <> extract(year from new.end_date) then
      raise exception 'LEAVE_SPANS_TWO_YEARS';
    end if;

    -- Authoritative recalculation — the client's number is never trusted.
    calc := app.calc_leave_days(new.start_date, new.end_date);
    new.leave_days     := (calc ->> 'leaveDays')::numeric;
    new.calc_breakdown := calc;

    if new.leave_days <= 0 then
      raise exception 'LEAVE_NO_WORKING_DAYS';
    end if;

    -- Balance guard: approved + pending may not exceed the entitlement.
    select *
      into bal
      from app.leave_balance(
        new.employee_id,
        extract(year from new.start_date)::int
      );

    if (
      select deducts_balance
      from public.leave_types
      where code = new.leave_type
    )
    and new.leave_days > bal.available then
      raise exception 'LEAVE_INSUFFICIENT_BALANCE:%:%',
        bal.available,
        new.leave_days;
    end if;

    return new;
  end if;

  -- ---------------- UPDATE ----------------
  if tg_op = 'UPDATE' then
    -- Historical integrity: submitted leave details remain immutable.
    if new.start_date is distinct from old.start_date
       or new.end_date is distinct from old.end_date
       or new.leave_days is distinct from old.leave_days
       or new.employee_id is distinct from old.employee_id
       or new.leave_type is distinct from old.leave_type
       or new.calc_breakdown is distinct from old.calc_breakdown then
      raise exception 'LEAVE_IMMUTABLE_AFTER_SUBMIT';
    end if;

    if new.status is distinct from old.status then

      if caller_admin then
        -- Admins may make the original decision on a pending request,
        -- or cancel leave that was previously approved.
        if old.status = 'pending'
           and new.status in ('approved', 'rejected', 'cancelled') then
          null;

        elsif old.status = 'approved'
              and new.status = 'cancelled' then
          null;

        elsif old.status in ('rejected', 'cancelled') then
          raise exception 'LEAVE_ALREADY_DECIDED';

        else
          raise exception 'LEAVE_INVALID_TRANSITION';
        end if;

      else
        -- Kept for defence in depth.
        -- Migration 0006 blocks all non-admin status changes before they
        -- can be accepted by the database.
        if new.status <> 'cancelled'
           or old.status <> 'pending'
           or old.employee_id is distinct from caller then
          raise exception 'LEAVE_INVALID_TRANSITION';
        end if;
      end if;

      if new.status = 'approved' then
        -- Re-check balance at approval time because several pending requests
        -- may each have been affordable independently.
        yr := extract(year from new.start_date)::int;

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
          from app.leave_balance(new.employee_id, yr) b;

        if (
          select deducts_balance
          from public.leave_types
          where code = new.leave_type
        )
        and approved_elsewhere + new.leave_days > ent then
          raise exception 'LEAVE_INSUFFICIENT_BALANCE_ON_APPROVE:%:%',
            ent - approved_elsewhere,
            new.leave_days;
        end if;

        new.approved_by := coalesce(new.approved_by, caller);
        new.approved_at := coalesce(new.approved_at, now());

      elsif new.status = 'rejected' then
        if new.rejection_reason is null
           or length(btrim(new.rejection_reason)) = 0 then
          raise exception 'LEAVE_REJECTION_REASON_REQUIRED';
        end if;

        new.approved_by := coalesce(new.approved_by, caller);
        new.approved_at := coalesce(new.approved_at, now());

      elsif new.status = 'cancelled' then
        new.cancelled_at := coalesce(new.cancelled_at, now());
      end if;
    end if;

    return new;
  end if;

  return new;
end $$;