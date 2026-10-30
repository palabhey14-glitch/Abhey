-- Client choices for Home and a separate record of supplements taken.
-- These tables never modify a coach's plan or a historical workout log.
create table if not exists public.client_home_preferences (
  user_id uuid primary key references public.profiles (id) on delete cascade,
  metric_keys text[] not null default '{}',
  habit_keys text[] not null default '{}',
  updated_at timestamptz not null default now()
);
alter table public.client_home_preferences enable row level security;
revoke all on public.client_home_preferences from anon;
grant select, insert, update, delete on public.client_home_preferences to authenticated;
drop policy if exists "client manages own home preferences" on public.client_home_preferences;
create policy "client manages own home preferences" on public.client_home_preferences
  for all to authenticated using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create table if not exists public.client_supplement_intake (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  name text not null check (length(trim(name)) between 1 and 120),
  dose text check (dose is null or length(dose) <= 120),
  note text check (note is null or length(note) <= 500),
  created_at timestamptz not null default now()
);
create index if not exists client_supplement_intake_user_day_idx
  on public.client_supplement_intake (user_id, day desc);
alter table public.client_supplement_intake enable row level security;
revoke all on public.client_supplement_intake from anon;
grant select, insert, delete on public.client_supplement_intake to authenticated;
drop policy if exists "client reads own supplement intake or coach reads all" on public.client_supplement_intake;
create policy "client reads own supplement intake or coach reads all" on public.client_supplement_intake
  for select to authenticated
  using (user_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists "client adds own supplement intake" on public.client_supplement_intake;
create policy "client adds own supplement intake" on public.client_supplement_intake
  for insert to authenticated with check (user_id = (select auth.uid()));
drop policy if exists "client deletes own supplement intake" on public.client_supplement_intake;
create policy "client deletes own supplement intake" on public.client_supplement_intake
  for delete to authenticated using (user_id = (select auth.uid()));
