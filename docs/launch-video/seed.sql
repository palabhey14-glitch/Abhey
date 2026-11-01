-- Example client data for the launch video (scratch e2e database only).
-- Client A becomes the demo client. All numbers are example data.
\set A '''00000000-0000-0000-0000-0000000000a1'''
\set C '''00000000-0000-0000-0000-00000000000c'''
update profiles set full_name = 'Abhey', start_date = current_date - 35, nutrition_tracking = 'Macro-based / Flexible',
  injuries = 'Left shoulder, impingement in 2024. No heavy overhead pressing for now.', diet_requirement = 'Halal',
  training_days_per_week = 5 where id = :A;
insert into targets (client_id, goal_weight_kg, steps_target, water_target, fibre_target_g, sleep_target_h, checkin_day, coach_note)
values (:A, 78, 10000, '3', 35, 8, 0, 'Strong week. Keep protein high on rest days and get to bed by 10:30.')
on conflict (client_id) do update set goal_weight_kg = excluded.goal_weight_kg, steps_target = excluded.steps_target, water_target = excluded.water_target,
  fibre_target_g = excluded.fibre_target_g, sleep_target_h = excluded.sleep_target_h, checkin_day = excluded.checkin_day, coach_note = excluded.coach_note;

delete from plan_assignments where client_id = :A;
insert into plan_assignments (client_id, version, kind, name, protein_g, carbs_g, fats_g, fibre_g, starts_on, created_by)
values (:A, 1, 'macros', 'Recomp macros', 180, 240, 70, 35, current_date - 35, :C);

-- Training, Push day today (cycle day 1), shoulder-friendly swaps from the coach.
delete from training_plan where client_id = :A;
insert into training_plan (client_id, program_start_date, cycle_day, program_name, session_name, is_rest_day, exercises, session_note)
select :A, current_date - 35, d, 'Recomp block 2',
  (array['Push','Pull','Legs','Rest','Upper','Lower','Rest'])[d], d in (4,7),
  case d
    when 1 then '[{"name":"Incline dumbbell press","sets":4,"reps_min":6,"reps_max":10,"rir":true,"rir_target":2,"rest_seconds_min":120},
                  {"name":"Landmine press","sets":3,"reps_min":8,"reps_max":12,"rir":true,"rir_target":2,"rest_seconds_min":90,"note":"Swapped in for overhead press while the shoulder settles"},
                  {"name":"Cable fly","sets":3,"reps_min":12,"reps_max":15,"rir":true,"rir_target":1,"rest_seconds_min":60},
                  {"name":"Lateral raise","sets":4,"reps_min":12,"reps_max":20,"rir":true,"rir_target":1,"rest_seconds_min":60},
                  {"name":"Triceps pushdown","sets":3,"reps_min":10,"reps_max":15,"rir":true,"rir_target":1,"rest_seconds_min":60}]'
    when 2 then '[{"name":"Chest supported row","sets":4,"reps_min":8,"reps_max":12,"rir":true,"rir_target":2,"rest_seconds_min":90},{"name":"Lat pulldown","sets":3,"reps_min":8,"reps_max":12,"rir":true,"rir_target":2,"rest_seconds_min":90},{"name":"Face pull","sets":3,"reps_min":15,"reps_max":20,"rir":true,"rir_target":1,"rest_seconds_min":60},{"name":"Incline curl","sets":3,"reps_min":10,"reps_max":15,"rir":true,"rir_target":1,"rest_seconds_min":60}]'
    when 3 then '[{"name":"Hack squat","sets":4,"reps_min":6,"reps_max":10,"rir":true,"rir_target":2,"rest_seconds_min":150},{"name":"Romanian deadlift","sets":3,"reps_min":8,"reps_max":10,"rir":true,"rir_target":2,"rest_seconds_min":120},{"name":"Leg extension","sets":3,"reps_min":12,"reps_max":15,"rir":true,"rir_target":1,"rest_seconds_min":60},{"name":"Seated calf raise","sets":4,"reps_min":10,"reps_max":15,"rir":true,"rir_target":1,"rest_seconds_min":60}]'
    when 5 then '[{"name":"Flat dumbbell press","sets":3,"reps_min":8,"reps_max":12,"rir":true,"rir_target":2,"rest_seconds_min":90},{"name":"Seated cable row","sets":3,"reps_min":8,"reps_max":12,"rir":true,"rir_target":2,"rest_seconds_min":90}]'
    when 6 then '[{"name":"Leg press","sets":4,"reps_min":8,"reps_max":12,"rir":true,"rir_target":2,"rest_seconds_min":120},{"name":"Lying leg curl","sets":3,"reps_min":10,"reps_max":15,"rir":true,"rir_target":1,"rest_seconds_min":60}]'
    else '[]' end::jsonb,
  case d when 1 then 'Shoulder check. If anything pinches on the landmine press, drop the weight and keep the reps.' end
from generate_series(1,7) d;

-- 21 days of logs: weight drifting down, steps, sleep with device detail.
delete from daily_logs where user_id = :A;
insert into daily_logs (user_id, day, weight_kg, steps, trained, protein_g, carbs_g, fats_g, fibre_g, calories, water_l,
  sleep_h, sleep_bedtime, sleep_core_min, sleep_rem_min, sleep_deep_min, sleep_awake_min, sleep_latency_min, sleep_efficiency_pct,
  sleep_restfulness_pct, sleep_score, sleep_interruptions, sleep_rhr_bpm, sleep_hrv_ms)
select :A, current_date - i,
  round((84.6 - (21 - i) * 0.11 + sin(i) * 0.25)::numeric, 1),
  8200 + ((i * 1373) % 4100),
  case when (i % 7) in (3, 6) then 'Rest day' else 'Yes' end,
  172 + (i % 5) * 3, 225 + (i % 4) * 9, 64 + (i % 3) * 4, 31 + (i % 4), 2240 + (i % 5) * 30, 2.8 + (i % 3) * 0.2,
  round((7.2 + ((i * 7) % 9) / 10.0)::numeric, 1), ('22:' || lpad(((i * 11) % 50)::text, 2, '0'))::time,
  250 + (i % 5) * 6, 98 + (i % 4) * 5, 72 + (i % 3) * 6, 18 + (i % 4) * 3, 9 + (i % 5), 91 + (i % 4), 88 + (i % 5),
  82 + (i % 9), i % 3, 54 + (i % 4), 61 + (i % 6) * 1.5
from generate_series(1, 21) i;
-- Today so far
insert into daily_logs (user_id, day, weight_kg, steps, sleep_h, sleep_bedtime, sleep_core_min, sleep_rem_min, sleep_deep_min, sleep_awake_min,
  sleep_score, sleep_efficiency_pct, sleep_restfulness_pct, sleep_latency_min, sleep_interruptions, sleep_rhr_bpm, sleep_hrv_ms, water_l)
values (:A, current_date, 82.2, 7420, 7.8, '22:20', 262, 112, 84, 20, 88, 94, 91, 8, 1, 53, 68.5, 1.9);

-- Health markers
delete from health_marker_readings where user_id = :A;
insert into health_marker_readings (user_id, day, taken_at, marker, value, secondary_value)
select :A, current_date - i * 3, '07:15', 'blood_pressure', 124 - i, 79 - (i % 3) from generate_series(0, 6) i;
insert into health_marker_readings (user_id, day, taken_at, marker, value)
select :A, current_date - i * 3, '07:10', 'resting_heart_rate', 58 - (6 - i) / 2 + (i % 2) from generate_series(0, 6) i;

-- Habits
delete from habit_entries where user_id = :A; delete from client_habits where user_id = :A;

-- Messages
delete from messages where client_id = :A;
insert into messages (client_id, sender_id, body, created_at, read_at) values
 (:A, :A, 'Shoulder felt fine on the landmine press today. Hit 4 x 10 on incline at 30s.', now() - interval '50 minutes', now() - interval '40 minutes'),
 (:A, :C, 'Good. That''s 2 reps up on last week. Keep the landmine at that weight one more week, then we add 2.5.', now() - interval '35 minutes', null);

-- Food you grew up on, added by the coach from a recipe, then today's log.
delete from food_log_entries where client_id = :A;
delete from foods where source_id in ('lv-biryani', 'lv-dal');
insert into foods (source, source_id, name, brand, countries, quality, kcal, protein_g, carbs_g, fat_g, fibre_g, created_by) values
 ('coach', 'lv-biryani', 'Chicken biryani, homemade', null, '{AU}', 'calculated', 168, 11.2, 19.5, 4.8, 1.1, :C),
 ('coach', 'lv-dal', 'Dal tadka, homemade', null, '{AU}', 'calculated', 118, 6.9, 15.2, 3.3, 4.6, :C);
insert into food_log_entries (client_id, day, kind, slot, food_id, name, source, quality, amount, unit, kcal_100, protein_100, carbs_100, fat_100, fibre_100)
select :A, current_date, 'extra', s.slot, f.id, f.name, f.source, f.quality, s.amount, 'g', f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.fibre_g
from (values ('Breakfast', 'Oats, rolled, uncooked', 70), ('Breakfast', 'Protein powder, whey based, protein >70%, unfortified', 35),
             ('Breakfast', 'Banana, cavendish, peeled, raw', 120), ('Lunch', 'Chicken biryani, homemade', 380),
             ('Lunch', 'Dal tadka, homemade', 200), ('Snack', 'Greek Yogurt Nonfat Plain', 250)) s(slot, food, amount)
join lateral (select * from foods where name = s.food limit 1) f on true;
insert into food_log_entries (client_id, day, kind, slot, food_id, name, source, quality, amount, unit, kcal_100, protein_100, carbs_100, fat_100, fibre_100)
select :A, current_date, 'extra', s.slot, f.id, f.name, f.source, f.quality, s.amount, 'g', f.kcal, f.protein_g, f.carbs_g, f.fat_g, f.fibre_g
from (values ('Dinner', 'Chicken, breast, lean flesh, grilled, no added fat', 200), ('Dinner', 'Coconut Basmati Rice', 200),
             ('Dinner', 'Dal tadka, homemade', 200), ('Dinner', 'Paneer, full fat', 40)) s(slot, food, amount)
join lateral (select * from foods where name = s.food limit 1) f on true;
update daily_logs set steps = 10840, water_l = 3.2, trained = 'Yes' where user_id = :A and day = current_date;
delete from client_workout_sessions where user_id = :A;
insert into health_marker_readings (user_id, day, taken_at, marker, value) values
 (:A, current_date, '07:05', 'heart_rate', 62), (:A, current_date, '07:05', 'hrv', 68.5), (:A, current_date, '07:20', 'blood_glucose', 4.9);
insert into health_marker_readings (user_id, day, taken_at, marker, value) values (:A, current_date, '07:12', 'resting_heart_rate', 53)
  on conflict do nothing;
