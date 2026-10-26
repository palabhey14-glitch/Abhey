-- Check-in day. Run once on the live database:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run again. (schema.sql already includes this for a fresh install.)
--
-- The coach picks each client's weekly check-in day: 0 = Sunday ... 6 = Saturday.
-- The app opens the check-in the day before and closes it at the end of that day.
-- It lives on targets, which only the coach can change.

alter table public.targets
  add column if not exists checkin_day smallint not null default 0
    check (checkin_day between 0 and 6);
