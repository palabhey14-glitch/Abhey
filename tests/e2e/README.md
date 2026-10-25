# Browser tests: nutrition system

Runs the real app in Chromium against the real schema on a scratch PostgreSQL,
a real PostgREST (the API Supabase uses) and the real Netlify functions.
Open Food Facts and the recipe page are answered from `fixtures/`; every other
address goes through the real safety checks.

Needs PostgreSQL 16 (socket and port via `PGHOST`/`PGPORT`, default
`/var/lib/postgresql/rwtest` and 5499), PostgREST 12 (`POSTGREST=/path/to/postgrest`)
and Playwright.

```sh
sh tests/e2e/setup.sh && sh tests/e2e/start.sh && node tests/e2e/e2e.js
```

It covers: building a template, assigning versions, macro-only targets, recipe
import (and refusing a local address), every meal action including undo and
no duplicates, a typed food with a missing value, barcode lookup, extras,
totals flowing to the check-in, metric units, direct API calls a client must
not be able to make, and the coach's food log, history and review queue.
Screenshots go to `tests/e2e/out/` (ignored by git).
