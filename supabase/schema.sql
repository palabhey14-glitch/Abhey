-- Rewired Coaching client app: database, security rules and photo storage.
--
-- Mirrors the "Rewired Coaching Client Template" workbook:
--   Start Here      -> profiles (client fills) + targets (coach sets)
--   Weekly Tracker  -> daily_logs (client) + macro_targets (coach, per week)
--   Training        -> training_plan (coach sets an eight-day cycle)
--   Supplements     -> general guide in the app (no per-client table)
--   Check-In        -> weekly_checkins (client, coach adds feedback)
--   Measurements    -> measurements (every 2 weeks)
--   Progress photos -> progress_photos + private storage bucket
--   Dashboard       -> calculated in the app from the tables above
--
-- Run once: Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to read top to bottom; every table has row level security switched on,
-- so a client can only ever see their own rows and only the coach sees everyone.

-- ---------------------------------------------------------------------------
-- 1. Tables
-- ---------------------------------------------------------------------------

-- "Start Here" client profile. One row per person, created automatically
-- when Abhey adds them in Authentication -> Users.
create table public.profiles (
  id                     uuid primary key references auth.users (id) on delete cascade,
  email                  text,
  role                   text not null default 'client' check (role in ('client', 'coach')),
  full_name              text,
  phone                  text,
  start_date             date,  -- a Monday; week 1 starts on this day
  age                    int check (age between 14 and 100),
  height_cm              numeric(5, 1) check (height_cm between 100 and 250),
  dream_outcome          text check (dream_outcome in
                           ('Fat loss', 'Muscle gain', 'Improve body recomposition', 'Get ready for an event')),
  training_days_per_week int check (training_days_per_week between 2 and 6),
  training_experience    text check (training_experience in
                           ('Beginner (<1 yr)', 'Intermediate (1-3 yrs)', 'Advanced (3+ yrs)')),
  nutrition_tracking     text check (nutrition_tracking in ('Macro-based / Flexible', 'Assigned meal plan')),
  injuries               text,
  work_schedule          text,
  wake_sleep             text,
  consent_at             timestamptz,  -- when the client agreed to the privacy notice
  created_at             timestamptz not null default now()
);

-- "12-week targets" and "weekly average targets". The coach sets these
-- after the kickoff call; the client can read them.
create table public.targets (
  client_id        uuid primary key references public.profiles (id) on delete cascade,
  goal_weight_kg   numeric(5, 1) check (goal_weight_kg between 30 and 300),
  goal_waist_cm    numeric(5, 1) check (goal_waist_cm between 40 and 250),
  strength_goal    text,
  non_scale_goal   text,
  why              text,
  event_date       date,
  steps_target     int not null default 10000 check (steps_target between 0 and 50000),
  water_target     text not null default '3-4 L',
  fibre_target_g   int not null default 30,
  sleep_target_h   numeric(3, 1) not null default 7,
  whole_foods_pct  int not null default 80 check (whole_foods_pct between 0 and 100),
  coach_note       text,  -- "biggest lever for next week", shown on the dashboard
  updated_at       timestamptz not null default now()
);

-- Weekly Tracker "TARGETS · COACH" columns. The coach sets Monday's macros;
-- weeks without their own row carry the latest earlier week forward.
create table public.macro_targets (
  client_id    uuid not null references public.profiles (id) on delete cascade,
  week_number  int not null check (week_number between 1 and 12),
  protein_g    int not null check (protein_g between 0 and 600),
  carbs_g      int not null check (carbs_g between 0 and 1000),
  fats_g       int not null check (fats_g between 0 and 400),
  fibre_g      int not null default 0 check (fibre_g between 0 and 150),
  -- Same formula as the workbook: P*4 + C*4 + F*9 + fibre*2
  calories     int generated always as (protein_g * 4 + carbs_g * 4 + fats_g * 9 + fibre_g * 2) stored,
  updated_at   timestamptz not null default now(),
  primary key (client_id, week_number)
);

-- Coach-assigned training sessions. A program is an eight-day repeating
-- cycle; exercises hold the ordered sets, reps, effort, rest and notes.
create table public.training_plan (
  client_id          uuid not null references public.profiles (id) on delete cascade,
  program_start_date date not null,
  cycle_day          smallint not null check (cycle_day between 1 and 8),
  program_name       text not null check (length(trim(program_name)) > 0),
  session_name       text not null check (length(trim(session_name)) > 0),
  is_rest_day        boolean not null default false,
  exercises          jsonb not null default '[]'::jsonb check (jsonb_typeof(exercises) = 'array'),
  session_note       text,
  updated_at         timestamptz not null default now(),
  primary key (client_id, program_start_date, cycle_day),
  constraint training_plan_rest_exercises_check check
    ((is_rest_day and jsonb_array_length(exercises) = 0)
      or (not is_rest_day and jsonb_array_length(exercises) > 0))
);
create index training_plan_client_start_idx
  on public.training_plan (client_id, program_start_date desc, cycle_day);

-- Weekly Tracker daily rows: activity and actual intake.
create table public.daily_logs (
  id          bigint generated always as identity primary key,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day         date not null,
  weight_kg   numeric(5, 2) check (weight_kg between 30 and 300),
  steps       int check (steps between 0 and 100000),
  cardio_min  int check (cardio_min between 0 and 600),
  trained     text check (trained in ('Yes', 'Rest day', 'Missed')),
  calories    int check (calories between 0 and 10000),
  protein_g   int check (protein_g between 0 and 600),
  carbs_g     int check (carbs_g between 0 and 1000),
  fats_g      int check (fats_g between 0 and 400),
  fibre_g     int check (fibre_g between 0 and 150),
  meal_plan   text check (meal_plan in ('Yes', 'Partly', 'No')),
  notes       text,  -- "How did today go?"
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, day)
);

-- Weekly Check-In tab (filled every Sunday night). Averages come from
-- daily_logs in the app; this row holds what can't be calculated.
create table public.weekly_checkins (
  user_id           uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_number       int not null check (week_number between 1 and 12),
  sleep_hours       numeric(3, 1) check (sleep_hours between 0 and 14),
  stress            smallint check (stress between 1 and 10),     -- 10 = low stress
  energy            smallint check (energy between 1 and 10),
  hunger            smallint check (hunger between 1 and 10),
  digestion         smallint check (digestion between 1 and 10),
  biggest_win       text,
  biggest_struggle  text,
  coach_feedback    text,  -- only the coach can write this
  submitted_at      timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  primary key (user_id, week_number)
);

-- Body measurements (cm), every 2 weeks: start (week 0), 2, 4 ... 12.
create table public.measurements (
  user_id      uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_number  int not null check (week_number in (0, 2, 4, 6, 8, 10, 12)),
  measured_on  date not null default current_date,
  chest        numeric(5, 1) check (chest between 40 and 250),
  waist        numeric(5, 1) check (waist between 40 and 250),  -- at the navel
  hips         numeric(5, 1) check (hips between 40 and 250),
  arm          numeric(5, 1) check (arm between 10 and 100),    -- flexed
  thigh        numeric(5, 1) check (thigh between 20 and 150),  -- mid
  updated_at   timestamptz not null default now(),
  primary key (user_id, week_number)
);

-- Progress photos: front, side, back for the start (week 0) and each week.
-- The image itself lives in the private "progress-photos" storage bucket.
create table public.progress_photos (
  id            bigint generated always as identity primary key,
  user_id       uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  week_number   int not null check (week_number between 0 and 12),
  pose          text not null check (pose in ('front', 'side', 'back')),
  storage_path  text not null unique,
  created_at    timestamptz not null default now(),
  unique (user_id, week_number, pose)
);

-- ---------------------------------------------------------------------------
-- 2. Helpers and triggers
-- ---------------------------------------------------------------------------

-- True when the signed-in person is the coach. Security definer so it can
-- read profiles without tripping the profiles policies (no recursion).
create function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles
    where id = (select auth.uid()) and role = 'coach'
  );
$$;

revoke execute on function public.is_coach() from public, anon;
grant execute on function public.is_coach() to authenticated;

-- Every new login gets a profile and an empty targets row.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email) values (new.id, new.email);
  insert into public.targets (client_id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger touch_targets before update on public.targets
  for each row execute function public.touch_updated_at();
create trigger touch_macro_targets before update on public.macro_targets
  for each row execute function public.touch_updated_at();
create trigger touch_daily_logs before update on public.daily_logs
  for each row execute function public.touch_updated_at();
create trigger touch_weekly_checkins before update on public.weekly_checkins
  for each row execute function public.touch_updated_at();
create trigger touch_measurements before update on public.measurements
  for each row execute function public.touch_updated_at();
create trigger touch_training_plan before update on public.training_plan
  for each row execute function public.touch_updated_at();

-- Clients can't write coach feedback; the coach can only write coach feedback
-- on a client's check-in (never change the client's own answers).
create function public.guard_weekly_checkin()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  feedback text;
begin
  if tg_op = 'INSERT' then
    if not public.is_coach() then
      new.coach_feedback := null;
    end if;
    return new;
  end if;

  if new.user_id <> old.user_id or new.week_number <> old.week_number then
    raise exception 'A check-in cannot be moved to another client or week';
  end if;

  if new.user_id = (select auth.uid()) then
    new.coach_feedback := old.coach_feedback;   -- client editing their own row
  else
    feedback := new.coach_feedback;             -- coach: keep the client's answers
    new := old;
    new.coach_feedback := feedback;
  end if;
  return new;
end;
$$;

create trigger guard_weekly_checkins before insert or update on public.weekly_checkins
  for each row execute function public.guard_weekly_checkin();

-- ---------------------------------------------------------------------------
-- 3. Who can change which columns
-- ---------------------------------------------------------------------------

-- Nobody signed out can touch these tables.
revoke all on public.profiles, public.targets, public.macro_targets, public.daily_logs,
  public.weekly_checkins, public.measurements, public.progress_photos,
  public.training_plan from anon;

-- Profiles are created by the trigger, never by the app, and the role column
-- can only be changed from the SQL editor. Clients edit their own details.
revoke insert, update, delete on public.profiles from authenticated;
grant update (full_name, phone, start_date, age, height_cm, dream_outcome, training_days_per_week,
  training_experience, nutrition_tracking, injuries, work_schedule, wake_sleep, consent_at)
  on public.profiles to authenticated;

-- Targets rows are created by the trigger; the coach only updates them.
revoke insert, delete on public.targets from authenticated;

-- ---------------------------------------------------------------------------
-- 4. Row level security: clients see their own rows, the coach sees all
-- ---------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.targets         enable row level security;
alter table public.macro_targets   enable row level security;
alter table public.daily_logs      enable row level security;
alter table public.weekly_checkins enable row level security;
alter table public.measurements    enable row level security;
alter table public.progress_photos enable row level security;
alter table public.training_plan   enable row level security;

-- profiles
create policy "read own profile or coach reads all" on public.profiles
  for select to authenticated
  using (id = (select auth.uid()) or (select public.is_coach()));
create policy "update own profile or coach updates all" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()) or (select public.is_coach()))
  with check (id = (select auth.uid()) or (select public.is_coach()));

-- targets: coach writes, client reads
create policy "read own targets or coach reads all" on public.targets
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));
create policy "coach updates targets" on public.targets
  for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

-- macro_targets: coach writes, client reads
create policy "read own macros or coach reads all" on public.macro_targets
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));
create policy "coach adds macros" on public.macro_targets
  for insert to authenticated with check ((select public.is_coach()));
create policy "coach updates macros" on public.macro_targets
  for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "coach deletes macros" on public.macro_targets
  for delete to authenticated using ((select public.is_coach()));

-- training_plan: coach writes, client reads their own program
create policy "read own training plan or coach reads all" on public.training_plan
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));
create policy "coach adds training plan" on public.training_plan
  for insert to authenticated with check ((select public.is_coach()));
create policy "coach updates training plan" on public.training_plan
  for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "coach deletes training plan" on public.training_plan
  for delete to authenticated using ((select public.is_coach()));

-- daily_logs: client owns, coach reads
create policy "read own logs or coach reads all" on public.daily_logs
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_coach()));
create policy "client adds own logs" on public.daily_logs
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "client updates own logs" on public.daily_logs
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "client deletes own logs" on public.daily_logs
  for delete to authenticated using (user_id = (select auth.uid()));

-- weekly_checkins: client owns, coach reads and adds feedback (see trigger)
create policy "read own check-ins or coach reads all" on public.weekly_checkins
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_coach()));
create policy "client adds own check-ins" on public.weekly_checkins
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "client or coach updates check-ins" on public.weekly_checkins
  for update to authenticated
  using (user_id = (select auth.uid()) or (select public.is_coach()))
  with check (user_id = (select auth.uid()) or (select public.is_coach()));

-- measurements: client owns, coach reads
create policy "read own measurements or coach reads all" on public.measurements
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_coach()));
create policy "client adds own measurements" on public.measurements
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "client updates own measurements" on public.measurements
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "client deletes own measurements" on public.measurements
  for delete to authenticated using (user_id = (select auth.uid()));

-- progress_photos: client owns, coach reads. The file must sit in the
-- client's own folder ("<their user id>/...").
create policy "read own photos or coach reads all" on public.progress_photos
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_coach()));
create policy "client adds own photos" on public.progress_photos
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and storage_path like (select auth.uid())::text || '/%');
create policy "client deletes own photos" on public.progress_photos
  for delete to authenticated using (user_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- 5. Private photo storage
-- ---------------------------------------------------------------------------

-- Private bucket: photos are never on a public link. The app shows them
-- with short-lived signed links. 10 MB per image, images only.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('progress-photos', 'progress-photos', false, 10485760,
        array['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif']);

create policy "client uploads to own photo folder" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'progress-photos'
              and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "client or coach views photos" on storage.objects
  for select to authenticated
  using (bucket_id = 'progress-photos'
         and ((storage.foldername(name))[1] = (select auth.uid())::text or (select public.is_coach())));
create policy "client deletes own photos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'progress-photos'
         and (storage.foldername(name))[1] = (select auth.uid())::text);
