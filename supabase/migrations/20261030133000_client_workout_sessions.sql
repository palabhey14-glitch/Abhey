-- A client's in-progress workout is separate from completed workout logs and
-- coach-authored training plans. One active session per client.
create table if not exists public.client_workout_sessions (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  day date not null,
  cycle_day smallint not null check (cycle_day between 1 and 31),
  session_name text,
  started_at timestamptz not null default now(),
  draft jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.client_workout_sessions enable row level security;
revoke all on public.client_workout_sessions from anon;
grant select, insert, update, delete on public.client_workout_sessions to authenticated;

drop policy if exists "client manages own workout session" on public.client_workout_sessions;
create policy "client manages own workout session" on public.client_workout_sessions
  for all to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
