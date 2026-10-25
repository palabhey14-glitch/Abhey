-- Proposed additive meal-plan schema. Not applied to production yet.
-- Starter nutrition values require coach review before approval.
-- Depends on public.profiles, public.is_coach(), public.touch_updated_at().
begin;

create table public.food_items (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  food_state text not null default 'cooked' check (food_state in ('cooked','ready_to_eat','raw','dry')),
  preparation text not null default '' check (length(preparation) <= 100),
  calories_per_100g numeric(9,3) not null check (calories_per_100g >= 0),
  protein_per_100g numeric(9,3) not null check (protein_per_100g >= 0),
  carbs_per_100g numeric(9,3) not null check (carbs_per_100g >= 0),
  fat_per_100g numeric(9,3) not null check (fat_per_100g >= 0),
  source_note text not null check (length(trim(source_note)) > 0),
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index food_items_name_preparation_idx on public.food_items (lower(name), food_state, lower(preparation));

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 2 and 160),
  servings numeric(7,2) not null check (servings > 0 and servings <= 100),
  method text,
  approved boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index recipes_name_idx on public.recipes (lower(name));

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null references public.recipes (id) on delete cascade,
  food_id uuid not null references public.food_items (id) on delete restrict,
  grams numeric(9,2) not null check (grams > 0 and grams <= 50000),
  sort_order integer not null default 0,
  unique (recipe_id, food_id)
);
create index recipe_ingredients_recipe_idx on public.recipe_ingredients (recipe_id, sort_order);

create table public.meal_plan_items (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles (id) on delete cascade,
  meal_type text not null check (meal_type in ('Breakfast','Lunch','Dinner','Snack')),
  food_id uuid references public.food_items (id) on delete restrict,
  recipe_id uuid references public.recipes (id) on delete restrict,
  -- Food assignments are measured in grams; recipe assignments in servings.
  amount numeric(9,2) not null check (amount > 0 and amount <= 5000),
  sort_order integer not null default 0,
  coach_note text check (coach_note is null or length(coach_note) <= 500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exactly_one_meal_source check ((food_id is null) <> (recipe_id is null)),
  constraint recipe_portion_limit check (recipe_id is null or amount <= 20)
);
create index meal_plan_items_client_idx on public.meal_plan_items (client_id, meal_type, sort_order);

create trigger touch_food_items before update on public.food_items
  for each row execute function public.touch_updated_at();
create trigger touch_recipes before update on public.recipes
  for each row execute function public.touch_updated_at();
create trigger touch_meal_plan_items before update on public.meal_plan_items
  for each row execute function public.touch_updated_at();

create function public.guard_recipe_approval() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.approved and (
    not exists (select 1 from public.recipe_ingredients i where i.recipe_id = new.id)
    or exists (
      select 1 from public.recipe_ingredients i
      join public.food_items f on f.id = i.food_id
      where i.recipe_id = new.id and not f.approved
    )
  ) then
    raise exception 'Approve the recipe only after all ingredients and foods are reviewed';
  end if;
  return new;
end;
$$;
create trigger guard_recipe_approval before update of approved on public.recipes
  for each row execute function public.guard_recipe_approval();

create function public.guard_meal_assignment() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.food_id is not null and not exists
    (select 1 from public.food_items f where f.id = new.food_id and f.approved) then
    raise exception 'Food must be reviewed before assignment';
  end if;
  if new.recipe_id is not null and not exists
    (select 1 from public.recipes r where r.id = new.recipe_id and r.approved) then
    raise exception 'Recipe must be reviewed before assignment';
  end if;
  return new;
end;
$$;
create trigger guard_meal_assignment before insert or update on public.meal_plan_items
  for each row execute function public.guard_meal_assignment();

create function public.guard_food_visibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.approved and not new.approved and (
    exists (select 1 from public.meal_plan_items m where m.food_id = old.id)
    or exists (
      select 1 from public.recipe_ingredients i
      join public.recipes r on r.id = i.recipe_id
      where i.food_id = old.id and r.approved
    )
  ) then raise exception 'Remove assignments and approved recipe use before unapproving this food';
  end if;
  return new;
end;
$$;
create trigger guard_food_visibility before update of approved on public.food_items
  for each row execute function public.guard_food_visibility();

create function public.guard_recipe_visibility() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if old.approved and not new.approved and exists
    (select 1 from public.meal_plan_items m where m.recipe_id = old.id) then
    raise exception 'Remove assignments before unapproving this recipe';
  end if;
  return new;
end;
$$;
create trigger guard_recipe_visibility before update of approved on public.recipes
  for each row execute function public.guard_recipe_visibility();

create function public.guard_recipe_ingredient() returns trigger
language plpgsql security definer set search_path = '' as $$
declare recipe_is_approved boolean;
begin
  if tg_op = 'DELETE' then
    select approved into recipe_is_approved from public.recipes where id = old.recipe_id;
    if recipe_is_approved and
      (select count(*) from public.recipe_ingredients where recipe_id = old.recipe_id) <= 1 then
      raise exception 'An approved recipe must keep at least one ingredient';
    end if;
    return old;
  end if;
  select approved into recipe_is_approved from public.recipes where id = new.recipe_id;
  if recipe_is_approved and not exists
    (select 1 from public.food_items f where f.id = new.food_id and f.approved) then
    raise exception 'An approved recipe can only use reviewed foods';
  end if;
  return new;
end;
$$;
create trigger guard_recipe_ingredient before insert or update or delete on public.recipe_ingredients
  for each row execute function public.guard_recipe_ingredient();

alter table public.food_items enable row level security;
alter table public.recipes enable row level security;
alter table public.recipe_ingredients enable row level security;
alter table public.meal_plan_items enable row level security;

revoke all on public.food_items, public.recipes, public.recipe_ingredients, public.meal_plan_items from anon;
grant select, insert, update, delete on public.food_items, public.recipes, public.recipe_ingredients, public.meal_plan_items to authenticated;

create policy "coach or approved foods" on public.food_items for select to authenticated
  using (approved or (select public.is_coach()));
create policy "coach inserts foods" on public.food_items for insert to authenticated
  with check ((select public.is_coach()));
create policy "coach updates foods" on public.food_items for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "coach deletes foods" on public.food_items for delete to authenticated
  using ((select public.is_coach()));

create policy "coach or approved recipes" on public.recipes for select to authenticated
  using (approved or (select public.is_coach()));
create policy "coach inserts recipes" on public.recipes for insert to authenticated
  with check ((select public.is_coach()));
create policy "coach updates recipes" on public.recipes for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "coach deletes recipes" on public.recipes for delete to authenticated
  using ((select public.is_coach()));

create policy "ingredients of approved recipes" on public.recipe_ingredients for select to authenticated
  using ((select public.is_coach()) or exists
    (select 1 from public.recipes r where r.id = recipe_id and r.approved));
create policy "coach inserts ingredients" on public.recipe_ingredients for insert to authenticated
  with check ((select public.is_coach()));
create policy "coach updates ingredients" on public.recipe_ingredients for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "coach deletes ingredients" on public.recipe_ingredients for delete to authenticated
  using ((select public.is_coach()));

create policy "client reads own assigned plan or coach reads all" on public.meal_plan_items for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));
create policy "coach assigns meals" on public.meal_plan_items for insert to authenticated
  with check ((select public.is_coach()));
create policy "coach updates assigned meals" on public.meal_plan_items for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "coach removes assigned meals" on public.meal_plan_items for delete to authenticated
  using ((select public.is_coach()));

-- Trigger functions are internal and must not be exposed as API RPCs.
revoke execute on function public.guard_recipe_approval() from public, anon, authenticated;
revoke execute on function public.guard_meal_assignment() from public, anon, authenticated;
revoke execute on function public.guard_food_visibility() from public, anon, authenticated;
revoke execute on function public.guard_recipe_visibility() from public, anon, authenticated;
revoke execute on function public.guard_recipe_ingredient() from public, anon, authenticated;

commit;
