-- Security rule checks. Run after supabase_stub.sql and ../schema.sql on a scratch database.
-- Lines marked "expect ... error" should fail; that failure is the rule working.
\set ON_ERROR_STOP 0
insert into auth.users values ('00000000-0000-0000-0000-00000000000c','coach@x.com'),('00000000-0000-0000-0000-0000000000a1','a@x.com'),('00000000-0000-0000-0000-0000000000b2','b@x.com');
update public.profiles set role='coach' where email='coach@x.com';
select email, role from profiles order by email;
-- client A
set role authenticated; select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
insert into daily_logs(day, weight_kg, steps, trained) values ('2026-11-03', 82.4, 9000, 'Yes');
insert into daily_logs(user_id, day, weight_kg) values ('00000000-0000-0000-0000-0000000000b2','2026-11-03', 70); -- expect RLS error
update profiles set role='coach' where id=auth.uid(); -- expect permission denied
update profiles set full_name='Client A', start_date='2026-11-03' where id=auth.uid();
select count(*) as a_sees_profiles from profiles;
insert into weekly_checkins(week_number, energy, coach_feedback) values (1, 8, 'self praise');
select week_number, energy, coach_feedback as fb_should_be_null from weekly_checkins;
update targets set goal_weight_kg=75; -- expect 0 rows
insert into macro_targets(client_id, week_number, protein_g, carbs_g, fats_g) values (auth.uid(),1,180,200,70); -- expect RLS error
insert into progress_photos(week_number,pose,storage_path) values (0,'front','00000000-0000-0000-0000-0000000000a1/w0-front.jpg');
insert into progress_photos(week_number,pose,storage_path) values (0,'side','someone-else/w0-side.jpg'); -- expect RLS error
insert into storage.objects(bucket_id,name) values ('progress-photos','00000000-0000-0000-0000-0000000000a1/w0-front.jpg');
insert into storage.objects(bucket_id,name) values ('progress-photos','00000000-0000-0000-0000-0000000000b2/x.jpg'); -- expect RLS error
-- client B
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
select count(*) as b_sees_a_logs from daily_logs;
select count(*) as b_sees_objects from storage.objects;
update weekly_checkins set coach_feedback='hack'; select 'B updated rows above should be 0';
-- coach
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select count(*) as coach_sees_logs from daily_logs;
select count(*) as coach_sees_profiles from profiles;
update weekly_checkins set coach_feedback='Great week', energy=1 where week_number=1;
select energy as energy_still_8, coach_feedback from weekly_checkins;
update targets set goal_weight_kg=75, coach_note='Protein first' where client_id='00000000-0000-0000-0000-0000000000a1';
insert into macro_targets(client_id, week_number, protein_g, carbs_g, fats_g, fibre_g) values ('00000000-0000-0000-0000-0000000000a1',1,180,200,70,30);
select calories as cal_should_be_2210 from macro_targets;
update daily_logs set weight_kg=1; -- coach can't edit logs: 0 rows
select count(*) as coach_sees_objects from storage.objects;
-- client A edits checkin, feedback preserved
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
update weekly_checkins set energy=9, coach_feedback='overwrite' where week_number=1;
select energy as e9, coach_feedback as fb_great_week from weekly_checkins;
select calories from macro_targets;
reset role;
set role anon; select count(*) from daily_logs; -- expect permission denied
-- habit tracker
set role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000a1',false);
update daily_logs set water_l=2.5, sleep_h=7.5 where day='2026-11-03';
insert into client_habits(name, category, unit, target) values ('Read 10 pages','Mindset','pages',10);
insert into client_habits(user_id, name, category) values ('00000000-0000-0000-0000-0000000000b2','Sneaky','Mindset'); -- expect RLS error
insert into habit_entries(habit_id, day, value) select id, '2026-11-03', 8 from client_habits;
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-0000000000b2',false);
select count(*) as b_sees_a_habits from client_habits;
insert into habit_entries(habit_id, day, value) select id, '2026-11-04', 1 from client_habits; -- 0 rows (B can't see A's habit)
select set_config('request.jwt.claim.sub','00000000-0000-0000-0000-00000000000c',false);
select count(*) as coach_sees_habit_entries from habit_entries;
update client_habits set name='coach edit'; select 'coach habit update above should be 0 rows';
reset role;
-- Nutrition rules (foods, plans, food logs) are checked in nutrition_test.sql.
