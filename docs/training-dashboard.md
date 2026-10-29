# Training dashboard additions — local review

The coach's existing Training entry now opens Workouts, Progress and Program.
The shared Rewired shell, header dates, Client View, logos, typography and global
colour tokens are preserved. New styles are scoped to `tr-` components.

Workouts shows an eight-week overview, a seven-day summary, recent sessions,
working-set totals by body part and logged exercise details. Duration and session
ratings are unavailable in the existing schema, so these remain dashes.

Progress supports 8, 12 and 26 weeks plus a custom window of up to three years.
It provides a set-weighted strength estimate, status spread, weekly sets/external
volume, body-part tiles, exercise details and recorded best history. It loads all
available workout logs in batches rather than using the 60-log client cache.
Warmups are excluded when the actual log marks them as Warmup; legacy logs without
a type count as working sets. Multiple primary muscles split each set equally.
Unknown body parts remain visible as Other. Bodyweight sets contribute sets but
no external-load volume or weighted strength estimate. Missing days are never
fabricated as completed workouts.

Estimated strength uses Epley for 2–30 reps, with a one-rep set using its actual
weight. Status compares first and last usable estimates separated by at least a
week: over +2% is progressing, under −2% regressing, and under 0.5% over at least
four weeks plateaued. Other comparable results are maintaining. These are product
reporting rules, not measured maxes. The UI explains the method. Older recorded
bests remain available when a shorter range is selected.

Program setup offers a blank program or a copy of the current program, name,
start date and checked workout days. The designer has a workout-day list, rest
days, notes, saved-workout copying, volume breakdown and exercise reordering.
The exercise picker supports multi-selection across searches and pages, search,
primary focus, equipment, library and inferred exercise type. It reads only the
existing exercises table; no starter library is inserted.

Each exercise has per-set weight, rep range, four-part tempo, RIR, set type,
group and rest seconds. Set types are Working set, Warmup, Drop set, Superset,
Giant set, Rest pause, Failure, Widowmaker, AMRAP, Top set and Back off set.
The optional group links paired exercises by a shared coach label.

Prescriptions are stored inside the existing training_plan.exercises JSONB.
Existing summary fields remain for compatibility. The client sees detailed set
instructions on the assigned program and when logging a workout. Actual logs
retain exercise IDs, primary muscles and set type for reporting.

Save Draft stores the draft only in the current browser session, scoped to the
coach and client. It never updates a client assignment. Only Save program writes
a complete cycle through the existing training_plan upsert. Existing eight-day
cycles remain eight days; no saved rows are deleted. A new program cannot reuse
an existing start date. Prior/future versions remain accessible.

No additional Training database migration or new production dependency is
required. Health/sleep and blood-test migrations remain separate, unapplied.
No deployment, remote push or live client write was performed for this work.

Validation: node --test site/app/js/*.test.js, plus isolated DOM checks for setup,
multi-select across searches, set fields, draft storage, save payload and date
range recalculation. Interactive offline previews use clearly labelled sample
records; sample exercises and sessions are not inserted into the real database.
