-- Meal plans. Run once on the live database:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- (schema.sql already includes this for a fresh install.)
--
-- One plan per client, written by the coach and read by the client.
-- meals is a list of meals, each with its foods:
--   [{ "name": "Breakfast", "items": [
--      { "food": "oats", "name": "Rolled oats", "qty": 1, "serving_g": 40, "serving": "40 g",
--        "per100": { "kcal": 379, "p": 13.2, "c": 67.7, "f": 6.5, "fibre": 10.1 },
--        "edited": null } ] }]
-- per100 is copied from the app's food list when the food is added, so later
-- changes to that list never change a plan. "edited" holds the coach's own
-- numbers for that item ({kcal, p, c, f}) until they reset it.

create table if not exists public.meal_plans (
  client_id   uuid primary key references public.profiles (id) on delete cascade,
  meals       jsonb not null default '[]'::jsonb
                check (jsonb_typeof(meals) = 'array' and pg_column_size(meals) < 200000),
  coach_note  text check (coach_note is null or length(coach_note) <= 1000),
  updated_at  timestamptz not null default now()
);

drop trigger if exists touch_meal_plans on public.meal_plans;
create trigger touch_meal_plans before update on public.meal_plans
  for each row execute function public.touch_updated_at();

revoke all on public.meal_plans from anon;
grant select, insert, update, delete on public.meal_plans to authenticated;
alter table public.meal_plans enable row level security;

-- The client reads their own plan; only the coach writes plans.
drop policy if exists "read own meal plan or coach reads all" on public.meal_plans;
create policy "read own meal plan or coach reads all" on public.meal_plans
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists "coach adds meal plans" on public.meal_plans;
create policy "coach adds meal plans" on public.meal_plans
  for insert to authenticated with check ((select public.is_coach()));
drop policy if exists "coach updates meal plans" on public.meal_plans;
create policy "coach updates meal plans" on public.meal_plans
  for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
drop policy if exists "coach deletes meal plans" on public.meal_plans;
create policy "coach deletes meal plans" on public.meal_plans
  for delete to authenticated using ((select public.is_coach()));
