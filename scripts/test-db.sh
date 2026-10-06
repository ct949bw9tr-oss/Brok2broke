#!/usr/bin/env bash
# Builds a throwaway database from scratch (Supabase shim + every migration +
# fixtures) and runs every supabase/tests/NN_*.sql file against it.
#
#   TEST_DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres npm run test:db
#
# The URL must point at a maintenance database; a database named
# broke2broke_test is dropped and recreated on that server.
set -euo pipefail

cd "$(dirname "$0")/.."

# Migrations get pasted into the Supabase SQL Editor from phones/tablets, which
# can re-encode non-ASCII characters. Keep every migration pure ASCII.
if LC_ALL=C grep -nP '[^\x00-\x7F]' supabase/migrations/*.sql; then
  echo "FAIL  non-ASCII characters in migrations (use chr(...) for special characters)"
  exit 1
fi

ADMIN_URL="${TEST_DATABASE_URL:-postgres://postgres@localhost:5432/postgres}"
TEST_DB="broke2broke_test"
TEST_URL="$(node -e 'const u = new URL(process.argv[1]); u.pathname = "/" + process.argv[2]; console.log(u.toString())' "$ADMIN_URL" "$TEST_DB")"

PSQL=(psql -X -q -v ON_ERROR_STOP=1)

"${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists $TEST_DB with (force)" -c "create database $TEST_DB"

"${PSQL[@]}" "$TEST_URL" -f supabase/tests/_supabase_shim.sql
for f in supabase/migrations/*.sql; do
  "${PSQL[@]}" "$TEST_URL" -f "$f"
done
"${PSQL[@]}" "$TEST_URL" -f supabase/tests/_fixtures.sql >/dev/null

failed=0
for t in supabase/tests/[0-9]*.sql; do
  if "${PSQL[@]}" -t "$TEST_URL" -f "$t" >/dev/null; then
    echo "PASS  $t"
  else
    echo "FAIL  $t"
    failed=1
  fi
done

"${PSQL[@]}" "$ADMIN_URL" -c "drop database if exists $TEST_DB with (force)"
exit $failed
