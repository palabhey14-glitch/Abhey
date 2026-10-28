-- Diet requirements. Run once on the live database:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run again. (schema.sql already includes this for a fresh install.)
--
-- The coach records a client's diet requirement (Halal, Vegetarian, Vegan,
-- Pescatarian, Gluten free, Dairy free, Kosher) in Nutrition -> Nutrition
-- builder. Empty means no specific requirement.

alter table public.profiles add column if not exists diet_requirement text;
alter table public.profiles drop constraint if exists profiles_diet_requirement_check;
alter table public.profiles add constraint profiles_diet_requirement_check
  check (diet_requirement is null or length(trim(diet_requirement)) between 1 and 40);

grant update (diet_requirement) on public.profiles to authenticated;
