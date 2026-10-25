-- Nutrition rules: run after supabase_stub.sql, ../schema.sql, the habits
-- migration and the nutrition migration, on a scratch database:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/nutrition_test.sql
-- Every check raises an error when a rule is broken, so the script stops at
-- the first failure. The last line prints NUTRITION TESTS PASSED.
\set ON_ERROR_STOP 1
\set QUIET 1
\o /dev/null

create schema if not exists test;
grant usage on schema test to authenticated;
create or replace function test.login(uid uuid) returns void language sql as
  $$ select set_config('request.jwt.claim.sub', uid::text, false) $$;
-- Runs a statement that must fail (optionally with a matching message).
create or replace function test.fails(stmt text, pattern text default null) returns void language plpgsql as $$
begin
  execute stmt;
  raise exception 'EXPECTED FAILURE, but it worked: %', stmt;
exception when others then
  if sqlerrm like 'EXPECTED FAILURE%' then raise; end if;
  if pattern is not null and sqlerrm !~* pattern then
    raise exception 'Wrong error for %: %', stmt, sqlerrm;
  end if;
end $$;
-- Runs a statement and returns how many rows it touched.
create or replace function test.touched(stmt text) returns int language plpgsql as $$
declare n int;
begin
  execute stmt;
  get diagnostics n = row_count;
  return n;
end $$;
create or replace function test.eq(got anyelement, want anyelement, what text) returns void language plpgsql as $$
begin
  if got is distinct from want then
    raise exception 'FAILED %: got %, want %', what, got, want;
  end if;
end $$;
grant execute on all functions in schema test to authenticated;

-- People: coach, client A, client B
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000c', 'coach@x.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'a@x.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'b@x.com');
update public.profiles set role = 'coach' where email = 'coach@x.com';

-- Reference foods, loaded the way an importer would (no signed-in user).
-- Values per 100 g, chosen so the sums are easy to check by hand.
insert into public.foods (id, source, source_id, name, countries, quality, kcal, protein_g, carbs_g, fat_g, fibre_g) values
  ('10000000-0000-0000-0000-000000000001', 'afcd', 'F-OATS',  'Oats, rolled, uncooked',          '{AU}', 'reference', 380, 13, 60, 7, 10),
  ('10000000-0000-0000-0000-000000000002', 'afcd', 'F-MILK',  'Milk, cow, fluid, regular fat',   '{AU}', 'reference', 65, 3.4, 4.8, 3.5, 0),
  ('10000000-0000-0000-0000-000000000003', 'afcd', 'F-RICE',  'Rice, white, boiled',             '{AU}', 'reference', 130, 2.7, 28, 0.3, 0.4),
  ('10000000-0000-0000-0000-000000000004', 'afcd', 'F-CHKN',  'Chicken, breast, lean, grilled',  '{AU}', 'reference', 165, 31, 0, 3.6, 0),
  ('10000000-0000-0000-0000-000000000005', 'cofid', '50-123', 'Dal, red lentil, cooked',         '{GB}', 'reference', 116, 9, 20, 0.4, 8),
  ('10000000-0000-0000-0000-000000000006', 'cofid', '11-456', 'Chapati, made with fat',          '{GB}', 'reference', 300, 9, 50, 8, 7),
  ('10000000-0000-0000-0000-000000000007', 'off', '9300000000017', 'Margherita pizza',          '{AU}', 'label', 260, 11, 30, 10, null),
  ('10000000-0000-0000-0000-000000000008', 'usda', '173944', 'Bananas, raw',                     '{US}', 'reference', 95, 1.2, 20, 0.3, 2.6),
  ('10000000-0000-0000-0000-000000000009', 'off', '9300000000024', 'Protein bar, choc',          '{AU}', 'label', 400, null, null, 15, null),
  ('10000000-0000-0000-0000-000000000010', 'usda', '168880', 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', '{US}', 'reference', 165, 31, 0, 3.6, 0);
update public.foods set barcode = source_id where source = 'off';

-- ---------------------------------------------------------------- food search
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000a1');
select test.eq((select name from public.food_search('chicken breast', 'AU', 5) limit 1), 'Chicken, breast, lean, grilled', 'AU client sees the Australian chicken first');
select test.eq((select name from public.food_search('chicken breast', 'US', 5) limit 1), 'Chicken, broilers or fryers, breast, meat only, cooked, roasted', 'US client sees the USDA chicken first');
select test.eq((select count(*)::int from public.food_search('chiken', 'AU', 5)) > 0, true, 'search tolerates a typo');
select test.eq((select name from public.food_search('9300000000017')), 'Margherita pizza', 'barcode lookup');
select test.eq((select count(*)::int from public.food_search('', 'AU', 5)), 0, 'empty search returns nothing');

-- ---------------------------------------------------------------- foods: who can add what
select test.fails($$insert into public.foods (source, name, quality, kcal) values ('afcd', 'Fake', 'reference', 1)$$, 'row-level security');
insert into public.foods (source, name, quality, kcal, shared) values ('client', 'Tries to share', 'self_reported', 1, true);
select test.eq((select shared from public.foods where name = 'Tries to share'), false, 'client foods are always private');
select test.eq(test.touched($$update public.foods set name = 'hacked' where source = 'afcd'$$), 0, 'client cannot edit reference foods');
-- A typed food with missing values is flagged for review, never zeroed
insert into public.foods (id, source, name, quality, kcal)
values ('20000000-0000-0000-0000-0000000000a1', 'client', 'Aunty''s laddoo', 'self_reported', 180);
select test.eq((select needs_review from public.foods where id = '20000000-0000-0000-0000-0000000000a1'), true, 'incomplete client food flagged');
select test.eq((select protein_g from public.foods where id = '20000000-0000-0000-0000-0000000000a1'), null::numeric, 'missing protein stays unknown');
select test.login('00000000-0000-0000-0000-0000000000b2');
select test.eq((select count(*)::int from public.foods where id = '20000000-0000-0000-0000-0000000000a1'), 0, 'B cannot see A''s typed food');
select test.eq((select count(*)::int from public.food_search('laddoo', 'AU', 5)), 0, 'B cannot find A''s typed food');

-- ---------------------------------------------------------------- coach: template and assignment
select test.login('00000000-0000-0000-0000-00000000000c');
insert into public.plan_templates (id, name, plan) values ('30000000-0000-0000-0000-000000000001', 'Recomp 2200', $${
  "schedule": "daily",
  "days": [{"day": "all", "meals": [
    {"id": "b", "name": "Breakfast", "time": "07:30", "items": [
      {"id": "b1", "food_id": "10000000-0000-0000-0000-000000000001", "amount": 80},
      {"id": "b2", "food_id": "10000000-0000-0000-0000-000000000002", "amount": 250}]},
    {"id": "l", "name": "Lunch", "time": "13:00", "items": [
      {"id": "l1", "food_id": "10000000-0000-0000-0000-000000000003", "amount": 200},
      {"id": "l2", "food_id": "10000000-0000-0000-0000-000000000004", "amount": 150},
      {"id": "l3", "food_id": "10000000-0000-0000-0000-000000000005", "amount": 150, "portion": {"label": "1 katori", "count": 1}}]}]}]}$$);
select test.eq((select (plan #>> '{days,0,meals,0,items,0,per100,kcal}')::numeric from public.plan_templates), 380::numeric, 'template copies food nutrition');
select test.fails($$insert into public.plan_templates (name, plan) values ('Bad', '{"schedule":"daily","days":[{"day":"all","meals":[{"id":"x","name":"X","items":[{"id":"i","food_id":"10000000-0000-0000-0000-000000000001","amount":-5}]}]}]}')$$, 'between 0 and 5000');

select test.eq((public.assign_nutrition('00000000-0000-0000-0000-0000000000a1', 'meal_plan', 'Recomp 2200',
  current_date - 3, null, '30000000-0000-0000-0000-000000000001', '{"protein_g": 180, "carbs_g": 220, "fats_g": 70, "fibre_g": 30}')).version, 1, 'first version');
select test.eq((select calories from public.plan_assignments where version = 1), 180 * 4 + 220 * 4 + 70 * 9 + 30 * 2, 'target calories');
-- Macro targets only, no meal plan, for client B
select test.eq((public.assign_nutrition('00000000-0000-0000-0000-0000000000b2', 'macros', 'Flexible macros',
  current_date - 3, null, null, '{"protein_g": 160, "carbs_g": 250, "fats_g": 65}')).kind, 'macros', 'macro-only assignment');
select test.fails($$select public.assign_nutrition('00000000-0000-0000-0000-0000000000b2', 'macros', 'No numbers', current_date)$$, 'check constraint');

-- Even the coach cannot edit a saved version through the API
select test.fails($$update public.plan_assignments set name = 'edited'$$, 'permission denied');
select test.fails($$delete from public.plan_assignments$$, 'permission denied');
reset role;
select test.fails($$update public.plan_assignments set plan = '{}' where version = 1$$, 'versioned');

-- ---------------------------------------------------------------- client: sees but cannot edit
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000a1');
select test.eq((select count(*)::int from public.plan_assignments), 1, 'A sees only their own assignment');
select test.eq((select count(*)::int from public.plan_templates), 0, 'clients never see templates');
select test.fails($$update public.plan_assignments set name = 'mine now'$$, 'permission denied');
select test.fails($$insert into public.plan_assignments (client_id, version, kind, name, starts_on, protein_g, carbs_g, fats_g) values (auth.uid(), 9, 'macros', 'x', current_date, 1, 1, 1)$$, 'permission denied');
select test.fails($$select public.assign_nutrition(auth.uid(), 'macros', 'Self', current_date, null, null, '{"protein_g":1,"carbs_g":1,"fats_g":1}')$$, 'only the coach');
select test.eq(test.touched($$update public.macro_targets set protein_g = 1$$), 0, 'client cannot change macro targets');
select test.fails($$insert into public.meal_logs (client_id, day, assignment_id, meal_id, meal_name, status, planned) select auth.uid(), current_date, id, 'b', 'Breakfast', 'as_planned', '{}' from public.plan_assignments$$, 'permission denied');

create temp table plan_before as select plan from public.plan_assignments;
reset role;
select id as a1_id from public.plan_assignments where client_id = '00000000-0000-0000-0000-0000000000a1' \gset
set role authenticated;
create or replace function pg_temp.a1() returns uuid language sql as $$ select id from public.plan_assignments where client_id = '00000000-0000-0000-0000-0000000000a1' and version = 1 $$;
create or replace function pg_temp.day_kcal(d date) returns numeric language sql as $$ select coalesce(sum(kcal), 0) from public.food_log_entries where day = d $$;

-- 1. Ate as planned: adds the planned foods exactly once
select public.log_meal(current_date, pg_temp.a1(), 'b', 'as_planned');
select public.log_meal(current_date, pg_temp.a1(), 'b', 'as_planned');
select test.eq((select count(*)::int from public.food_log_entries where day = current_date), 2, 'as planned logs each planned food once');
select test.eq(pg_temp.day_kcal(current_date), 466.5, 'breakfast kcal = 80 g oats (304) + 250 g milk (162.5)');
select test.eq((select calories from public.daily_logs where day = current_date), 467, 'daily totals synced');
select test.eq((select protein_g from public.daily_logs where day = current_date), 19, 'daily protein synced (10.4 + 8.5)');

-- 2. Ate a different amount: portion changes, plan does not
select public.log_meal(current_date, pg_temp.a1(), 'b', 'adjusted', '[{"planned_item_id": "b1", "amount": 100}, {"planned_item_id": "b2", "amount": 250}]');
select test.eq(pg_temp.day_kcal(current_date), 542.5, 'breakfast with 100 g oats');
select test.fails($$select public.log_meal(current_date, pg_temp.a1(), 'b', 'adjusted', '[{"planned_item_id": "b1", "amount": 100}, {"planned_item_id": "b1", "amount": 50}]')$$, 'once per meal');

-- 3. Replaced one food: rice swapped for chapati, the rest as planned
select public.log_meal(current_date, pg_temp.a1(), 'l', 'replaced', $$[
  {"food_id": "10000000-0000-0000-0000-000000000006", "amount": 120, "replaces": "l1"},
  {"planned_item_id": "l2", "amount": 150},
  {"planned_item_id": "l3", "amount": 150}]$$, 'food');
-- 120 g chapati 360 + 150 g chicken 247.5 + 150 g dal 174 = 781.5
select test.eq(pg_temp.day_kcal(current_date), 542.5 + 781.5, 'lunch with chapati instead of rice');
select test.eq((select replaces from public.food_log_entries where kind = 'substitute'), 'l1', 'substitute remembers what it replaced');

-- 4. Replaced the whole meal with pizza
select public.log_meal(current_date, pg_temp.a1(), 'l', 'replaced', '[{"food_id": "10000000-0000-0000-0000-000000000007", "amount": 300}]', 'meal');
select test.eq(pg_temp.day_kcal(current_date), 542.5 + 780, 'whole lunch replaced by 300 g pizza');
select test.eq((select count(*)::int from public.food_log_entries where day = current_date), 3, 'no leftovers from the earlier lunch record');
select test.eq((select sum(fibre_g) from public.food_log_entries where day = current_date and source = 'off'), null::numeric, 'pizza fibre unknown, not zero');

-- 5. Skipped lunch: nothing planned is added
select public.log_meal(current_date, pg_temp.a1(), 'l', 'skipped');
select test.eq(pg_temp.day_kcal(current_date), 542.5, 'skipped lunch adds nothing');
select test.eq((select status from public.meal_logs where meal_id = 'l' and day = current_date), 'skipped', 'skip recorded');

-- 6. Undo: the lunch record goes; breakfast stays
select public.clear_meal_log((select id from public.meal_logs where meal_id = 'l' and day = current_date));
select test.eq((select count(*)::int from public.meal_logs where day = current_date), 1, 'undo removes the meal record');
select test.eq((select calories from public.daily_logs where day = current_date), 543, 'daily total after undo');

-- Meal and plan rules
select test.fails($$select public.log_meal(current_date, pg_temp.a1(), 'dinner', 'as_planned')$$, 'not in your plan');
select test.fails($$select public.log_meal(current_date - 10, pg_temp.a1(), 'b', 'as_planned')$$, 'not active');
select test.fails($$select public.log_meal(current_date + 5, pg_temp.a1(), 'b', 'as_planned')$$);
select test.fails($$select public.log_meal(current_date, pg_temp.a1(), 'l', 'replaced', '[{"food_id": "10000000-0000-0000-0000-000000000007", "amount": 300}]')$$, 'one food or the whole meal');
select test.fails($$select public.log_meal(current_date, pg_temp.a1(), 'l', 'adjusted', '[{"food_id": "10000000-0000-0000-0000-000000000007", "amount": 300}]')$$, 'something different');
select test.fails($$select public.log_meal(current_date, pg_temp.a1(), 'l', 'replaced', '[{"food_id": "20000000-0000-0000-0000-0000000000b2", "amount": 30}]', 'meal')$$, 'food not found');
-- Plan meals cannot be edited around the meal buttons
select test.eq(test.touched($$update public.food_log_entries set amount = 1 where meal_log_id is not null$$), 0, 'plan meal foods cannot be edited directly');
select test.eq(test.touched($$delete from public.food_log_entries where meal_log_id is not null$$), 0, 'plan meal foods cannot be deleted directly');
select test.fails($$insert into public.food_log_entries (day, food_id, amount, meal_log_id) select current_date, '10000000-0000-0000-0000-000000000001', 50, id from public.meal_logs limit 1$$);

-- 7. Extras outside the plan; nutrition always comes from the food row
insert into public.food_log_entries (id, day, food_id, amount, slot, kcal_100, protein_100)
values ('40000000-0000-0000-0000-000000000001', current_date, '10000000-0000-0000-0000-000000000008', 120, 'Snack', 0, 99);
select test.eq((select kcal from public.food_log_entries where id = '40000000-0000-0000-0000-000000000001'), 114.0, 'extra banana uses the food''s own numbers');
select test.eq((select calories from public.daily_logs where day = current_date), 657, 'extras count toward the day');
update public.food_log_entries set amount = 200 where id = '40000000-0000-0000-0000-000000000001';
select test.eq((select calories from public.daily_logs where day = current_date), 733, 'correcting an extra updates the day');
delete from public.food_log_entries where id = '40000000-0000-0000-0000-000000000001';
select test.eq((select calories from public.daily_logs where day = current_date), 543, 'deleting an extra updates the day');

-- 8. A typed food with unknown values: counted as unknown, not as zero
insert into public.food_log_entries (day, food_id, amount, slot) values (current_date, '20000000-0000-0000-0000-0000000000a1', 50, 'Snack');
select test.eq((select food_unknown_items from public.daily_logs where day = current_date), 1, 'unknown item counted');
select test.eq((select unknown_items from public.daily_food_totals where day = current_date), 1::bigint, 'totals view flags unknown item');
select test.eq((select quality from public.food_log_entries where food_id = '20000000-0000-0000-0000-0000000000a1'), 'self_reported', 'typed values labelled self-reported');
select test.eq((select needs_review from public.food_log_entries where food_id = '20000000-0000-0000-0000-0000000000a1'), true, 'entry flagged for review');

-- The check-in form cannot overwrite food-log totals
insert into public.daily_logs (user_id, day, calories, steps) values (auth.uid(), current_date, 9999, 8000)
  on conflict (user_id, day) do update set calories = excluded.calories, steps = excluded.steps;
select test.eq((select calories from public.daily_logs where day = current_date), 633, 'food-log calories kept (543 + 90 laddoo)');
select test.eq((select steps from public.daily_logs where day = current_date), 8000, 'other check-in numbers still save');

-- The plan itself never changed
select test.eq((select plan from public.plan_assignments where id = pg_temp.a1()), (select plan from plan_before), 'assigned plan untouched by logging');

-- 9. Client B cannot touch A's records
reset role;
select id as a_meal from public.meal_logs limit 1 \gset
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000b2');
select test.eq((select count(*)::int from public.food_log_entries), 0, 'B sees none of A''s food log');
select test.eq((select count(*)::int from public.meal_logs), 0, 'B sees none of A''s meal logs');
select test.fails(format('select public.log_meal(current_date, %L, %L, %L)', :'a1_id', 'b', 'skipped'), 'not yours');
select test.fails($$insert into public.food_log_entries (client_id, day, food_id, amount) values ('00000000-0000-0000-0000-0000000000a1', current_date, '10000000-0000-0000-0000-000000000008', 100)$$, 'row-level security');
select test.eq(test.touched($$update public.food_log_entries set amount = 1$$), 0, 'B cannot correct A''s log');
select test.eq(test.touched($$delete from public.food_log_entries$$), 0, 'B cannot delete A''s log');
select test.fails(format('select public.clear_meal_log(%L)', :'a_meal'), 'not found');
-- B (macros only) keeps a normal food log with no plan
insert into public.food_log_entries (day, food_id, amount, slot) values (current_date, '10000000-0000-0000-0000-000000000003', 250, 'Lunch');
select test.eq((select calories from public.daily_logs where day = current_date), 325, 'macro-only client logs food without a plan');
select test.fails($$select public.log_meal(current_date, id, 'b', 'as_planned') from public.plan_assignments$$, 'no meals');

-- ---------------------------------------------------------------- coach edits keep history
select test.login('00000000-0000-0000-0000-00000000000c');
select test.eq((select count(*)::int from public.food_log_entries), 4, 'coach reads every client''s food log');
select test.eq(test.touched($$update public.food_log_entries set amount = 1$$), 0, 'coach cannot edit a client''s food log');
select test.fails(format('select public.log_meal(current_date, %L, %L, %L)', :'a1_id', 'b', 'skipped'), 'not yours');
select test.fails($$select public.assign_nutrition('00000000-0000-0000-0000-0000000000a1', 'macros', 'Backdated', current_date - 7, null, null, '{"protein_g":1,"carbs_g":1,"fats_g":1}')$$, 'cannot start');
-- New version from tomorrow: macro targets only
select test.eq((public.assign_nutrition('00000000-0000-0000-0000-0000000000a1', 'macros', 'Diet break', current_date + 1,
  null, null, '{"protein_g": 170, "carbs_g": 260, "fats_g": 75}')).version, 2, 'second version');
select test.eq((select ends_on from public.plan_assignments where version = 1 and client_id = '00000000-0000-0000-0000-0000000000a1'), current_date, 'version 1 ends today');
-- Template edits do not reach the assigned copy
update public.plan_templates set plan = jsonb_set(plan, '{days,0,meals,0,items,0,amount}', '500');
-- A food refresh from the importer does not change what was already logged
reset role;
update public.foods set kcal = 999 where id = '10000000-0000-0000-0000-000000000001';
set role authenticated;
select test.login('00000000-0000-0000-0000-0000000000a1');
select test.eq((select plan #>> '{days,0,meals,0,items,0,amount}' from public.plan_assignments where id = pg_temp.a1()), '80', 'assigned copy keeps 80 g');
select test.eq((select kcal from public.food_log_entries where planned_item_id = 'b1'), 380.0, 'logged oats keep the values they were logged with');
select test.eq((select count(*)::int from public.plan_assignments), 2, 'A sees both versions');
select test.fails($$select public.log_meal(current_date + 1, pg_temp.a1(), 'b', 'as_planned')$$, 'not active');
select test.eq((select count(*)::int from public.audit_log where table_name = 'plan_assignments'), 3, 'history has v1, v1 ending, v2');
select test.eq((select count(*)::int from public.audit_log where client_id <> auth.uid()), 0, 'A sees only their own history');

-- ---------------------------------------------------------------- recipes
select test.login('00000000-0000-0000-0000-00000000000c');
insert into public.recipes (id, name, servings, cooked_weight_g, source_url, source_name)
values ('50000000-0000-0000-0000-000000000001', 'Chicken rice bowl', 2, 500, 'https://example.com/bowl', 'Example Kitchen');
insert into public.recipe_items (recipe_id, food_id, amount, original_text) values
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 300, '300 g cooked rice'),
  ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000004', 250, '250g chicken breast');
-- 300 g rice 390 kcal + 250 g chicken 412.5 = 802.5 kcal in 500 g cooked = 160.5 per 100 g
select test.eq((select kcal from public.foods where source = 'recipe'), 160.50, 'recipe per 100 g of the finished dish');
select test.eq((select portions #>> '{0,amount}' from public.foods where source = 'recipe'), '250.0', 'one serving = 500 g / 2');
select test.eq((select shared from public.foods where source = 'recipe'), true, 'coach recipes are shared');
-- An ingredient with unknown protein makes the recipe's protein unknown
insert into public.recipe_items (recipe_id, food_id, amount, match) values ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000009', 40, 'uncertain');
select test.eq((select protein_g from public.foods where source = 'recipe'), null::numeric, 'unknown ingredient protein -> unknown recipe protein');
select test.eq((select needs_review from public.foods where source = 'recipe'), true, 'uncertain match flags the recipe');
delete from public.recipe_items where match = 'uncertain';
select test.eq((select protein_g from public.foods where source = 'recipe'), 17.12, 'recipe recalculated (8.1 g + 77.5 g protein in 500 g) after removing the item');

select test.login('00000000-0000-0000-0000-0000000000a1');
select test.eq((select name from public.food_search('chicken rice bowl', 'AU', 5) limit 1), 'Chicken rice bowl', 'client finds coach recipe');
select test.eq(test.touched($$update public.recipes set name = 'mine' where id = '50000000-0000-0000-0000-000000000001'$$), 0, 'client cannot edit coach recipe');
select test.eq(test.touched($$delete from public.recipe_items where recipe_id = '50000000-0000-0000-0000-000000000001'$$), 0, 'client cannot change coach recipe items');
-- Client's own replacement recipe
insert into public.recipes (id, name, servings) values ('50000000-0000-0000-0000-0000000000a1', 'Mum''s rajma', 4);
insert into public.recipe_items (recipe_id, food_id, amount) values ('50000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-000000000005', 800);
select test.eq((select shared from public.foods where source_id = '50000000-0000-0000-0000-0000000000a1'), false, 'client recipe is private');
select test.login('00000000-0000-0000-0000-0000000000b2');
select test.eq((select count(*)::int from public.recipes where id = '50000000-0000-0000-0000-0000000000a1'), 0, 'B cannot see A''s recipe');

reset role;
\o
select 'NUTRITION TESTS PASSED' as result;
