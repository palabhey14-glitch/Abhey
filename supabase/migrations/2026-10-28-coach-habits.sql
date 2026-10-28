-- Coach edits habits. Run once on the live database:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run again. (schema.sql already includes this for a fresh install.)
--
-- 1. targets.habit_settings: the coach's name, category and show/hide choice
--    for each target habit (steps, training, protein, calories, fibre, water,
--    sleep), e.g. {"steps": {"name": "Walk", "category": "Activity", "hidden": false}}.
--    It lives on targets, which only the coach can change; clients read it.
-- 2. The coach can add, edit and remove a client's own habits.

alter table public.targets
  add column if not exists habit_settings jsonb not null default '{}'::jsonb;
alter table public.targets drop constraint if exists targets_habit_settings_object;
alter table public.targets
  add constraint targets_habit_settings_object check (jsonb_typeof(habit_settings) = 'object');

drop policy if exists "coach adds client habits" on public.client_habits;
create policy "coach adds client habits" on public.client_habits
  for insert to authenticated with check ((select public.is_coach()));
drop policy if exists "coach updates client habits" on public.client_habits;
create policy "coach updates client habits" on public.client_habits
  for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
drop policy if exists "coach deletes client habits" on public.client_habits;
create policy "coach deletes client habits" on public.client_habits
  for delete to authenticated using ((select public.is_coach()));
