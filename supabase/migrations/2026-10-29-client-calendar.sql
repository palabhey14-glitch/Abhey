-- Coach-created schedule items for each client. Existing training plans,
-- nutrition targets and daily logs are displayed without being copied here.
-- This migration adds the table only; it does not insert or alter client data.
create table if not exists public.client_calendar_events (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  day date not null,
  category text not null check (category in ('events', 'workouts', 'nutrition', 'steps', 'cardio', 'weight')),
  title text not null check (length(trim(title)) between 1 and 120),
  notes text check (notes is null or length(notes) <= 1000),
  created_at timestamptz not null default now()
);

create index if not exists client_calendar_events_client_day_idx
  on public.client_calendar_events (client_id, day);

alter table public.client_calendar_events enable row level security;
revoke all on public.client_calendar_events from anon;
grant select, insert, update, delete on public.client_calendar_events to authenticated;

drop policy if exists "read own calendar or coach reads all" on public.client_calendar_events;
create policy "read own calendar or coach reads all" on public.client_calendar_events
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));

drop policy if exists "coach adds calendar events" on public.client_calendar_events;
create policy "coach adds calendar events" on public.client_calendar_events
  for insert to authenticated with check ((select public.is_coach()));

drop policy if exists "coach updates calendar events" on public.client_calendar_events;
create policy "coach updates calendar events" on public.client_calendar_events
  for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

drop policy if exists "coach deletes calendar events" on public.client_calendar_events;
create policy "coach deletes calendar events" on public.client_calendar_events
  for delete to authenticated using ((select public.is_coach()));
