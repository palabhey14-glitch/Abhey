-- Workout logs. Run once on the live database:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run again.
--
-- One row per client per day: the session they did and, for each exercise,
-- the weight (kg) and reps of every set. Saving a workout also marks the day
-- as "Trained: Yes" on daily_logs, which is what the Habits page reads.

create table if not exists public.workout_logs (
  user_id            uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day                date not null,
  program_start_date date,
  cycle_day          smallint check (cycle_day between 1 and 8),
  session_name       text check (session_name is null or length(session_name) <= 120),
  exercises          jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  note               text check (note is null or length(note) <= 2000),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  primary key (user_id, day)
);

drop trigger if exists touch_workout_logs on public.workout_logs;
create trigger touch_workout_logs before update on public.workout_logs
  for each row execute function public.touch_updated_at();

alter table public.workout_logs enable row level security;
revoke all on public.workout_logs from anon;
grant select, insert, update, delete on public.workout_logs to authenticated;

drop policy if exists "read own workouts or coach reads all" on public.workout_logs;
create policy "read own workouts or coach reads all" on public.workout_logs
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists "client adds own workouts" on public.workout_logs;
create policy "client adds own workouts" on public.workout_logs
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "client updates own workouts" on public.workout_logs;
create policy "client updates own workouts" on public.workout_logs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "client deletes own workouts" on public.workout_logs;
create policy "client deletes own workouts" on public.workout_logs
  for delete to authenticated using (user_id = (select auth.uid()));
