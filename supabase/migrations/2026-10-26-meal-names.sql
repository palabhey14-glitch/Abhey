-- Client meal names. Run once on the live database:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run again.
--
-- Lets a client rename their meals ("Breakfast" -> "Morning shake"). Keys are
-- a food log slot (Breakfast, Lunch, Dinner, Snacks, "Meal: <name>") or
-- "plan:<meal id>" for a meal on the coach's plan. The coach sees the names.

alter table public.profiles add column if not exists meal_names jsonb not null default '{}'::jsonb;

alter table public.profiles drop constraint if exists profiles_meal_names_check;
alter table public.profiles add constraint profiles_meal_names_check
  check (jsonb_typeof(meal_names) = 'object' and pg_column_size(meal_names) <= 4000);

grant update (meal_names) on public.profiles to authenticated;
