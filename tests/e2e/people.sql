-- People for the browser tests: coach, client A (meal plan), client B (macros only).
insert into auth.users values
  ('00000000-0000-0000-0000-00000000000c', 'coaching@abheyrewired.com'),
  ('00000000-0000-0000-0000-0000000000a1', 'arjun@example.com'),
  ('00000000-0000-0000-0000-0000000000b2', 'bilal@example.com');
update public.profiles set role = 'coach', full_name = 'Abhey' where email = 'coaching@abheyrewired.com';
update public.profiles set full_name = 'Arjun Mehta', start_date = date_trunc('week', current_date)::date - 14,
  consent_at = now(), nutrition_tracking = 'Assigned meal plan', country = 'AU'
  where email = 'arjun@example.com';
update public.profiles set full_name = 'Bilal Khan', start_date = date_trunc('week', current_date)::date - 7,
  consent_at = now(), nutrition_tracking = 'Macro-based / Flexible', country = 'GB'
  where email = 'bilal@example.com';
insert into public.macro_targets (client_id, week_number, protein_g, carbs_g, fats_g, fibre_g) values
  ('00000000-0000-0000-0000-0000000000a1', 1, 170, 230, 70, 30),
  ('00000000-0000-0000-0000-0000000000b2', 1, 150, 200, 60, 30);
-- A paneer the sample data lacks, as the coach would add it from a label.
insert into public.foods (source, source_id, name, brand, countries, quality, kcal, protein_g, carbs_g, fat_g, fibre_g, portions, created_by)
values ('coach', 'paneer-e2e', 'Paneer, full fat', 'Test Dairy', '{AU}', 'label', 321, 21.4, 3.6, 25, 0,
        '[{"label":"1 cube","amount":25}]', '00000000-0000-0000-0000-00000000000c');
