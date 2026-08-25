#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Creates the two Postgres roles the app relies on, plus the database.
#
#   isx_owner : owns the schema, runs migrations/seed.  BYPASSES RLS.
#   isx_app   : the Next.js runtime role. NOT an owner, NO bypassrls, so every
#               query it makes is filtered by the policies in 0003_rls.sql.
#
# This separation is what makes the privacy guarantee real: even if application
# code is wrong, the runtime connection physically cannot read other people's
# rows. It mirrors Supabase's `postgres` vs `authenticated` split.
# ---------------------------------------------------------------------------
set -euo pipefail

DB_NAME="${DB_NAME:-isx_leave}"
OWNER_PW="${OWNER_PW:-isx_owner_pw}"
APP_PW="${APP_PW:-isx_app_pw}"
PSQL="${PSQL:-psql}"
SUPERUSER="${SUPERUSER:-postgres}"

run_su() { sudo -u "$SUPERUSER" $PSQL -v ON_ERROR_STOP=1 "$@"; }

echo "==> creating roles"
run_su -d postgres <<SQL
do \$\$ begin
  if not exists (select 1 from pg_roles where rolname='isx_owner') then
    create role isx_owner login password '${OWNER_PW}';
  else
    alter role isx_owner login password '${OWNER_PW}';
  end if;
  if not exists (select 1 from pg_roles where rolname='isx_app') then
    create role isx_app login password '${APP_PW}' nobypassrls nosuperuser nocreatedb nocreaterole;
  else
    alter role isx_app login password '${APP_PW}' nobypassrls nosuperuser;
  end if;
end \$\$;
SQL

echo "==> creating database ${DB_NAME}"
if ! run_su -d postgres -tAc "select 1 from pg_database where datname='${DB_NAME}'" | grep -q 1; then
  run_su -d postgres -c "create database ${DB_NAME} owner isx_owner"
fi

run_su -d "${DB_NAME}" <<SQL
grant connect on database ${DB_NAME} to isx_app;
alter schema public owner to isx_owner;
SQL

echo "==> done. isx_owner (migrations) and isx_app (runtime, RLS-enforced) are ready."
