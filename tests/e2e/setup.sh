#!/bin/sh
# Builds a scratch database "rw" from the real schema, loads the sample foods
# and three test people. Needs a local PostgreSQL 16 on the socket below.
set -e
E=$(cd "$(dirname "$0")" && pwd)
R="$E/../.."
P="psql -h ${PGHOST:-/var/lib/postgresql/rwtest} -p ${PGPORT:-5499} -U postgres"
pkill -x postgrest 2>/dev/null || true; sleep 0.5
$P -d postgres -qc "drop database if exists rw" -qc "create database rw"
for r in anon authenticated service_role; do $P -d postgres -qc "drop owned by $r cascade" 2>/dev/null || true; $P -d postgres -qc "drop role if exists $r" 2>/dev/null || true; done
for f in supabase/tests/supabase_stub.sql supabase/schema.sql supabase/migrations/2026-10-25-habits.sql supabase/migrations/2026-10-25-nutrition.sql supabase/migrations/2026-10-26-exercises.sql supabase/migrations/2026-10-26-checkin-day.sql supabase/migrations/2026-10-26-workout-logs.sql supabase/migrations/2026-10-26-meal-names.sql supabase/migrations/2026-10-28-coach-habits.sql supabase/migrations/2026-10-28-diet-requirements.sql supabase/migrations/2026-10-28-carb-cycle.sql supabase/migrations/2026-10-29-forms.sql supabase/migrations/2026-10-29-messages.sql; do
  $P -d rw -v ON_ERROR_STOP=1 -q -f "$R/$f" 2>&1 | grep -v NOTICE || true
done
[ -f "$E/sample.sql" ] || node "$R/tools/food-import/import.js" sample --sink sql --out "$E/sample.sql"
$P -d rw -v ON_ERROR_STOP=1 -q -f "$E/sample.sql" > /dev/null
$P -d rw -v ON_ERROR_STOP=1 -q -f "$E/people.sql"
