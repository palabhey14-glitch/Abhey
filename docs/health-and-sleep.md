# Health Markers, Sleep and Activity reports

These changes are prepared locally for review. The live database needs
`supabase/migrations/20261029083615_health_markers_and_sleep_details.sql`
before detailed logging is enabled. It adds storage without importing readings
or updating existing client records.

Clients log health readings and optional sleep details inside the existing
Habits page. Each health reading stores the client-selected local date and time,
marker, value, optional diastolic pressure and notes. Clients can read and edit
their own readings. Coaches can read readings across clients; they cannot edit
another client's health readings through this table's policies.

The coach's Health Markers page sits between Habits and Training. It shows heart
rate, resting heart rate, HRV, glucose in mmol/L, blood pressure in mmHg,
temperature in °C and respiratory rate. The summary uses the latest reading in
the selected period, the mean of daily averages and the measured minimum/maximum.
Blood pressure preserves systolic and diastolic values separately.

Sleep duration remains in `daily_logs.sleep_h`, which the existing Sleep habit
already uses. Optional columns hold bedtime, stage minutes, latency, device
efficiency/restfulness percentages, device score, interruptions, sleeping RHR
and sleeping HRV. A score or stage is never estimated from duration. Sleep debt
adds only the shortfall below the coach's sleep target on logged nights.

Activity reports read existing steps and cardio minutes. Steps use the existing
step target. Cardio has no target field in the current app, so its target and
compliance cells remain unavailable. Unlogged dates do not count as zero.

New reports support rolling 7-day, rolling 30-day and custom periods (up to 366
days). Existing programme pages retain seven-day weeks. The header shows the
selected dates and the client's week within the 12-week programme. Client View
uses its existing panel and write-blocking behaviour; the new sections map to
the client's Habits screen.

No shared palette, existing typography, logos or navigation structure is
replaced. Component styles are scoped to `w-` classes in `wellness.css`.

Verification: `node --test site/app/js/*.test.js`. Local Postgres smoke checks
also verified the migration, value constraints and owner/coach/anonymous access.
