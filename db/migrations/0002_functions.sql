-- ===========================================================================
-- ISX Leave Management Dashboard — 0002 business logic & security functions
-- ---------------------------------------------------------------------------
-- Everything security-relevant lives here so that both RLS policies and
-- triggers share ONE definition of "who am I" and "what may I do".
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- Identity
-- ---------------------------------------------------------------------------
-- Resolution order:
--   1. `request.jwt.claims` -> sub      (Supabase / PostgREST convention)
--   2. `app.current_user_id`            (local mode: set per-transaction by the
--                                        Next.js data layer with SET LOCAL)
-- Keeping both means the SAME policies run unchanged on Supabase.
create or replace function app.current_user_id() returns uuid
language plpgsql stable as $$
declare raw text;
begin
  begin
    raw := nullif(current_setting('request.jwt.claims', true), '')::json ->> 'sub';
  exception when others then
    raw := null;
  end;

  if raw is null or raw = '' then
    raw := nullif(current_setting('app.current_user_id', true), '');
  end if;

  if raw is null or raw = '' then
    return null;
  end if;

  begin
    return raw::uuid;
  exception when others then
    return null;
  end;
end $$;

-- SECURITY DEFINER: policies on public.users must not recurse into themselves
-- while answering "is the caller an admin?".
create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from public.users u
    where u.id = app.current_user_id()
      and u.role = 'admin'
      and u.active
  );
$$;

create or replace function app.is_active_user() returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select exists (
    select 1 from public.users u
    where u.id = app.current_user_id() and u.active
  );
$$;

revoke all on function app.is_admin() from public;
revoke all on function app.is_active_user() from public;

-- ---------------------------------------------------------------------------
-- Working calendar primitives
-- ---------------------------------------------------------------------------
-- An "office day" is a weekday the company expects attendance on, resolved
-- against the office_days generation in force ON THAT DATE.
-- SECURITY DEFINER: the working calendar is non-personal company data and the
-- day maths must be deterministic no matter who is asking (an inactive or
-- unauthenticated caller must not silently get "zero office days").
create or replace function app.is_office_day(d date) returns boolean
language sql stable security definer set search_path = public, app, pg_temp as $$
  select coalesce((
    select od.is_office_day
    from public.office_days od
    where od.weekday = extract(dow from d)::int
      and od.effective_from <= d
      and (od.effective_to is null or od.effective_to >= d)
    order by od.effective_from desc
    limit 1
  ), false);
$$;

create or replace function app.holiday_on(d date)
returns table (name text, type holiday_type, source text)
language sql stable security definer set search_path = public, app, pg_temp as $$
  select h.name, h.type, h.source
  from public.holidays h
  where h.holiday_date = d and h.active
  order by h.type
  limit 1;
$$;

-- ---------------------------------------------------------------------------
-- calculateLeaveDays() — the ONE authoritative implementation (§22).
-- The TypeScript version in src/lib/leave/calc.ts is a preview mirror of this
-- and is covered by a parity test; the database value always wins.
--
-- Rule: a date is deducted when it IS a configured office day AND is NOT an
-- active holiday. Non-office days (incl. weekends) and holidays are free.
-- ---------------------------------------------------------------------------
create or replace function app.calc_leave_days(p_start date, p_end date)
returns jsonb
language plpgsql stable as $$
declare
  d date;
  total_calendar int := 0;
  office_cnt     int := 0;
  non_office_cnt int := 0;
  holiday_cnt    int := 0;
  deducted       int := 0;
  hol            record;
  day_rows  jsonb := '[]'::jsonb;
  hol_rows  jsonb := '[]'::jsonb;
  is_off boolean;
begin
  if p_start is null or p_end is null then
    raise exception 'LEAVE_DATES_REQUIRED';
  end if;
  if p_end < p_start then
    raise exception 'LEAVE_END_BEFORE_START';
  end if;
  if p_end - p_start > 366 then
    raise exception 'LEAVE_RANGE_TOO_LONG';
  end if;

  d := p_start;
  while d <= p_end loop
    total_calendar := total_calendar + 1;
    is_off := app.is_office_day(d);
    select * into hol from app.holiday_on(d);

    if not is_off then
      non_office_cnt := non_office_cnt + 1;
    else
      office_cnt := office_cnt + 1;
      if hol.name is not null then
        holiday_cnt := holiday_cnt + 1;
      else
        deducted := deducted + 1;
      end if;
    end if;

    if hol.name is not null then
      hol_rows := hol_rows || jsonb_build_object(
        'date', to_char(d, 'YYYY-MM-DD'),
        'name', hol.name,
        'type', hol.type,
        'source', hol.source,
        'wouldHaveBeenOfficeDay', is_off
      );
    end if;

    day_rows := day_rows || jsonb_build_object(
      'date', to_char(d, 'YYYY-MM-DD'),
      'officeDay', is_off,
      'holiday', hol.name,
      'deducted', (is_off and hol.name is null)
    );

    d := d + 1;
  end loop;

  return jsonb_build_object(
    'startDate',              to_char(p_start, 'YYYY-MM-DD'),
    'endDate',                to_char(p_end, 'YYYY-MM-DD'),
    'totalCalendarDays',      total_calendar,
    'officeDaysInRange',      office_cnt,
    'excludedNonOfficeDays',  non_office_cnt,
    'excludedHolidays',       holiday_cnt,
    'leaveDays',              deducted,
    'holidays',               hol_rows,
    'days',                   day_rows,
    'computedAt',             to_char(now(), 'YYYY-MM-DD"T"HH24:MI:SSOF')
  );
end $$;

-- ---------------------------------------------------------------------------
-- Balance (§10, §11). SECURITY INVOKER on purpose: RLS filters the underlying
-- rows, so an employee asking about someone else simply gets zeroes.
--
--   remaining = entitlement − approved                (the official balance)
--   available = entitlement − approved − pending      (what may still be booked)
--
-- Pending never permanently reduces the balance, but it IS reserved so an
-- employee cannot queue up more leave than they own.
-- ---------------------------------------------------------------------------
create or replace function app.leave_balance(p_employee uuid, p_year int)
returns table (
  entitlement numeric,
  approved    numeric,
  pending     numeric,
  remaining   numeric,
  available   numeric
)
language sql stable as $$
  with ent as (
    select coalesce((
      select le.total_days from public.leave_entitlements le
      where le.employee_id = p_employee and le.year = p_year
    ), coalesce((select (value #>> '{}')::numeric from public.app_settings
                 where key = 'default_annual_entitlement'), 15)) as total
  ),
  used as (
    select
      coalesce(sum(lr.leave_days) filter (where lr.status = 'approved'), 0) as approved,
      coalesce(sum(lr.leave_days) filter (where lr.status = 'pending'),  0) as pending
    from public.leave_requests lr
    join public.leave_types lt on lt.code = lr.leave_type
    where lr.employee_id = p_employee
      and lr.leave_year  = p_year
      and lt.deducts_balance
  )
  select ent.total,
         used.approved,
         used.pending,
         ent.total - used.approved,
         ent.total - used.approved - used.pending
  from ent, used;
$$;

-- ---------------------------------------------------------------------------
-- Audit + notification helpers (SECURITY DEFINER: append-only side effects
-- must succeed even though nobody holds a direct INSERT policy).
-- ---------------------------------------------------------------------------
create or replace function app.write_audit(
  p_action text, p_entity_type text, p_entity_id uuid, p_metadata jsonb default '{}'::jsonb
) returns void
language sql security definer set search_path = public, app, pg_temp as $$
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, metadata)
  values (app.current_user_id(), p_action, p_entity_type, p_entity_id, coalesce(p_metadata, '{}'::jsonb));
$$;

create or replace function app.notify(
  p_user uuid, p_title text, p_body text default null, p_link text default null
) returns void
language sql security definer set search_path = public, app, pg_temp as $$
  insert into public.notifications (user_id, title, body, link)
  values (p_user, p_title, p_body, p_link);
$$;

-- ---------------------------------------------------------------------------
-- Leave request validation trigger (§21) — the real gatekeeper.
-- Runs regardless of which client issued the statement, so a hand-crafted API
-- call or raw SQL is subject to exactly the same rules as the UI.
-- ---------------------------------------------------------------------------
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
    select * into bal from app.leave_balance(new.employee_id, extract(year from new.start_date)::int);
    if (select deducts_balance from public.leave_types where code = new.leave_type)
       and new.leave_days > bal.available then
      raise exception 'LEAVE_INSUFFICIENT_BALANCE:%:%', bal.available, new.leave_days;
    end if;

    return new;
  end if;

  -- ---------------- UPDATE ----------------
  if tg_op = 'UPDATE' then
    -- Historical integrity: the day maths captured at submission is immutable
    -- (§14 — changing office days must not rewrite approved history).
    if new.start_date is distinct from old.start_date
       or new.end_date is distinct from old.end_date
       or new.leave_days is distinct from old.leave_days
       or new.employee_id is distinct from old.employee_id
       or new.leave_type is distinct from old.leave_type
       or new.calc_breakdown is distinct from old.calc_breakdown then
      raise exception 'LEAVE_IMMUTABLE_AFTER_SUBMIT';
    end if;

    if new.status is distinct from old.status then
      if old.status <> 'pending' then
        raise exception 'LEAVE_ALREADY_DECIDED';
      end if;

      if caller_admin then
        if new.status not in ('approved', 'rejected', 'cancelled') then
          raise exception 'LEAVE_INVALID_TRANSITION';
        end if;
      else
        -- Employees may only withdraw their own still-pending request.
        if new.status <> 'cancelled' or old.employee_id is distinct from caller then
          raise exception 'LEAVE_INVALID_TRANSITION';
        end if;
      end if;

      if new.status = 'approved' then
        -- Re-check the balance at decision time: several pending requests may
        -- each have been affordable on their own but not together.
        -- NOTE: new.leave_year is a STORED GENERATED column and is therefore
        -- still null inside a BEFORE trigger — derive the year from start_date.
        yr := extract(year from new.start_date)::int;

        select coalesce(sum(lr.leave_days), 0) into approved_elsewhere
        from public.leave_requests lr
        join public.leave_types lt on lt.code = lr.leave_type
        where lr.employee_id = new.employee_id
          and lr.leave_year = yr
          and lr.status = 'approved'
          and lr.id <> new.id
          and lt.deducts_balance;

        select b.entitlement into ent
        from app.leave_balance(new.employee_id, yr) b;

        if (select deducts_balance from public.leave_types where code = new.leave_type)
           and approved_elsewhere + new.leave_days > ent then
          raise exception 'LEAVE_INSUFFICIENT_BALANCE_ON_APPROVE:%:%',
            ent - approved_elsewhere, new.leave_days;
        end if;

        new.approved_by := coalesce(new.approved_by, caller);
        new.approved_at := coalesce(new.approved_at, now());
      elsif new.status = 'rejected' then
        if new.rejection_reason is null or length(btrim(new.rejection_reason)) = 0 then
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

drop trigger if exists trg_leave_requests_validate on public.leave_requests;
create trigger trg_leave_requests_validate
  before insert or update on public.leave_requests
  for each row execute function app.validate_leave_request();

-- ---------------------------------------------------------------------------
-- Audit + notification trigger for leave requests (§17, §30)
-- ---------------------------------------------------------------------------
create or replace function app.audit_leave_request() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  emp_name text;
  admin_row record;
  type_label text;
begin
  select name into emp_name from public.users where id = coalesce(new.employee_id, old.employee_id);
  select label into type_label from public.leave_types where code = coalesce(new.leave_type, old.leave_type);

  if tg_op = 'INSERT' then
    perform app.write_audit('leave.submitted', 'leave_request', new.id, jsonb_build_object(
      'employee_id', new.employee_id, 'employee_name', emp_name,
      'leave_type', new.leave_type, 'start_date', new.start_date,
      'end_date', new.end_date, 'leave_days', new.leave_days));

    for admin_row in select id from public.users where role = 'admin' and active loop
      perform app.notify(admin_row.id,
        format('New leave request from %s', emp_name),
        format('%s · %s to %s · %s day(s)', type_label, new.start_date, new.end_date, new.leave_days),
        '/admin/requests');
    end loop;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    perform app.write_audit('leave.' || new.status::text, 'leave_request', new.id, jsonb_build_object(
      'employee_id', new.employee_id, 'employee_name', emp_name,
      'from_status', old.status, 'to_status', new.status,
      'leave_days', new.leave_days, 'rejection_reason', new.rejection_reason));

    if new.status in ('approved', 'rejected') then
      perform app.notify(new.employee_id,
        format('Your leave request was %s', new.status),
        format('%s · %s to %s · %s day(s)%s', type_label, new.start_date, new.end_date, new.leave_days,
               case when new.status = 'rejected'
                    then E'\nReason: ' || coalesce(new.rejection_reason, '—') else '' end),
        '/my-leave');
    end if;
  end if;

  return new;
end $$;

drop trigger if exists trg_leave_requests_audit on public.leave_requests;
create trigger trg_leave_requests_audit
  after insert or update on public.leave_requests
  for each row execute function app.audit_leave_request();

-- ---------------------------------------------------------------------------
-- Generic audit for admin-managed configuration tables
-- ---------------------------------------------------------------------------
create or replace function app.audit_generic() returns trigger
language plpgsql security definer set search_path = public, app, pg_temp as $$
declare
  act  text;
  ent  uuid;
  meta jsonb;
  row_json jsonb;
begin
  act := tg_argv[0] || '.' || lower(tg_op);
  if tg_op = 'DELETE' then
    row_json := to_jsonb(old);
    meta := jsonb_build_object('before', row_json);
  elsif tg_op = 'UPDATE' then
    row_json := to_jsonb(new);
    meta := jsonb_build_object('before', to_jsonb(old), 'after', row_json);
  else
    row_json := to_jsonb(new);
    meta := jsonb_build_object('after', row_json);
  end if;

  -- Not every audited table is keyed by a uuid `id` (leave_types is keyed by
  -- `code`), so fall back to recording the natural key in the metadata.
  if row_json ? 'id' then
    ent := (row_json ->> 'id')::uuid;
  else
    ent := null;
    meta := meta || jsonb_build_object('entity_ref', coalesce(row_json ->> 'code', row_json ->> 'key'));
  end if;

  -- never let a password hash reach the audit trail
  meta := meta #- '{before,password_hash}' #- '{after,password_hash}';

  perform app.write_audit(act, tg_argv[0], ent, meta);
  return coalesce(new, old);
end $$;

do $$
declare rec record;
begin
  for rec in select * from (values
      ('users','user'), ('leave_entitlements','leave_entitlement'),
      ('office_days','office_day'), ('holidays','holiday'), ('leave_types','leave_type')
    ) as t(tbl, label)
  loop
    execute format('drop trigger if exists trg_%s_audit on public.%I', rec.tbl, rec.tbl);
    execute format(
      'create trigger trg_%s_audit after insert or update or delete on public.%I
       for each row execute function app.audit_generic(%L)', rec.tbl, rec.tbl, rec.label);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Office-day reconfiguration (§14). Closes the current generation and opens a
-- new one from `p_effective_from`; previously approved leave is untouched.
-- ---------------------------------------------------------------------------
create or replace function app.set_office_days(p_weekdays int[], p_effective_from date)
returns void
language plpgsql security invoker as $$
declare w int;
begin
  if not app.is_admin() then
    raise exception 'FORBIDDEN_ADMIN_ONLY';
  end if;

  update public.office_days
     set effective_to = p_effective_from - 1
   where effective_to is null
     and effective_from < p_effective_from;

  delete from public.office_days where effective_from = p_effective_from;

  for w in 0..6 loop
    insert into public.office_days (weekday, is_office_day, effective_from)
    values (w, w = any(p_weekdays), p_effective_from);
  end loop;
end $$;
