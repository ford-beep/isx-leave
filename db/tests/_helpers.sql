-- Shared test harness. Included with \i by each test file.
-- Everything lives in pg_temp so tests leave no trace in the database.
create temporary table if not exists results (
  seq serial, label text, passed boolean, detail text
);

create or replace function pg_temp.act_as(p uuid) returns void
language sql as $$ select set_config('app.current_user_id', coalesce(p::text, ''), false)::void; $$;

create or replace function pg_temp.anon() returns void
language sql as $$ select set_config('app.current_user_id', '', false)::void; $$;

create or replace function pg_temp.ok(cond boolean, label text, detail text default null) returns void
language plpgsql as $$
begin
  insert into results (label, passed, detail) values (label, cond, detail);
  if cond then
    raise notice '  PASS  %', label;
  else
    raise warning '  FAIL  %  <%>', label, coalesce(detail, 'assertion false');
  end if;
end $$;

create or replace function pg_temp.eq(actual anyelement, expected anyelement, label text) returns void
language plpgsql as $$
begin
  perform pg_temp.ok(actual is not distinct from expected, label,
    format('expected %s, got %s', expected, actual));
end $$;

-- Runs `sql_text` expecting it to fail; passes when the raised message
-- contains `expect` (use '' to accept any error).
create or replace function pg_temp.raises(sql_text text, expect text, label text) returns void
language plpgsql as $$
begin
  begin
    execute sql_text;
  exception when others then
    perform pg_temp.ok(expect = '' or position(expect in sqlerrm) > 0, label,
      format('expected error containing "%s", got "%s"', expect, sqlerrm));
    return;
  end;
  perform pg_temp.ok(false, label, 'statement unexpectedly SUCCEEDED');
end $$;

create or replace function pg_temp.summary(suite text) returns void
language plpgsql as $$
declare total int; failed int;
begin
  select count(*), count(*) filter (where not passed) into total, failed from results;
  raise notice '';
  raise notice '%: % passed, % failed (of %)', suite, total - failed, failed, total;
  if failed > 0 then
    raise exception 'TEST SUITE FAILED: % assertion(s) failed in %', failed, suite;
  end if;
end $$;
