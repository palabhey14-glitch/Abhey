-- Habit tracker. Run once on the live database:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- (schema.sql already includes this for a fresh install.)
--
-- The tracker shows two kinds of row:
--   * Target habits: steps, protein, calories, fibre, water, sleep, training.
--     Their numbers live on daily_logs and their targets are the ones the
--     coach already sets (targets + macro_targets), so they need only the two
--     new daily columns below.
--   * The client's own habits (client_habits), each with a daily target the
--     client picks, logged in habit_entries.
-- Green / orange / red is worked out in the app, never stored.

alter table public.daily_logs
  add column if not exists water_l numeric(4, 1) check (water_l between 0 and 15),
  add column if not exists sleep_h numeric(3, 1) check (sleep_h between 0 and 16);

create table if not exists public.client_habits (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  category    text not null check (category in
                ('Activity', 'Nutrition', 'Hydration', 'Recovery', 'Mindset', 'Lifestyle')),
  unit        text not null default 'times' check (length(unit) between 1 and 20),
  target      numeric(8, 2) not null default 1 check (target > 0 and target <= 100000),
  icon        text check (icon is null or length(icon) <= 8),
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists client_habits_user_idx on public.client_habits (user_id, sort_order);

create table if not exists public.habit_entries (
  habit_id    uuid not null references public.client_habits (id) on delete cascade,
  user_id     uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day         date not null,
  value       numeric(10, 2) not null check (value >= 0 and value <= 1000000),
  updated_at  timestamptz not null default now(),
  primary key (habit_id, day)
);
create index if not exists habit_entries_user_day_idx on public.habit_entries (user_id, day);

drop trigger if exists touch_client_habits on public.client_habits;
create trigger touch_client_habits before update on public.client_habits
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_habit_entries on public.habit_entries;
create trigger touch_habit_entries before update on public.habit_entries
  for each row execute function public.touch_updated_at();

revoke all on public.client_habits, public.habit_entries from anon;
grant select, insert, update, delete on public.client_habits, public.habit_entries to authenticated;

alter table public.client_habits enable row level security;
alter table public.habit_entries enable row level security;

-- client_habits: the client owns their habits, the coach reads them
drop policy if exists "read own habits or coach reads all" on public.client_habits;
create policy "read own habits or coach reads all" on public.client_habits
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists "client adds own habits" on public.client_habits;
create policy "client adds own habits" on public.client_habits
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "client updates own habits" on public.client_habits;
create policy "client updates own habits" on public.client_habits
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
drop policy if exists "client deletes own habits" on public.client_habits;
create policy "client deletes own habits" on public.client_habits
  for delete to authenticated using (user_id = (select auth.uid()));

-- habit_entries: only against the client's own habits
drop policy if exists "read own habit entries or coach reads all" on public.habit_entries;
create policy "read own habit entries or coach reads all" on public.habit_entries
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists "client adds own habit entries" on public.habit_entries;
create policy "client adds own habit entries" on public.habit_entries
  for insert to authenticated
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.client_habits h
                          where h.id = habit_id and h.user_id = (select auth.uid())));
drop policy if exists "client updates own habit entries" on public.habit_entries;
create policy "client updates own habit entries" on public.habit_entries
  for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid())
              and exists (select 1 from public.client_habits h
                          where h.id = habit_id and h.user_id = (select auth.uid())));
drop policy if exists "client deletes own habit entries" on public.habit_entries;
create policy "client deletes own habit entries" on public.habit_entries
  for delete to authenticated using (user_id = (select auth.uid()));
