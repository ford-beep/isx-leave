#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Runs the SQL security/business-rule suites against the RUNTIME role.
#
# Using isx_app (not the owner) is the whole point: these tests exercise the
# database exactly as the web application sees it, with Row Level Security
# active. A test that passes here cannot be undone by a bug in the UI.
#
#   npm run db:test
# ---------------------------------------------------------------------------
set -euo pipefail

APP_URL="${DATABASE_APP_URL:-postgres://isx_app:isx_app_pw@127.0.0.1:5432/isx_leave}"
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../db/tests" && pwd)"

cd "$DIR"
fail=0
for f in *.test.sql; do
  echo ""
  echo "==================================================================="
  echo " $f"
  echo "==================================================================="
  if ! psql "$APP_URL" -q -v ON_ERROR_STOP=1 -f "$f" 2>&1 | sed 's/^psql:[^ ]* //'; then
    fail=1
  fi
done

echo ""
if [ "$fail" -eq 0 ]; then
  echo "All database test suites passed."
else
  echo "One or more database test suites FAILED."
  exit 1
fi
