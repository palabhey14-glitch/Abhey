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

## Blood-test results

Apply `20261029101555_health_blood_test_markers.sql` after the health/sleep
migration when deploying. It adds free/total testosterone, SHBG, E2, TSH,
free T4, free T3, total/LDL/HDL cholesterol and triglycerides to the existing
readings table. Existing ownership policies remain in place.

Clients select the sample collection date, report units and exact/less-than/
greater-than result format. Collection time, laboratory name and the laboratory's
reported reference range are optional. Results retain up to six decimal places.
The client Habits summary shows the latest blood results at or before the
selected day, including older tests. Coach summaries follow the selected period.

Each chart and average uses a single unit. Units are never silently converted
or combined. Limit results such as `<0.005` remain visible in the latest result
and history but are excluded from averages and exact graph points. The app
does not supply normal ranges or interpret results.

Unit-label references (no clinical thresholds copied into the app):
- [Royal Melbourne Hospital: free testosterone](https://www.thermh.org.au/health-professionals/pathology-handbook/testosterone-free)
- [Quest Diagnostics: SI units](https://www.questdiagnostics.com/content/dam/corporate/restricted/documents/test-center/si_units/si_units.pdf)
- [Gloucestershire Hospitals: thyroid function tests](https://www.gloshospitals.nhs.uk/our-services/services-we-offer/pathology/tests-and-investigations/thyroid-function-tests-tsh-ft4-ft3/)
- [Cleveland Clinic Laboratories: free T3](https://clevelandcliniclabs.com/test/t3-free/)
- [Fairbanks Memorial Hospital: TSH](https://fhplab.testcatalog.org/show/TSH)
