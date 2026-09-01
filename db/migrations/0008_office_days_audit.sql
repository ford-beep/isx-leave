-- Record one meaningful audit entry when the default Office/WFH
-- schedule changes, instead of one entry per office_days row.

drop trigger if exists trg_office_days_audit
  on public.office_days;


create or replace function app.set_office_days(
  p_weekdays int[],
  p_effective_from date
)
returns void
language plpgsql
security invoker
as $$
declare
  w int;
  old_weekdays int[];
  new_weekdays int[];
begin
  if not app.is_admin() then
    raise exception 'FORBIDDEN_ADMIN_ONLY';
  end if;

  -- Normalise the requested weekdays so metadata is predictable.
  select coalesce(array_agg(distinct x order by x), array[]::int[])
    into new_weekdays
  from unnest(p_weekdays) as x
  where x between 0 and 6;

  -- Read the schedule that is effective on this date BEFORE changing it.
  select coalesce(
    array_agg(weekday order by weekday)
      filter (where is_office_day),
    array[]::int[]
  )
  into old_weekdays
  from public.office_days
  where effective_from <= p_effective_from
    and (
      effective_to is null
      or effective_to >= p_effective_from
    );

  update public.office_days
     set effective_to = p_effective_from - 1
   where effective_to is null
     and effective_from < p_effective_from;

  delete from public.office_days
   where effective_from = p_effective_from;

  for w in 0..6 loop
    insert into public.office_days (
      weekday,
      is_office_day,
      effective_from
    )
    values (
      w,
      w = any(new_weekdays),
      p_effective_from
    );
  end loop;

  -- Only create an audit entry when the schedule actually changed.
  if old_weekdays is distinct from new_weekdays then
    perform app.write_audit(
      'office_day.schedule_updated',
      'office_day',
      null,
      jsonb_build_object(
        'effective_from', p_effective_from,
        'before_weekdays', to_jsonb(old_weekdays),
        'after_weekdays', to_jsonb(new_weekdays)
      )
    );
  end if;
end;
$$;