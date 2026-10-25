-- Nutrition: food database, recipes, meal-plan templates, versioned plan
-- assignments, meal-by-meal food logging and an audit history.
--
-- Run after schema.sql and migrations/2026-10-25-habits.sql:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run twice. It replaces the earlier meal_plans table design
-- (migrations/2026-10-25-meal-plans.sql), which was never needed live.
--
-- Rules this file enforces in the database, not just in the app:
--   * Only the coach writes templates, assignments and targets.
--   * Assignments are versions: once saved they never change. A new version
--     ends the previous one, so past days keep the plan that applied then.
--   * A client logs only their own food. Plan meals are logged through
--     log_meal(), which copies the plan's numbers; it never edits the plan.
--   * Every logged food keeps a copy of the nutrition it was logged with, so
--     later food or plan edits cannot rewrite history.
--   * Unknown nutrients stay unknown (null). Nothing is counted as zero.

create extension if not exists pg_trgm with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. Client country (used to rank local foods first) and daily-log flags
-- ---------------------------------------------------------------------------

alter table public.profiles
  add column if not exists country text not null default 'AU' check (country ~ '^[A-Z]{2}$');
grant update (country) on public.profiles to authenticated;

-- When a client logs food item by item, the day's totals in daily_logs come
-- from the food log and the check-in form shows them read-only.
alter table public.daily_logs
  add column if not exists food_from_log boolean not null default false,
  add column if not exists food_unknown_items int not null default 0;

-- ---------------------------------------------------------------------------
-- 2. Food sources and foods
-- ---------------------------------------------------------------------------

create table if not exists public.food_sources (
  id           text primary key check (id ~ '^[a-z]{2,12}$'),
  name         text not null,
  publisher    text,
  licence      text not null,
  licence_url  text,
  attribution  text not null,
  share_alike  boolean not null default false,
  homepage     text,
  notes        text,
  updated_at   timestamptz not null default now()
);

insert into public.food_sources (id, name, publisher, licence, licence_url, attribution, share_alike, homepage, notes) values
  ('afcd', 'Australian Food Composition Database, Release 3', 'Food Standards Australia New Zealand',
   'FSANZ Data User Licence (based on CC BY-SA 3.0 AU)',
   'https://www.foodstandards.gov.au/science-data/monitoringnutrients/afcd/datauserlicenceagreement',
   'Food Standards Australia New Zealand (2025). Australian Food Composition Database - Release 3.', true,
   'https://www.foodstandards.gov.au/science-data/food-nutrient-databases/afcd',
   'Distribution must include the licence link, the Limitation of Data Statement and a statement that the data is Australian and may not suit other countries. Energy: kJ with dietary fibre / 4.184. Carbohydrate: available.'),
  ('usda', 'USDA FoodData Central (Foundation Foods, SR Legacy)', 'U.S. Department of Agriculture, Agricultural Research Service',
   'CC0 1.0 (public domain)', 'https://creativecommons.org/publicdomain/zero/1.0/',
   'U.S. Department of Agriculture, Agricultural Research Service. FoodData Central. fdc.nal.usda.gov.', false,
   'https://fdc.nal.usda.gov/',
   'Carbohydrate stored as available (total carbohydrate by difference minus total dietary fibre) when both are known.'),
  ('cofid', 'McCance and Widdowson''s Composition of Foods Integrated Dataset (CoFID) 2021', 'Public Health England / Office for Health Improvement and Disparities',
   'Open Government Licence v3.0, except third-party material', 'https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/',
   'Contains public sector information licensed under the Open Government Licence v3.0. McCance and Widdowson''s Composition of Foods Integrated Dataset.', false,
   'https://www.gov.uk/government/publications/composition-of-foods-integrated-dataset-cofid',
   'Check the user guide for values supplied by third parties (for example manufacturers) before redistributing. Carbohydrate: available, as monosaccharide equivalent.'),
  ('off', 'Open Food Facts', 'Open Food Facts contributors',
   'Open Database License (ODbL) 1.0; contents DbCL 1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
   'Contains information from Open Food Facts (openfoodfacts.org), available under the Open Database License (ODbL).', true,
   'https://world.openfoodfacts.org/',
   'Crowd-sourced label data: quality "label", not verified by Rewired. A database derived from it must stay under ODbL; keep it separable.'),
  ('recipe', 'Recipes', 'Rewired Coaching and clients', 'Calculated from ingredient sources', null,
   'Calculated from the listed ingredients.', false, null, 'Nutrition is calculated from ingredients; imported recipes keep their original URL.'),
  ('coach', 'Coach entries', 'Rewired Coaching', 'Rewired Coaching', null, 'Entered by Rewired Coaching.', false, null, null),
  ('client', 'Client entries', 'Rewired clients', 'Client-entered', null, 'Self-reported by the client.', false, null, 'Values typed by a client are self-reported estimates.')
on conflict (id) do update set
  name = excluded.name, publisher = excluded.publisher, licence = excluded.licence, licence_url = excluded.licence_url,
  attribution = excluded.attribution, share_alike = excluded.share_alike, homepage = excluded.homepage,
  notes = excluded.notes, updated_at = now();

-- One row per food, normalised per 100 g (or per 100 mL when basis = 'mL').
-- quality: reference   = analysed composition table (AFCD, USDA, CoFID)
--          label       = manufacturer label data (Open Food Facts, coach typed from a label)
--          calculated  = worked out from ingredients (recipes)
--          estimate    = coach estimate
--          self_reported = typed by a client
create table if not exists public.foods (
  id              uuid primary key default gen_random_uuid(),
  source          text not null references public.food_sources (id),
  source_id       text not null default gen_random_uuid()::text check (length(source_id) between 1 and 80),
  source_version  text,
  source_url      text check (source_url is null or source_url ~ '^https?://'),
  name            text not null check (length(trim(name)) between 1 and 200),
  brand           text check (brand is null or length(brand) <= 120),
  barcode         text check (barcode is null or barcode ~ '^[0-9]{6,14}$'),
  countries       text[] not null default '{}',
  category        text check (category is null or length(category) <= 120),
  basis           text not null default 'g' check (basis in ('g', 'mL')),
  kcal            numeric(7, 2) check (kcal between 0 and 1000),
  protein_g       numeric(6, 2) check (protein_g between 0 and 100),
  carbs_g         numeric(6, 2) check (carbs_g between 0 and 130),  -- monosaccharide equivalents pass 100 for syrups
  fat_g           numeric(6, 2) check (fat_g between 0 and 100),
  fibre_g         numeric(6, 2) check (fibre_g between 0 and 100),
  sugars_g        numeric(6, 2) check (sugars_g between 0 and 100),
  sodium_mg       numeric(8, 2) check (sodium_mg between 0 and 100000),
  quality         text not null check (quality in ('reference', 'label', 'calculated', 'estimate', 'self_reported')),
  complete        boolean generated always as
                    (kcal is not null and protein_g is not null and carbs_g is not null and fat_g is not null) stored,
  portions        jsonb not null default '[]'::jsonb
                    check (jsonb_typeof(portions) = 'array' and jsonb_array_length(portions) <= 30),
  notes           jsonb check (notes is null or jsonb_typeof(notes) = 'object'),
  needs_review    boolean not null default false,
  shared          boolean not null default true,  -- false: only its creator and the coach see it
  created_by      uuid references public.profiles (id) on delete set null default auth.uid(),
  import_tag      text,
  last_seen_at    timestamptz,
  retired_at      timestamptz,
  search          tsvector generated always as
                    (to_tsvector('simple', coalesce(name, '') || ' ' || coalesce(brand, ''))) stored,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (source, source_id)
);
create index if not exists foods_search_idx on public.foods using gin (search);
create index if not exists foods_name_trgm_idx on public.foods using gin (name extensions.gin_trgm_ops);
create index if not exists foods_barcode_idx on public.foods (barcode) where barcode is not null;
create index if not exists foods_source_seen_idx on public.foods (source, last_seen_at);
create index if not exists foods_created_by_idx on public.foods (created_by) where not shared;

-- Large imports record their progress here so they can resume and refresh.
create table if not exists public.import_runs (
  id             bigint generated always as identity primary key,
  source         text not null references public.food_sources (id),
  tag            text not null unique,
  dataset        text,
  mode           text not null default 'full' check (mode in ('full', 'resume', 'sample')),
  status         text not null default 'running' check (status in ('running', 'done', 'failed')),
  cursor         jsonb,
  rows_upserted  int not null default 0,
  rows_retired   int not null default 0,
  error          text,
  started_at     timestamptz not null default now(),
  finished_at    timestamptz
);

-- ---------------------------------------------------------------------------
-- 3. Recipes (coach recipes for plans; client recipes for their own log)
-- ---------------------------------------------------------------------------

create table if not exists public.recipes (
  id               uuid primary key default gen_random_uuid(),
  owner_id         uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name             text not null check (length(trim(name)) between 1 and 120),
  servings         numeric(6, 2) not null default 1 check (servings > 0 and servings <= 200),
  cooked_weight_g  numeric(8, 1) check (cooked_weight_g is null or (cooked_weight_g > 0 and cooked_weight_g <= 50000)),
  notes            text check (notes is null or length(notes) <= 2000),
  source_url       text check (source_url is null or source_url ~ '^https?://'),
  source_name      text check (source_name is null or length(source_name) <= 200),
  source_author    text check (source_author is null or length(source_author) <= 200),
  imported_at      timestamptz,
  food_id          uuid unique references public.foods (id) on delete set null,
  shared           boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table if not exists public.recipe_items (
  id             uuid primary key default gen_random_uuid(),
  recipe_id      uuid not null references public.recipes (id) on delete cascade,
  position       int not null default 0,
  food_id        uuid not null references public.foods (id),
  amount         numeric(8, 2) not null check (amount > 0 and amount <= 20000),  -- g, or mL for mL foods
  original_text  text check (original_text is null or length(original_text) <= 300),
  prep           text check (prep is null or length(prep) <= 80),
  match          text not null default 'confirmed' check (match in ('confirmed', 'uncertain'))
);
create index if not exists recipe_items_recipe_idx on public.recipe_items (recipe_id, position);

-- ---------------------------------------------------------------------------
-- 4. Plan templates and versioned assignments
-- ---------------------------------------------------------------------------
-- A plan is JSON:
--   {"schedule": "daily" | "weekly",
--    "days": [{"day": "all" | "mon".."sun",
--              "meals": [{"id", "name", "time": "07:30", "note",
--                         "items": [{"id", "food_id", "amount", "portion": {"label", "count"}}]}]}]}
-- When saved, each item also gets a copy of the food's name, source, quality
-- and per-100 nutrition, so the plan reads the same forever.

create table if not exists public.plan_templates (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 120),
  notes        text check (notes is null or length(notes) <= 2000),
  plan         jsonb not null check (jsonb_typeof(plan) = 'object' and pg_column_size(plan) < 400000),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  archived_at  timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table if not exists public.plan_assignments (
  id           uuid primary key default gen_random_uuid(),
  client_id    uuid not null references public.profiles (id) on delete cascade,
  version      int not null check (version > 0),
  kind         text not null check (kind in ('meal_plan', 'macros')),
  name         text not null check (length(trim(name)) between 1 and 120),
  template_id  uuid references public.plan_templates (id) on delete set null,
  plan         jsonb check (plan is null or (jsonb_typeof(plan) = 'object' and pg_column_size(plan) < 400000)),
  protein_g    int check (protein_g between 0 and 600),
  carbs_g      int check (carbs_g between 0 and 1000),
  fats_g       int check (fats_g between 0 and 400),
  fibre_g      int check (fibre_g between 0 and 150),
  calories     int generated always as (protein_g * 4 + carbs_g * 4 + fats_g * 9 + coalesce(fibre_g, 0) * 2) stored,
  starts_on    date not null,
  ends_on      date,
  coach_note   text check (coach_note is null or length(coach_note) <= 1000),
  created_by   uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  unique (client_id, version),
  constraint plan_assignments_kind_plan check ((kind = 'meal_plan') = (plan is not null)),
  constraint plan_assignments_targets_together check
    ((protein_g is null) = (carbs_g is null) and (carbs_g is null) = (fats_g is null)),
  constraint plan_assignments_macros_need_targets check (kind = 'meal_plan' or protein_g is not null),
  -- ends_on = starts_on - 1 marks a version replaced before it began.
  constraint plan_assignments_dates check (ends_on is null or ends_on >= starts_on - 1)
);
create index if not exists plan_assignments_client_idx on public.plan_assignments (client_id, starts_on desc);

-- ---------------------------------------------------------------------------
-- 5. What the client actually ate
-- ---------------------------------------------------------------------------

-- One row per planned meal the client has dealt with on a day.
create table if not exists public.meal_logs (
  id             uuid primary key default gen_random_uuid(),
  client_id      uuid not null references public.profiles (id) on delete cascade,
  day            date not null,
  assignment_id  uuid not null references public.plan_assignments (id) on delete cascade,
  meal_id        text not null,
  meal_name      text not null,
  status         text not null check (status in ('as_planned', 'adjusted', 'replaced', 'skipped')),
  scope          text check (scope in ('food', 'meal')),  -- for "replaced": one food or the whole meal
  planned        jsonb not null,  -- copy of the planned meal at the time it was logged
  note           text check (note is null or length(note) <= 500),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (client_id, day, assignment_id, meal_id),
  constraint meal_logs_scope check ((status = 'replaced') = (scope is not null))
);
create index if not exists meal_logs_client_day_idx on public.meal_logs (client_id, day);

-- Every food the client ate, with its nutrition copied at logging time.
-- meal_log_id is null for extras, snacks and macro-only food logs.
create table if not exists public.food_log_entries (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  day              date not null,
  meal_log_id      uuid references public.meal_logs (id) on delete cascade,
  kind             text not null default 'extra' check (kind in ('planned', 'substitute', 'extra')),
  planned_item_id  text,  -- the planned item this row is (kind planned)
  replaces         text,  -- the planned item this food replaced (kind substitute)
  slot             text check (slot is null or length(slot) <= 40),
  food_id          uuid not null references public.foods (id),
  name             text not null,
  brand            text,
  source           text not null,
  quality          text not null,
  amount           numeric(8, 2) not null check (amount > 0 and amount <= 5000),
  unit             text not null check (unit in ('g', 'mL')),
  kcal_100         numeric(7, 2),
  protein_100      numeric(6, 2),
  carbs_100        numeric(6, 2),
  fat_100          numeric(6, 2),
  fibre_100        numeric(6, 2),
  kcal             numeric generated always as (round(kcal_100 * amount / 100, 1)) stored,
  protein_g        numeric generated always as (round(protein_100 * amount / 100, 1)) stored,
  carbs_g          numeric generated always as (round(carbs_100 * amount / 100, 1)) stored,
  fat_g            numeric generated always as (round(fat_100 * amount / 100, 1)) stored,
  fibre_g          numeric generated always as (round(fibre_100 * amount / 100, 1)) stored,
  needs_review     boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists food_log_entries_client_day_idx on public.food_log_entries (client_id, day);
create index if not exists food_log_entries_meal_idx on public.food_log_entries (meal_log_id);

-- ---------------------------------------------------------------------------
-- 6. Audit history
-- ---------------------------------------------------------------------------

create table if not exists public.audit_log (
  id          bigint generated always as identity primary key,
  at          timestamptz not null default now(),
  actor       uuid,
  table_name  text not null,
  row_id      text,
  client_id   uuid,
  action      text not null check (action in ('INSERT', 'UPDATE', 'DELETE')),
  old_row     jsonb,
  new_row     jsonb
);
create index if not exists audit_log_client_idx on public.audit_log (client_id, at desc);
create index if not exists audit_log_table_row_idx on public.audit_log (table_name, row_id);

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r jsonb := to_jsonb(coalesce(new, old));
begin
  -- Bulk food imports run without a signed-in user; they are tracked in
  -- import_runs instead of row by row.
  if tg_table_name = 'foods' and (select auth.uid()) is null then
    return null;
  end if;
  insert into public.audit_log (actor, table_name, row_id, client_id, action, old_row, new_row)
  values (
    (select auth.uid()), tg_table_name,
    coalesce(r ->> 'id', r ->> 'client_id', r ->> 'user_id'),
    coalesce(r ->> 'client_id', r ->> 'user_id')::uuid,
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return null;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Helpers
-- ---------------------------------------------------------------------------

-- Validates a plan and copies each food's nutrition into it.
create or replace function public.nutrition_plan_snapshot(p_plan jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  sched     text;
  d         jsonb;
  m         jsonb;
  it        jsonb;
  f         public.foods;
  day_key   text;
  amt       numeric;
  seen_days text[] := '{}';
  meal_ids  text[];
  item_ids  text[];
  out_days  jsonb := '[]'::jsonb;
  out_meals jsonb;
  out_items jsonb;
begin
  if p_plan is null or jsonb_typeof(p_plan) <> 'object' or jsonb_typeof(p_plan -> 'days') <> 'array' then
    raise exception 'A plan needs a list of days' using errcode = '22023';
  end if;
  sched := coalesce(p_plan ->> 'schedule', 'daily');
  if sched not in ('daily', 'weekly') then
    raise exception 'Plan schedule must be daily or weekly' using errcode = '22023';
  end if;
  if jsonb_array_length(p_plan -> 'days') not between 1 and 7 then
    raise exception 'A plan has between 1 and 7 days' using errcode = '22023';
  end if;

  for d in select value from jsonb_array_elements(p_plan -> 'days') loop
    day_key := d ->> 'day';
    if (sched = 'daily' and day_key is distinct from 'all')
       or (sched = 'weekly' and day_key not in ('mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun')) then
      raise exception 'Unknown plan day "%"', day_key using errcode = '22023';
    end if;
    if day_key = any (seen_days) then
      raise exception 'Day "%" appears twice', day_key using errcode = '22023';
    end if;
    seen_days := seen_days || day_key;
    if jsonb_typeof(d -> 'meals') <> 'array' or jsonb_array_length(d -> 'meals') > 12 then
      raise exception 'Each day has a list of up to 12 meals' using errcode = '22023';
    end if;

    meal_ids := '{}';
    out_meals := '[]'::jsonb;
    for m in select value from jsonb_array_elements(d -> 'meals') loop
      if coalesce(m ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$' or (m ->> 'id') = any (meal_ids) then
        raise exception 'Each meal needs its own id' using errcode = '22023';
      end if;
      meal_ids := meal_ids || (m ->> 'id');
      if length(trim(coalesce(m ->> 'name', ''))) not between 1 and 60 then
        raise exception 'Each meal needs a name' using errcode = '22023';
      end if;
      if m ->> 'time' is not null and (m ->> 'time') !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' then
        raise exception 'Meal time must look like 07:30' using errcode = '22023';
      end if;
      if jsonb_typeof(coalesce(m -> 'items', '[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(m -> 'items', '[]'::jsonb)) > 40 then
        raise exception 'A meal has up to 40 foods' using errcode = '22023';
      end if;

      item_ids := '{}';
      out_items := '[]'::jsonb;
      for it in select value from jsonb_array_elements(coalesce(m -> 'items', '[]'::jsonb)) loop
        if coalesce(it ->> 'id', '') !~ '^[A-Za-z0-9_-]{1,40}$' or (it ->> 'id') = any (item_ids) then
          raise exception 'Each food in a meal needs its own id' using errcode = '22023';
        end if;
        item_ids := item_ids || (it ->> 'id');
        begin
          amt := (it ->> 'amount')::numeric;
        exception when others then
          amt := null;
        end;
        if amt is null or amt <= 0 or amt > 5000 then
          raise exception 'Food amounts must be between 0 and 5000 g or mL' using errcode = '22023';
        end if;
        select * into f from public.foods
          where id = (case when (it ->> 'food_id') ~ '^[0-9a-fA-F-]{36}$' then (it ->> 'food_id')::uuid end)
            and retired_at is null;
        if not found then
          raise exception 'A food in this plan is no longer available' using errcode = '22023';
        end if;
        out_items := out_items || jsonb_build_object(
          'id', it ->> 'id', 'food_id', f.id, 'amount', amt, 'unit', f.basis,
          'name', f.name, 'brand', f.brand, 'source', f.source, 'quality', f.quality, 'complete', f.complete,
          'portion', case when jsonb_typeof(it -> 'portion') = 'object' then jsonb_build_object(
              'label', left(it -> 'portion' ->> 'label', 40),
              'count', case when (it -> 'portion' ->> 'count') ~ '^[0-9]+(\.[0-9]+)?$' then (it -> 'portion' ->> 'count')::numeric end)
            end,
          'per100', jsonb_build_object('kcal', f.kcal, 'p', f.protein_g, 'c', f.carbs_g, 'f', f.fat_g, 'fibre', f.fibre_g));
      end loop;

      out_meals := out_meals || jsonb_build_object(
        'id', m ->> 'id', 'name', trim(m ->> 'name'), 'time', m ->> 'time',
        'note', left(m ->> 'note', 300), 'items', out_items);
    end loop;
    out_days := out_days || jsonb_build_object('day', day_key, 'meals', out_meals);
  end loop;
  return jsonb_build_object('schedule', sched, 'days', out_days);
end;
$$;

-- The planned meal for one date, or null.
create or replace function public.plan_meal(p_plan jsonb, p_day date, p_meal_id text)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select m
  from jsonb_array_elements(p_plan -> 'days') d, jsonb_array_elements(d -> 'meals') m
  where d ->> 'day' = case when p_plan ->> 'schedule' = 'weekly'
                       then (array['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'])[extract(isodow from p_day)::int]
                       else 'all' end
    and m ->> 'id' = p_meal_id
  limit 1;
$$;

-- Copies the food log totals for one client and day into daily_logs, so the
-- dashboards, habit colours and check-ins keep working from one place.
create or replace function public.sync_daily_food(p_client uuid, p_day date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  n int; unknown int; k numeric; p numeric; c numeric; f numeric; fib numeric;
begin
  select count(*),
         count(*) filter (where kcal is null or protein_g is null or carbs_g is null or fat_g is null),
         sum(kcal), sum(protein_g), sum(carbs_g), sum(fat_g), sum(fibre_g)
    into n, unknown, k, p, c, f, fib
    from public.food_log_entries where client_id = p_client and day = p_day;
  if n = 0 then
    update public.daily_logs
       set calories = null, protein_g = null, carbs_g = null, fats_g = null, fibre_g = null,
           food_from_log = false, food_unknown_items = 0
     where user_id = p_client and day = p_day and food_from_log;
    return;
  end if;
  insert into public.daily_logs (user_id, day, calories, protein_g, carbs_g, fats_g, fibre_g, food_from_log, food_unknown_items)
  values (p_client, p_day, round(k), round(p), round(c), round(f), round(fib), true, unknown)
  on conflict (user_id, day) do update set
    calories = excluded.calories, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
    fats_g = excluded.fats_g, fibre_g = excluded.fibre_g,
    food_from_log = true, food_unknown_items = excluded.food_unknown_items;
end;
$$;
revoke execute on function public.sync_daily_food(uuid, date) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 8. Triggers
-- ---------------------------------------------------------------------------

drop trigger if exists touch_foods on public.foods;
create trigger touch_foods before update on public.foods
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_recipes on public.recipes;
create trigger touch_recipes before update on public.recipes
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_plan_templates on public.plan_templates;
create trigger touch_plan_templates before update on public.plan_templates
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_meal_logs on public.meal_logs;
create trigger touch_meal_logs before update on public.meal_logs
  for each row execute function public.touch_updated_at();
drop trigger if exists touch_food_log_entries on public.food_log_entries;
create trigger touch_food_log_entries before update on public.food_log_entries
  for each row execute function public.touch_updated_at();

-- Client-typed foods: anything left blank is flagged for the coach to review.
create or replace function public.guard_food()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.source = 'client' then
    new.shared := false;
  end if;
  if new.source = 'client'
     and (new.kcal is null or new.protein_g is null or new.carbs_g is null or new.fat_g is null) then
    new.needs_review := true;
  end if;
  if tg_op = 'UPDATE' and (new.source <> old.source or new.source_id <> old.source_id) then
    raise exception 'A food''s source cannot change' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_foods on public.foods;
create trigger guard_foods before insert or update on public.foods
  for each row execute function public.guard_food();

-- Keeps each recipe's food row (what plans and logs point at) in step with
-- its ingredients: totals, per 100 g of the finished dish, and a serving.
create or replace function public.sync_recipe_food(p_recipe uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.recipes;
  coach_owned boolean;
  total_amount numeric; weight numeric;
  k numeric; p numeric; c numeric; f numeric; fib numeric;
  n int; uncertain int; fid uuid;
begin
  select * into r from public.recipes where id = p_recipe;
  if not found then return; end if;
  select role = 'coach' into coach_owned from public.profiles where id = r.owner_id;

  -- A nutrient is known for the recipe only if it is known for every ingredient.
  select count(*), count(*) filter (where ri.match = 'uncertain'), sum(ri.amount),
         case when bool_and(fd.kcal is not null) then sum(fd.kcal * ri.amount / 100) end,
         case when bool_and(fd.protein_g is not null) then sum(fd.protein_g * ri.amount / 100) end,
         case when bool_and(fd.carbs_g is not null) then sum(fd.carbs_g * ri.amount / 100) end,
         case when bool_and(fd.fat_g is not null) then sum(fd.fat_g * ri.amount / 100) end,
         case when bool_and(fd.fibre_g is not null) then sum(fd.fibre_g * ri.amount / 100) end
    into n, uncertain, total_amount, k, p, c, f, fib
    from public.recipe_items ri join public.foods fd on fd.id = ri.food_id
   where ri.recipe_id = p_recipe;

  weight := coalesce(r.cooked_weight_g, total_amount);
  insert into public.foods (source, source_id, name, quality, basis, kcal, protein_g, carbs_g, fat_g, fibre_g,
                            portions, needs_review, shared, created_by, source_url, notes)
  values ('recipe', r.id::text, r.name, 'calculated', 'g',
          case when weight > 0 then round(k / weight * 100, 2) end,
          case when weight > 0 then round(p / weight * 100, 2) end,
          case when weight > 0 then round(c / weight * 100, 2) end,
          case when weight > 0 then round(f / weight * 100, 2) end,
          case when weight > 0 then round(fib / weight * 100, 2) end,
          case when weight > 0 then jsonb_build_array(jsonb_build_object('label', '1 serving', 'amount', round(weight / r.servings, 1))) else '[]'::jsonb end,
          n = 0 or uncertain > 0, coalesce(coach_owned, false), r.owner_id, r.source_url,
          jsonb_build_object('recipe_id', r.id, 'servings', r.servings, 'ingredient_weight_g', total_amount,
                             'cooked_weight_g', r.cooked_weight_g, 'ingredients', n))
  on conflict (source, source_id) do update set
    name = excluded.name, kcal = excluded.kcal, protein_g = excluded.protein_g, carbs_g = excluded.carbs_g,
    fat_g = excluded.fat_g, fibre_g = excluded.fibre_g, portions = excluded.portions,
    needs_review = excluded.needs_review, shared = excluded.shared, source_url = excluded.source_url,
    notes = excluded.notes
  returning id into fid;
  update public.recipes set food_id = fid, shared = coalesce(coach_owned, false)
   where id = p_recipe and (food_id is distinct from fid or shared is distinct from coalesce(coach_owned, false));
end;
$$;
revoke execute on function public.sync_recipe_food(uuid) from public, anon, authenticated;

create or replace function public.on_recipe_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_table_name = 'recipes' then
    if tg_op = 'UPDATE' and new.food_id is distinct from old.food_id and new.name = old.name
       and new.servings = old.servings and new.cooked_weight_g is not distinct from old.cooked_weight_g then
      return null;  -- the sync itself linking the food row
    end if;
    perform public.sync_recipe_food(new.id);
  else
    perform public.sync_recipe_food(coalesce(new.recipe_id, old.recipe_id));
    if tg_op = 'UPDATE' and new.recipe_id <> old.recipe_id then
      perform public.sync_recipe_food(old.recipe_id);
    end if;
  end if;
  return null;
end;
$$;
drop trigger if exists recipe_food_sync on public.recipes;
create trigger recipe_food_sync after insert or update on public.recipes
  for each row execute function public.on_recipe_change();
drop trigger if exists recipe_items_food_sync on public.recipe_items;
create trigger recipe_items_food_sync after insert or update or delete on public.recipe_items
  for each row execute function public.on_recipe_change();

-- A deleted recipe retires its food row instead of breaking old logs.
create or replace function public.on_recipe_delete()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.foods set retired_at = now() where id = old.food_id;
  return old;
end;
$$;
drop trigger if exists recipe_food_retire on public.recipes;
create trigger recipe_food_retire before delete on public.recipes
  for each row execute function public.on_recipe_delete();

-- Templates store the same food snapshot as assignments.
create or replace function public.guard_plan_template()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.plan := public.nutrition_plan_snapshot(new.plan);
  return new;
end;
$$;
drop trigger if exists guard_plan_templates on public.plan_templates;
create trigger guard_plan_templates before insert or update of plan on public.plan_templates
  for each row execute function public.guard_plan_template();

-- Assignments never change after saving, apart from the end date that the
-- next version sets.
create or replace function public.guard_plan_assignment()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- (calories is generated, so it is not yet filled in here.)
  if (to_jsonb(new) - 'ends_on' - 'calories') is distinct from (to_jsonb(old) - 'ends_on' - 'calories') then
    raise exception 'Plan assignments are versioned. Save a new version instead.' using errcode = '42501';
  end if;
  if old.ends_on is not null and new.ends_on > old.ends_on then
    raise exception 'An ended plan version cannot be reopened' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_plan_assignments on public.plan_assignments;
create trigger guard_plan_assignments before update on public.plan_assignments
  for each row execute function public.guard_plan_assignment();

-- Direct API writes to the food log are for extras only, and always copy the
-- food's own nutrition. Plan meals go through log_meal() (which runs as the
-- function owner, not as "authenticated").
create or replace function public.guard_food_log_entry()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  f public.foods;
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'UPDATE' then
    if old.meal_log_id is not null then
      raise exception 'Correct plan meals with the meal buttons' using errcode = '42501';
    end if;
    if new.client_id <> old.client_id or new.day <> old.day then
      raise exception 'A logged food cannot move to another day or person' using errcode = '42501';
    end if;
  end if;
  if new.meal_log_id is not null then
    raise exception 'Log plan meals with the meal buttons' using errcode = '42501';
  end if;
  if new.day > current_date + 1 then
    raise exception 'You cannot log food for a future day' using errcode = '22023';
  end if;
  new.kind := 'extra';
  new.planned_item_id := null;
  new.replaces := null;
  if tg_op = 'INSERT' or new.food_id <> old.food_id then
    select * into f from public.foods
      where id = new.food_id and retired_at is null and (shared or created_by = (select auth.uid()));
    if not found then
      raise exception 'Food not found' using errcode = '22023';
    end if;
    new.name := f.name; new.brand := f.brand; new.source := f.source; new.quality := f.quality; new.unit := f.basis;
    new.kcal_100 := f.kcal; new.protein_100 := f.protein_g; new.carbs_100 := f.carbs_g;
    new.fat_100 := f.fat_g; new.fibre_100 := f.fibre_g;
    new.needs_review := not f.complete or f.needs_review;
  else
    new.name := old.name; new.brand := old.brand; new.source := old.source; new.quality := old.quality;
    new.unit := old.unit; new.kcal_100 := old.kcal_100; new.protein_100 := old.protein_100;
    new.carbs_100 := old.carbs_100; new.fat_100 := old.fat_100; new.fibre_100 := old.fibre_100;
    new.needs_review := old.needs_review;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_food_log_entries on public.food_log_entries;
create trigger guard_food_log_entries before insert or update on public.food_log_entries
  for each row execute function public.guard_food_log_entry();

create or replace function public.on_food_log_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op <> 'INSERT' then
    perform public.sync_daily_food(old.client_id, old.day);
  end if;
  if tg_op <> 'DELETE' then
    perform public.sync_daily_food(new.client_id, new.day);
  end if;
  return null;
end;
$$;
drop trigger if exists food_log_daily_sync on public.food_log_entries;
create trigger food_log_daily_sync after insert or update or delete on public.food_log_entries
  for each row execute function public.on_food_log_change();

-- While a day's food comes from the food log, the check-in form cannot
-- overwrite those totals.
create or replace function public.guard_daily_food()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user <> 'authenticated' then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.food_from_log := false;
    new.food_unknown_items := 0;
  elsif old.food_from_log then
    new.calories := old.calories; new.protein_g := old.protein_g; new.carbs_g := old.carbs_g;
    new.fats_g := old.fats_g; new.fibre_g := old.fibre_g;
    new.food_from_log := true; new.food_unknown_items := old.food_unknown_items;
  else
    new.food_from_log := false;
    new.food_unknown_items := 0;
  end if;
  return new;
end;
$$;
drop trigger if exists guard_daily_food on public.daily_logs;
create trigger guard_daily_food before insert or update on public.daily_logs
  for each row execute function public.guard_daily_food();

-- Audit history: who changed plans, targets and logs, and what they were before.
drop trigger if exists audit_foods on public.foods;
create trigger audit_foods after insert or update or delete on public.foods
  for each row execute function public.audit_row();
drop trigger if exists audit_plan_templates on public.plan_templates;
create trigger audit_plan_templates after insert or update or delete on public.plan_templates
  for each row execute function public.audit_row();
drop trigger if exists audit_plan_assignments on public.plan_assignments;
create trigger audit_plan_assignments after insert or update or delete on public.plan_assignments
  for each row execute function public.audit_row();
drop trigger if exists audit_macro_targets on public.macro_targets;
create trigger audit_macro_targets after insert or update or delete on public.macro_targets
  for each row execute function public.audit_row();
drop trigger if exists audit_targets on public.targets;
create trigger audit_targets after update on public.targets
  for each row execute function public.audit_row();
drop trigger if exists audit_meal_logs on public.meal_logs;
create trigger audit_meal_logs after insert or update or delete on public.meal_logs
  for each row execute function public.audit_row();
drop trigger if exists audit_food_log_entries on public.food_log_entries;
create trigger audit_food_log_entries after insert or update or delete on public.food_log_entries
  for each row execute function public.audit_row();
drop trigger if exists audit_recipes on public.recipes;
create trigger audit_recipes after insert or update or delete on public.recipes
  for each row execute function public.audit_row();

-- ---------------------------------------------------------------------------
-- 9. Functions the app calls
-- ---------------------------------------------------------------------------

-- Food search across every source, local foods and verified data first.
create or replace function public.food_search(q text, country text default null, lim int default 25, sources text[] default null)
returns setof public.foods
language plpgsql
stable
set search_path = ''
set pg_trgm.word_similarity_threshold = 0.45  -- lets "chiken" find "chicken"
as $$
declare
  qn    text := lower(trim(coalesce(q, '')));
  words text[];
  tsq   tsquery;
begin
  if qn ~ '^[0-9]{8,14}$' then
    return query select * from public.foods f where f.barcode = qn and f.retired_at is null limit 5;
    return;
  end if;
  words := array(select w from (select regexp_replace(x, '[^[:alnum:]]', '', 'g') w
                                from unnest(regexp_split_to_array(qn, '\s+')) x) s where w <> '' limit 8);
  if coalesce(array_length(words, 1), 0) = 0 then
    return;
  end if;
  tsq := to_tsquery('simple', array_to_string(array(select w || ':*' from unnest(words) w), ' & '));
  return query
    select f.* from public.foods f
     where f.retired_at is null
       and (sources is null or f.source = any (sources))
       and (f.search @@ tsq or qn operator(extensions.<%) f.name)
     order by
       extensions.word_similarity(qn, f.name) * 0.6 + extensions.similarity(f.name, qn)
       + case when lower(f.name) like qn || '%' then 0.4 else 0 end
       + case when f.search @@ tsq then 0.3 else 0 end
       + case when country is not null and country = any (f.countries) then 0.6 else 0 end
       + case f.quality when 'reference' then 0.12 when 'calculated' then 0.1 when 'label' then 0.06 else 0 end
       + case when f.complete then 0.05 else -0.2 end
       desc,
       length(f.name), f.id
     limit least(greatest(coalesce(lim, 25), 1), 50);
end;
$$;

-- Coach: assign a meal plan or daily macro targets. Always makes a new version
-- that starts on p_starts_on and ends the version before it.
create or replace function public.assign_nutrition(
  p_client uuid, p_kind text, p_name text, p_starts_on date default current_date,
  p_plan jsonb default null, p_template uuid default null, p_targets jsonb default null, p_note text default null)
returns public.plan_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest public.plan_assignments;
  plan   jsonb;
  row    public.plan_assignments;
  t_p int; t_c int; t_f int; t_fib int;
begin
  if not public.is_coach() then
    raise exception 'Only the coach can assign plans' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_client and role = 'client') then
    raise exception 'Client not found' using errcode = '22023';
  end if;
  if p_kind not in ('meal_plan', 'macros') then
    raise exception 'Choose a meal plan or macro targets' using errcode = '22023';
  end if;
  p_starts_on := coalesce(p_starts_on, current_date);

  select * into latest from public.plan_assignments where client_id = p_client order by version desc limit 1;
  if found then
    if p_starts_on < latest.starts_on then
      raise exception 'A new version cannot start before the current one (%)', latest.starts_on using errcode = '22023';
    end if;
    if p_starts_on < current_date - 1 then
      raise exception 'A new version cannot start in the past; history stays as it was' using errcode = '22023';
    end if;
  end if;

  if p_kind = 'meal_plan' then
    if p_plan is null and p_template is not null then
      select t.plan into plan from public.plan_templates t where t.id = p_template;
      if plan is null then
        raise exception 'Template not found' using errcode = '22023';
      end if;
    else
      plan := p_plan;
    end if;
    plan := public.nutrition_plan_snapshot(plan);
  end if;

  if p_targets is not null and p_targets <> 'null'::jsonb then
    t_p := (p_targets ->> 'protein_g')::int;
    t_c := (p_targets ->> 'carbs_g')::int;
    t_f := (p_targets ->> 'fats_g')::int;
    t_fib := (p_targets ->> 'fibre_g')::int;
  end if;

  update public.plan_assignments
     set ends_on = greatest(p_starts_on - 1, starts_on - 1)
   where client_id = p_client and (ends_on is null or ends_on >= p_starts_on);

  insert into public.plan_assignments (client_id, version, kind, name, template_id, plan,
                                       protein_g, carbs_g, fats_g, fibre_g, starts_on, coach_note)
  values (p_client, coalesce(latest.version, 0) + 1, p_kind, coalesce(nullif(trim(p_name), ''), 'Nutrition plan'),
          case when p_kind = 'meal_plan' then p_template end, plan, t_p, t_c, t_f, t_fib, p_starts_on, p_note)
  returning * into row;
  return row;
end;
$$;

-- Coach: stop the current assignment (the client goes back to no plan).
create or replace function public.end_nutrition(p_client uuid, p_last_day date default current_date)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_coach() then
    raise exception 'Only the coach can end plans' using errcode = '42501';
  end if;
  if p_last_day < current_date - 1 then
    raise exception 'A plan cannot be ended in the past' using errcode = '22023';
  end if;
  update public.plan_assignments
     set ends_on = greatest(p_last_day, starts_on - 1)
   where client_id = p_client and (ends_on is null or ends_on > p_last_day);
end;
$$;

-- Client: record what happened with one planned meal. Calling it again for
-- the same meal and day replaces the earlier record, so nothing doubles up.
--   p_status 'as_planned' logs the planned foods and amounts.
--   p_status 'adjusted'   p_items = [{"planned_item_id", "amount"}]
--   p_status 'replaced'   p_items mixes planned items and
--                         [{"food_id", "amount", "replaces": planned item id or null}];
--                         p_scope 'food' (one food swapped) or 'meal' (whole meal).
--   p_status 'skipped'    nothing is added to intake.
create or replace function public.log_meal(
  p_day date, p_assignment uuid, p_meal_id text, p_status text,
  p_items jsonb default null, p_scope text default null, p_note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid    uuid := (select auth.uid());
  a      public.plan_assignments;
  meal   jsonb;
  log_id uuid;
  it     jsonb;
  pl     jsonb;
  f      public.foods;
  amt    numeric;
  used   text[] := '{}';
  planned_ids text[];
begin
  if uid is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select * into a from public.plan_assignments where id = p_assignment;
  if not found or a.client_id <> uid then
    raise exception 'That plan is not yours' using errcode = '42501';
  end if;
  if a.kind <> 'meal_plan' then
    raise exception 'This plan has no meals to log' using errcode = '22023';
  end if;
  if p_day < a.starts_on or (a.ends_on is not null and p_day > a.ends_on) then
    raise exception 'That plan was not active on this day' using errcode = '22023';
  end if;
  if p_day > current_date + 1 then
    raise exception 'You cannot log a future day' using errcode = '22023';
  end if;
  meal := public.plan_meal(a.plan, p_day, p_meal_id);
  if meal is null then
    raise exception 'That meal is not in your plan for this day' using errcode = '22023';
  end if;
  if p_status not in ('as_planned', 'adjusted', 'replaced', 'skipped') then
    raise exception 'Unknown meal status' using errcode = '22023';
  end if;
  if p_status = 'replaced' and coalesce(p_scope, '') not in ('food', 'meal') then
    raise exception 'Say whether you replaced one food or the whole meal' using errcode = '22023';
  end if;
  if p_status in ('adjusted', 'replaced') and (p_items is null or jsonb_typeof(p_items) <> 'array'
      or jsonb_array_length(p_items) not between 1 and 40) then
    raise exception 'Add what you ate' using errcode = '22023';
  end if;
  planned_ids := array(select x ->> 'id' from jsonb_array_elements(meal -> 'items') x);

  insert into public.meal_logs (client_id, day, assignment_id, meal_id, meal_name, status, scope, planned, note)
  values (uid, p_day, a.id, p_meal_id, meal ->> 'name', p_status,
          case when p_status = 'replaced' then p_scope end, meal, left(p_note, 500))
  on conflict (client_id, day, assignment_id, meal_id) do update set
    status = excluded.status, scope = excluded.scope, planned = excluded.planned, note = excluded.note
  returning id into log_id;

  delete from public.food_log_entries where meal_log_id = log_id;

  if p_status = 'as_planned' then
    insert into public.food_log_entries (client_id, day, meal_log_id, kind, planned_item_id, slot, food_id,
      name, brand, source, quality, amount, unit, kcal_100, protein_100, carbs_100, fat_100, fibre_100, needs_review)
    select uid, p_day, log_id, 'planned', x ->> 'id', meal ->> 'name', (x ->> 'food_id')::uuid,
           x ->> 'name', x ->> 'brand', x ->> 'source', x ->> 'quality', (x ->> 'amount')::numeric, x ->> 'unit',
           (x -> 'per100' ->> 'kcal')::numeric, (x -> 'per100' ->> 'p')::numeric, (x -> 'per100' ->> 'c')::numeric,
           (x -> 'per100' ->> 'f')::numeric, (x -> 'per100' ->> 'fibre')::numeric,
           not coalesce((x ->> 'complete')::boolean, false)
      from jsonb_array_elements(meal -> 'items') x;
  elsif p_status in ('adjusted', 'replaced') then
    for it in select value from jsonb_array_elements(p_items) loop
      begin
        amt := (it ->> 'amount')::numeric;
      exception when others then
        amt := null;
      end;
      if amt is null or amt <= 0 or amt > 5000 then
        raise exception 'Amounts must be between 0 and 5000 g or mL' using errcode = '22023';
      end if;
      if it ->> 'food_id' is not null then
        if p_status = 'adjusted' then
          raise exception 'Use "Ate something different" to swap a food' using errcode = '22023';
        end if;
        if it ->> 'replaces' is not null and not ((it ->> 'replaces') = any (planned_ids)) then
          raise exception 'Unknown planned food' using errcode = '22023';
        end if;
        select * into f from public.foods
          where id = case when (it ->> 'food_id') ~ '^[0-9a-fA-F-]{36}$' then (it ->> 'food_id')::uuid end
            and retired_at is null and (shared or created_by = uid);
        if not found then
          raise exception 'Food not found' using errcode = '22023';
        end if;
        insert into public.food_log_entries (client_id, day, meal_log_id, kind, replaces, slot, food_id,
          name, brand, source, quality, amount, unit, kcal_100, protein_100, carbs_100, fat_100, fibre_100, needs_review)
        values (uid, p_day, log_id, 'substitute', it ->> 'replaces', meal ->> 'name', f.id,
                f.name, f.brand, f.source, f.quality, amt, f.basis, f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.fibre_g,
                not f.complete or f.needs_review);
      else
        if (it ->> 'planned_item_id') = any (used) then
          raise exception 'Each planned food can be logged once per meal' using errcode = '22023';
        end if;
        select x into pl from jsonb_array_elements(meal -> 'items') x where x ->> 'id' = it ->> 'planned_item_id';
        if pl is null then
          raise exception 'Unknown planned food' using errcode = '22023';
        end if;
        used := used || (it ->> 'planned_item_id');
        insert into public.food_log_entries (client_id, day, meal_log_id, kind, planned_item_id, slot, food_id,
          name, brand, source, quality, amount, unit, kcal_100, protein_100, carbs_100, fat_100, fibre_100, needs_review)
        values (uid, p_day, log_id, 'planned', pl ->> 'id', meal ->> 'name', (pl ->> 'food_id')::uuid,
                pl ->> 'name', pl ->> 'brand', pl ->> 'source', pl ->> 'quality', amt, pl ->> 'unit',
                (pl -> 'per100' ->> 'kcal')::numeric, (pl -> 'per100' ->> 'p')::numeric, (pl -> 'per100' ->> 'c')::numeric,
                (pl -> 'per100' ->> 'f')::numeric, (pl -> 'per100' ->> 'fibre')::numeric,
                not coalesce((pl ->> 'complete')::boolean, false));
      end if;
    end loop;
  end if;
  return log_id;
end;
$$;

-- Client: undo a meal record. Its foods leave the day's intake.
create or replace function public.clear_meal_log(p_meal_log uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.meal_logs where id = p_meal_log and client_id = (select auth.uid());
  if not found then
    raise exception 'Meal record not found' using errcode = '22023';
  end if;
end;
$$;

revoke execute on function public.assign_nutrition(uuid, text, text, date, jsonb, uuid, jsonb, text) from public, anon;
revoke execute on function public.end_nutrition(uuid, date) from public, anon;
revoke execute on function public.log_meal(date, uuid, text, text, jsonb, text, text) from public, anon;
revoke execute on function public.clear_meal_log(uuid) from public, anon;
revoke execute on function public.food_search(text, text, int, text[]) from public, anon;
grant execute on function public.assign_nutrition(uuid, text, text, date, jsonb, uuid, jsonb, text) to authenticated;
grant execute on function public.end_nutrition(uuid, date) to authenticated;
grant execute on function public.log_meal(date, uuid, text, text, jsonb, text, text) to authenticated;
grant execute on function public.clear_meal_log(uuid) to authenticated;
grant execute on function public.food_search(text, text, int, text[]) to authenticated;

-- Day totals for the app and reports. Unknown values are counted, not zeroed.
create or replace view public.daily_food_totals with (security_invoker = true) as
  select client_id, day,
         count(*) as items,
         count(*) filter (where kcal is null or protein_g is null or carbs_g is null or fat_g is null) as unknown_items,
         count(*) filter (where quality = 'self_reported') as self_reported_items,
         sum(kcal) as kcal, sum(protein_g) as protein_g, sum(carbs_g) as carbs_g,
         sum(fat_g) as fat_g, sum(fibre_g) as fibre_g
    from public.food_log_entries
   group by client_id, day;

-- ---------------------------------------------------------------------------
-- 10. Who can do what
-- ---------------------------------------------------------------------------

revoke all on public.food_sources, public.foods, public.import_runs, public.recipes, public.recipe_items,
  public.plan_templates, public.plan_assignments, public.meal_logs, public.food_log_entries,
  public.audit_log, public.daily_food_totals from anon;
revoke all on public.food_sources, public.foods, public.import_runs, public.recipes, public.recipe_items,
  public.plan_templates, public.plan_assignments, public.meal_logs, public.food_log_entries,
  public.audit_log, public.daily_food_totals from authenticated;
grant select on public.food_sources, public.import_runs, public.plan_assignments, public.meal_logs,
  public.audit_log, public.daily_food_totals to authenticated;
grant select, insert on public.foods to authenticated;
grant update (name, brand, barcode, countries, category, basis, kcal, protein_g, carbs_g, fat_g, fibre_g,
  sugars_g, sodium_mg, quality, portions, notes, needs_review, retired_at) on public.foods to authenticated;
grant select, insert, delete on public.recipes to authenticated;
grant update (name, servings, cooked_weight_g, notes, source_url, source_name, source_author, imported_at)
  on public.recipes to authenticated;
grant select, insert, update, delete on public.recipe_items, public.plan_templates, public.food_log_entries
  to authenticated;
-- plan_assignments and meal_logs are read only from the API; the functions
-- above write them.

alter table public.food_sources     enable row level security;
alter table public.foods            enable row level security;
alter table public.import_runs      enable row level security;
alter table public.recipes          enable row level security;
alter table public.recipe_items     enable row level security;
alter table public.plan_templates   enable row level security;
alter table public.plan_assignments enable row level security;
alter table public.meal_logs        enable row level security;
alter table public.food_log_entries enable row level security;
alter table public.audit_log        enable row level security;

drop policy if exists "anyone signed in reads food sources" on public.food_sources;
create policy "anyone signed in reads food sources" on public.food_sources
  for select to authenticated using (true);

-- foods
drop policy if exists "read shared foods, own foods, or coach reads all" on public.foods;
create policy "read shared foods, own foods, or coach reads all" on public.foods
  for select to authenticated
  using (shared or created_by = (select auth.uid()) or (select public.is_coach()));
drop policy if exists "client adds own self-reported foods" on public.foods;
create policy "client adds own self-reported foods" on public.foods
  for insert to authenticated
  with check (source = 'client' and quality = 'self_reported' and not shared
              and created_by = (select auth.uid()) and not (select public.is_coach()));
drop policy if exists "coach adds coach foods" on public.foods;
create policy "coach adds coach foods" on public.foods
  for insert to authenticated
  with check ((select public.is_coach()) and source = 'coach' and quality in ('label', 'estimate') and shared);
drop policy if exists "client updates own foods" on public.foods;
create policy "client updates own foods" on public.foods
  for update to authenticated
  using (source = 'client' and created_by = (select auth.uid()))
  with check (source = 'client' and quality = 'self_reported' and not shared and created_by = (select auth.uid()));
drop policy if exists "coach reviews coach and client foods" on public.foods;
create policy "coach reviews coach and client foods" on public.foods
  for update to authenticated
  using ((select public.is_coach()) and source in ('coach', 'client'))
  with check ((select public.is_coach()) and source in ('coach', 'client') and quality in ('label', 'estimate', 'self_reported'));

drop policy if exists "coach reads import runs" on public.import_runs;
create policy "coach reads import runs" on public.import_runs
  for select to authenticated using ((select public.is_coach()));

-- recipes: owners write their own; coach recipes are visible to everyone
drop policy if exists "read own or coach recipes" on public.recipes;
create policy "read own or coach recipes" on public.recipes
  for select to authenticated
  using (owner_id = (select auth.uid()) or shared or (select public.is_coach()));
drop policy if exists "owner adds recipes" on public.recipes;
create policy "owner adds recipes" on public.recipes
  for insert to authenticated with check (owner_id = (select auth.uid()));
drop policy if exists "owner updates recipes" on public.recipes;
create policy "owner updates recipes" on public.recipes
  for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
drop policy if exists "owner deletes recipes" on public.recipes;
create policy "owner deletes recipes" on public.recipes
  for delete to authenticated using (owner_id = (select auth.uid()));

drop policy if exists "read items of visible recipes" on public.recipe_items;
create policy "read items of visible recipes" on public.recipe_items
  for select to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id));
drop policy if exists "owner adds recipe items" on public.recipe_items;
create policy "owner adds recipe items" on public.recipe_items
  for insert to authenticated
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid()))
              and exists (select 1 from public.foods f where f.id = food_id));
drop policy if exists "owner updates recipe items" on public.recipe_items;
create policy "owner updates recipe items" on public.recipe_items
  for update to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())))
  with check (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid()))
              and exists (select 1 from public.foods f where f.id = food_id));
drop policy if exists "owner deletes recipe items" on public.recipe_items;
create policy "owner deletes recipe items" on public.recipe_items
  for delete to authenticated
  using (exists (select 1 from public.recipes r where r.id = recipe_id and r.owner_id = (select auth.uid())));

-- plan_templates: the coach's library; clients never see templates
drop policy if exists "coach manages templates" on public.plan_templates;
create policy "coach manages templates" on public.plan_templates
  for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

-- plan_assignments and meal_logs: read only through the API
drop policy if exists "read own assignments or coach reads all" on public.plan_assignments;
create policy "read own assignments or coach reads all" on public.plan_assignments
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists "read own meal logs or coach reads all" on public.meal_logs;
create policy "read own meal logs or coach reads all" on public.meal_logs
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));

-- food_log_entries: the client owns their log; the coach reads it
drop policy if exists "read own food log or coach reads all" on public.food_log_entries;
create policy "read own food log or coach reads all" on public.food_log_entries
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists "client adds own extras" on public.food_log_entries;
create policy "client adds own extras" on public.food_log_entries
  for insert to authenticated
  with check (client_id = (select auth.uid()) and meal_log_id is null);
drop policy if exists "client corrects own extras" on public.food_log_entries;
create policy "client corrects own extras" on public.food_log_entries
  for update to authenticated
  using (client_id = (select auth.uid()) and meal_log_id is null)
  with check (client_id = (select auth.uid()) and meal_log_id is null);
drop policy if exists "client removes own extras" on public.food_log_entries;
create policy "client removes own extras" on public.food_log_entries
  for delete to authenticated
  using (client_id = (select auth.uid()) and meal_log_id is null);

drop policy if exists "read own history or coach reads all" on public.audit_log;
create policy "read own history or coach reads all" on public.audit_log
  for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));
