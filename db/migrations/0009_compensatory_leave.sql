-- ============================================================================
-- 0009_compensatory_leave.sql
-- Compensatory Leave / Comp Day
--
-- Rules:
-- - Admin grants 1 Comp Day for working on a weekend/company holiday.
-- - Credits belong to the calendar year in which they were earned.
-- - Credits expire at the end of that calendar year.
-- - Comp Day leave is exactly 1 full day.
-- - It may only be used on an effective WFH working day.
-- - It may not be used on an Office day, weekend, or company holiday.
-- - Requests must be submitted at least 7 calendar days in advance.
-- - Pending requests reserve Comp Day balance.
-- - Rejected/cancelled requests do not consume balance.
-- ============================================================================


-- ---------------------------------------------------------------------------
-- Leave type
-- IMPORTANT: deducts_balance = false.
-- Comp Day has its own balance and must never reduce Annual Leave.
-- ---------------------------------------------------------------------------

insert into public.leave_types (
  code,
  label,
  description,
  deducts_balance,
  active,
  sort_order
)
values (
  'comp_day',
  'Compensatory Leave',
  'Compensatory day earned by working on a weekend or company holiday.',
  false,
  true,
  20
)
on conflict (code) do update
set
  label = excluded.label,
  description = excluded.description,
  deducts_balance = false,
  active = true,
  sort_order = excluded.sort_order,
  updated_at = now();


-- ---------------------------------------------------------------------------
-- Comp Day credits
-- One row represents one day earned.
-- ---------------------------------------------------------------------------

create table if not exists public.comp_day_credits (
  id           uuid primary key default gen_random_uuid(),

  employee_id  uuid not null
    references public.users(id)
    on delete cascade,

  earned_date  date not null,

  -- Stored explicitly so yearly balance queries are simple and auditable.
  earned_year  int generated always as (
    extract(year from earned_date)::int
  ) stored,

  note         text
    check (note is null or length(note) <= 1000),

  created_by   uuid not null
    references public.users(id)
    on delete restrict,

  created_at   timestamptz not null default now(),

  -- One employee cannot receive the same Comp Day twice
  -- for the same worked date.
  unique (employee_id, earned_date)
);

create index if not exists comp_day_credits_employee_year_idx
  on public.comp_day_credits (employee_id, earned_year);

create index if not exists comp_day_credits_earned_date_idx
  on public.comp_day_credits (earned_date);


-- ---------------------------------------------------------------------------
-- RLS
-- Employee: read own credits.
-- Admin: read/write all.
-- ---------------------------------------------------------------------------

alter table public.comp_day_credits enable row level security;

drop policy if exists comp_day_credits_select_own_or_admin
  on public.comp_day_credits;

create policy comp_day_credits_select_own_or_admin
  on public.comp_day_credits
  for select
  using (
    employee_id = app.current_user_id()
    or app.is_admin()
  );

drop policy if exists comp_day_credits_insert_admin
  on public.comp_day_credits;

create policy comp_day_credits_insert_admin
  on public.comp_day_credits
  for insert
  with check (
    app.is_admin()
    and created_by = app.current_user_id()
  );

drop policy if exists comp_day_credits_update_admin
  on public.comp_day_credits;

create policy comp_day_credits_update_admin
  on public.comp_day_credits
  for update
  using (app.is_admin())
  with check (app.is_admin());

drop policy if exists comp_day_credits_delete_admin
  on public.comp_day_credits;

create policy comp_day_credits_delete_admin
  on public.comp_day_credits
  for delete
  using (app.is_admin());

  -- ---------------------------------------------------------------------------
-- Effective work mode
--
-- Priority:
--   1. Explicit date override in work_schedule
--   2. Default weekly Office/WFH configuration from office_days
--
-- Note:
-- Weekends / holidays are checked separately when Comp Day is requested.
-- ---------------------------------------------------------------------------

create or replace function app.effective_work_mode(p_date date)
returns work_mode
language sql
stable
security definer
set search_path = public, app, pg_temp
as $$
  select coalesce(
    (
      select ws.mode
      from public.work_schedule ws
      where ws.work_date = p_date
      limit 1
    ),
    case
      when app.is_office_day(p_date) then 'office'::work_mode
      else 'wfh'::work_mode
    end
  );
$$;


-- ---------------------------------------------------------------------------
-- Comp Day balance
--
-- earned:
--   Credits granted for work performed in this calendar year.
--
-- approved:
--   Comp Day leave already approved.
--
-- pending:
--   Pending requests reserve balance.
--
-- remaining:
--   earned - approved
--
-- available:
--   earned - approved - pending
--
-- Credits from another calendar year are never included.
-- ---------------------------------------------------------------------------

create or replace function app.comp_day_balance(
  p_employee uuid,
  p_year int
)
returns table (
  earned     numeric,
  approved   numeric,
  pending    numeric,
  remaining  numeric,
  available  numeric
)
language sql
stable
security invoker
as $$
  with credits as (
    select count(*)::numeric as total
    from public.comp_day_credits c
    where c.employee_id = p_employee
      and c.earned_year = p_year
  ),
  used as (
    select
      coalesce(
        sum(lr.leave_days)
          filter (where lr.status = 'approved'),
        0
      )::numeric as approved,

      coalesce(
        sum(lr.leave_days)
          filter (where lr.status = 'pending'),
        0
      )::numeric as pending

    from public.leave_requests lr
    where lr.employee_id = p_employee
      and lr.leave_year = p_year
      and lr.leave_type = 'comp_day'
  )
  select
    credits.total,
    used.approved,
    used.pending,
    credits.total - used.approved,
    credits.total - used.approved - used.pending
  from credits, used;
$$;


-- ---------------------------------------------------------------------------
-- Validate Comp Day credits
--
-- A Comp Day may only be granted for work performed on:
--   - Saturday
--   - Sunday
--   - an active company/public holiday
--
-- Credit is exactly one day because each row represents one earned day.
-- ---------------------------------------------------------------------------

create or replace function app.validate_comp_day_credit()
returns trigger
language plpgsql
as $$
declare
  is_weekend boolean;
  is_holiday boolean;
begin
  if not app.is_admin() then
    raise exception 'COMP_DAY_ADMIN_ONLY';
  end if;

  if tg_op = 'INSERT' or tg_op = 'UPDATE' then

    is_weekend :=
      extract(dow from new.earned_date)::int in (0, 6);

    select exists (
      select 1
      from public.holidays h
      where h.holiday_date = new.earned_date
        and h.active
    )
    into is_holiday;

    if not is_weekend and not is_holiday then
      raise exception 'COMP_DAY_SOURCE_NOT_WEEKEND_OR_HOLIDAY';
    end if;

    if new.created_by is distinct from app.current_user_id() then
      raise exception 'COMP_DAY_INVALID_CREATED_BY';
    end if;

    return new;
  end if;

  return old;
end;
$$;

drop trigger if exists trg_comp_day_credits_validate
  on public.comp_day_credits;

create trigger trg_comp_day_credits_validate
  before insert or update
  on public.comp_day_credits
  for each row
  execute function app.validate_comp_day_credit();


-- ---------------------------------------------------------------------------
-- Audit Comp Day credit changes
-- ---------------------------------------------------------------------------

create or replace function app.audit_comp_day_credit()
returns trigger
language plpgsql
security definer
set search_path = public, app, pg_temp
as $$
begin

  if tg_op = 'INSERT' then
    perform app.write_audit(
      'comp_day.credit_granted',
      'comp_day_credit',
      new.id,
      jsonb_build_object(
        'employee_id', new.employee_id,
        'earned_date', new.earned_date,
        'earned_year', new.earned_year,
        'note', new.note
      )
    );

    return new;
  end if;


  if tg_op = 'UPDATE' then
    perform app.write_audit(
      'comp_day.credit_updated',
      'comp_day_credit',
      new.id,
      jsonb_build_object(
        'employee_id', new.employee_id,
        'before_earned_date', old.earned_date,
        'after_earned_date', new.earned_date,
        'before_note', old.note,
        'after_note', new.note
      )
    );

    return new;
  end if;


  if tg_op = 'DELETE' then
    perform app.write_audit(
      'comp_day.credit_removed',
      'comp_day_credit',
      old.id,
      jsonb_build_object(
        'employee_id', old.employee_id,
        'earned_date', old.earned_date,
        'earned_year', old.earned_year,
        'note', old.note
      )
    );

    return old;
  end if;


  return null;
end;
$$;

drop trigger if exists trg_comp_day_credits_audit
  on public.comp_day_credits;

create trigger trg_comp_day_credits_audit
  after insert or update or delete
  on public.comp_day_credits
  for each row
  execute function app.audit_comp_day_credit();
-- ---------------------------------------------------------------------------
-- Leave request validation
-- ---------------------------------------------------------------------------

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
begin

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

    earliest_start :=
      (current_timestamp at time zone 'Asia/Bangkok')::date + 7;

-- Employees must request Annual Leave at least 7 days in advance.
-- Comp Day always requires 7 days in advance.
-- Admin may bypass the Annual Leave advance rule for emergency/admin handling.
if new.start_date < earliest_start
   and (
     new.leave_type = 'comp_day'
     or not caller_admin
   ) then
  raise exception 'LEAVE_REQUIRES_7_DAY_ADVANCE:%', earliest_start;
end if;

        if new.leave_type = 'comp_day' then

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

      new.leave_days := 1;

      new.calc_breakdown := jsonb_build_object(
        'leaveType', 'comp_day',
        'startDate', to_char(new.start_date, 'YYYY-MM-DD'),
        'endDate', to_char(new.end_date, 'YYYY-MM-DD'),
        'leaveDays', 1,
        'effectiveWorkMode', effective_mode::text,
        'holiday', false,
        'weekend', false,
        'computedAt', to_char(current_timestamp, 'YYYY-MM-DD"T"HH24:MI:SSOF')
      );

      select count(*)::numeric
      into ent
      from public.comp_day_credits c
      where c.employee_id = new.employee_id
        and c.earned_year = extract(year from new.start_date)::int;

      select coalesce(sum(lr.leave_days), 0)
      into approved_elsewhere
      from public.leave_requests lr
      where lr.employee_id = new.employee_id
        and lr.leave_year = extract(year from new.start_date)::int
        and lr.leave_type = 'comp_day'
        and lr.status in ('approved', 'pending');

      if approved_elsewhere + 1 > ent then
        raise exception 'COMP_DAY_INSUFFICIENT_BALANCE:%:%',
          ent - approved_elsewhere,
          1;
      end if;

      return new;
    end if;
    if new.leave_type = 'annual' then

      calc :=
        app.calc_leave_days(
          new.start_date,
          new.end_date
        );

      new.leave_days :=
        (calc ->> 'leaveDays')::numeric;

      new.calc_breakdown := calc;

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

    raise exception 'LEAVE_TYPE_NOT_SUPPORTED:%', new.leave_type;

  end if;
    -- ========================================================================
  -- UPDATE
  -- ========================================================================

  if tg_op = 'UPDATE' then

    -- Submitted request details are immutable.
    if new.start_date is distinct from old.start_date
       or new.end_date is distinct from old.end_date
       or new.leave_days is distinct from old.leave_days
       or new.employee_id is distinct from old.employee_id
       or new.leave_type is distinct from old.leave_type
       or new.calc_breakdown is distinct from old.calc_breakdown then
      raise exception 'LEAVE_IMMUTABLE_AFTER_SUBMIT';
    end if;


    if new.status is distinct from old.status then

      -- --------------------------------------------------------------------
      -- Allowed status transitions
      -- --------------------------------------------------------------------

      if caller_admin then

        if old.status = 'pending'
           and new.status in ('approved', 'rejected', 'cancelled') then
          null;

        -- Preserve migration 0007:
        -- Admin may cancel previously approved leave.
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
        -- 0006 already prevents non-admin status changes.
        if new.status <> 'cancelled'
           or old.status <> 'pending'
           or old.employee_id is distinct from caller then
          raise exception 'LEAVE_INVALID_TRANSITION';
        end if;

      end if;


      -- ====================================================================
      -- APPROVE
      -- ====================================================================

      if new.status = 'approved' then

        yr := extract(year from new.start_date)::int;


        -- ------------------------------------------------------------------
        -- COMP DAY
        -- ------------------------------------------------------------------

        if new.leave_type = 'comp_day' then

          -- Re-check the date because Admin may have changed
          -- the Work Mode after submission.
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


          -- Total credits earned in this year.
          select count(*)::numeric
          into ent
          from public.comp_day_credits c
          where c.employee_id = new.employee_id
            and c.earned_year = yr;


          -- Count only OTHER approved Comp Day requests.
          -- This request is currently pending and must not be counted twice.
          select coalesce(sum(lr.leave_days), 0)
          into approved_elsewhere
          from public.leave_requests lr
          where lr.employee_id = new.employee_id
            and lr.leave_year = yr
            and lr.leave_type = 'comp_day'
            and lr.status = 'approved'
            and lr.id <> new.id;


          if approved_elsewhere + new.leave_days > ent then
            raise exception 'COMP_DAY_INSUFFICIENT_BALANCE_ON_APPROVE:%:%',
              ent - approved_elsewhere,
              new.leave_days;
          end if;


        -- ------------------------------------------------------------------
        -- ANNUAL LEAVE
        -- ------------------------------------------------------------------

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
            raise exception 'LEAVE_INSUFFICIENT_BALANCE_ON_APPROVE:%:%',
              ent - approved_elsewhere,
              new.leave_days;
          end if;

        else
          raise exception 'LEAVE_TYPE_NOT_SUPPORTED:%', new.leave_type;
        end if;


        new.approved_by :=
          coalesce(new.approved_by, caller);

        new.approved_at :=
          coalesce(new.approved_at, now());


      -- ====================================================================
      -- REJECT
      -- ====================================================================

      elsif new.status = 'rejected' then

        if new.rejection_reason is null
           or length(btrim(new.rejection_reason)) = 0 then
          raise exception 'LEAVE_REJECTION_REASON_REQUIRED';
        end if;

        new.approved_by :=
          coalesce(new.approved_by, caller);

        new.approved_at :=
          coalesce(new.approved_at, now());


      -- ====================================================================
      -- CANCEL
      -- ====================================================================

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


drop trigger if exists trg_leave_requests_validate
  on public.leave_requests;

create trigger trg_leave_requests_validate
  before insert or update
  on public.leave_requests
  for each row
  execute function app.validate_leave_request();