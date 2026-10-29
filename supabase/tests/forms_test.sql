-- Forms: versions, permissions and submission rules.
-- Run on a scratch database after supabase_stub.sql, ../schema.sql and
-- ../migrations/2026-10-29-forms.sql:
--   psql -v ON_ERROR_STOP=1 -f supabase/tests/forms_test.sql
-- Every check is an assert; the script stops at the first one that fails
-- and prints "forms tests passed" at the end.

insert into auth.users values
  ('10000000-0000-0000-0000-00000000000c', 'coach@forms.test'),
  ('10000000-0000-0000-0000-0000000000c2', 'other-coach@forms.test'),
  ('10000000-0000-0000-0000-0000000000a1', 'a@forms.test'),
  ('10000000-0000-0000-0000-0000000000b2', 'b@forms.test');
update public.profiles set role = 'coach' where email in ('coach@forms.test', 'other-coach@forms.test');

create function pg_temp.as_user(uid text) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid, false), set_config('role', 'authenticated', false);
$$;
create function pg_temp.fails(stmt text) returns boolean language plpgsql as $$
begin
  execute stmt;
  return false;
exception when others then
  return true;
end $$;

-- A valid two-section draft and an invalid one.
create temp table fx as select
  '{"welcome":{"enabled":true,"title":"Hi","text":"","button":"Start"},
    "sections":[
      {"id":"s1","title":"Goals","questions":[
        {"id":"q1","type":"multi","label":"Main goals?","required":true,
         "options":[{"id":"o1","label":"Lose fat"},{"id":"o2","label":"Build muscle"}],"allowOther":true},
        {"id":"q2","type":"yesno","label":"Trained before?","required":true}]},
      {"id":"s2","title":"Body","questions":[
        {"id":"q3","type":"number","label":"Weight (kg)","required":false,"min":30,"max":300}]}],
    "thanks":{"title":"Thanks","text":"Done"}}'::jsonb as good,
  '{"sections":[{"id":"s1","title":"Goals","questions":[
      {"id":"q1","type":"single","label":"","required":true,"options":[{"id":"o1","label":"Only one"}]}]},
     {"id":"s2","title":"Empty","questions":[]}]}'::jsonb as bad;
grant select on fx to authenticated;

-- ------------------------------------------------ the coach builds a form
select pg_temp.as_user('10000000-0000-0000-0000-00000000000c');
insert into forms (name, category, tags, draft) select 'Onboarding', 'Onboarding', '{new, New , vip}', bad from fx;
do $$ begin
  assert (select tags from forms where name = 'Onboarding') = '{new,vip}', 'tags are trimmed and de-duplicated';
  assert (select draft_rev from forms where name = 'Onboarding') = 0, 'new form starts at rev 0';
end $$;
do $$ begin
  assert pg_temp.fails($q$ insert into forms (name, category) values ('X', 'Nutrition') $q$), 'only the five categories';
  assert pg_temp.fails($q$ select publish_form((select id from forms where name = 'Onboarding'), 0) $q$),
    'an invalid draft cannot be published';
  assert cardinality(form_content_problems((select bad from fx))) >= 3, 'empty label, one option and empty section are all reported';
  assert cardinality(form_content_problems((select good from fx))) = 0, 'the good draft has no problems';
end $$;
update forms set draft = (select good from fx), draft_rev = 1 where name = 'Onboarding';
do $$ begin
  -- a late save carrying an older rev must not overwrite newer work
  assert pg_temp.fails($q$ update forms set draft = '{"sections":[]}', draft_rev = 1 where name = 'Onboarding' $q$),
    'stale draft save is refused';
  assert pg_temp.fails($q$ update forms set published_rev = 5 where name = 'Onboarding' $q$),
    'the browser cannot fake a publish';
  assert pg_temp.fails($q$ select publish_form((select id from forms where name = 'Onboarding'), 0) $q$),
    'publishing an older rev than the saved one is refused';
end $$;
select version as v1 from publish_form((select id from forms where name = 'Onboarding'), 1);
do $$ begin
  assert (select version from publish_form((select id from forms where name = 'Onboarding'), 1)) = 1,
    'publishing again without changes reuses the version';
  assert (select count(*) from form_versions) = 1, 'one version so far';
  assert pg_temp.fails($q$ update form_versions set content = '{}' $q$), 'versions are read-only';
  assert pg_temp.fails($q$ insert into form_assignments (form_id, version_id, client_id)
    select f.id, f.published_version_id, '10000000-0000-0000-0000-0000000000a1' from forms f $q$),
    'assignments only go through assign_form';
  assert pg_temp.fails($q$ select assign_form((select id from forms where name = 'Onboarding'),
    array['10000000-0000-0000-0000-0000000000c2']::uuid[]) $q$), 'a coach is not a client';
end $$;

-- send to A, then again: no duplicate open copy
select count(*) filter (where created) as sent from assign_form((select id from forms), array['10000000-0000-0000-0000-0000000000a1']::uuid[]);
do $$ begin
  assert (select count(*) filter (where created) from assign_form((select id from forms),
    array['10000000-0000-0000-0000-0000000000a1', '10000000-0000-0000-0000-0000000000b2']::uuid[])) = 1,
    'A is skipped (already open), B is sent';
  assert (select count(*) from form_assignments) = 2, 'one open copy each for A and B';
  assert (select status from form_assignments where client_id = '10000000-0000-0000-0000-0000000000a1') = 'not_started', 'not started yet';
end $$;

-- the coach edits and republishes: A keeps version 1
update forms set draft = jsonb_set(draft, '{sections,0,questions,0,label}', '"What are your goals now?"'), draft_rev = 2;
select version as v2 from publish_form((select id from forms), 2);
do $$ begin
  assert (select v.version from form_assignments a join form_versions v on v.id = a.version_id
          where a.client_id = '10000000-0000-0000-0000-0000000000a1') = 1, 'A still has version 1 after the edit';
  assert (select content #>> '{sections,0,questions,0,label}' from form_versions where version = 1) = 'Main goals?',
    'version 1 keeps its original wording';
end $$;

-- ------------------------------------------------ another coach sees nothing
select pg_temp.as_user('10000000-0000-0000-0000-0000000000c2');
do $$ begin
  assert (select count(*) from forms) = 0, 'other coach cannot see the form';
  assert (select count(*) from form_versions) = 0, 'or its versions';
  assert (select count(*) from form_assignments) = 0, 'or its assignments';
  assert pg_temp.fails($q$ select publish_form('00000000-0000-0000-0000-000000000000', 0) $q$), 'cannot publish unknown form';
end $$;
select pg_temp.as_user('10000000-0000-0000-0000-00000000000c');
create temp table ids as select id as form_id from forms;
grant select on ids to authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-0000000000c2');
do $$ begin
  assert pg_temp.fails($q$ select assign_form((select form_id from ids), array['10000000-0000-0000-0000-0000000000a1']::uuid[]) $q$),
    'other coach cannot send it';
  assert pg_temp.fails($q$ select publish_form((select form_id from ids), 2) $q$), 'or publish it';
end $$;
update forms set name = 'hijack';  -- 0 rows under RLS
delete from forms;

-- ------------------------------------------------ client A fills it in
select pg_temp.as_user('10000000-0000-0000-0000-0000000000a1');
create temp table mine as select id from form_assignments;
do $$ begin
  assert (select count(*) from forms) = 0, 'clients never read the coach''s forms table';
  assert (select count(*) from form_assignments) = 1, 'A sees only their own assignment';
  assert (select count(*) from form_versions) = 1, 'A sees only the version they were sent';
  assert (select version from form_versions) = 1, 'and it is version 1';
  assert pg_temp.fails($q$ update form_responses set answers = '{"q1":["o1"]}' $q$), 'answers only change through save';
end $$;
select save_form_answers((select id from mine), '{"q1":["o1"],"junk":"x","q1.other":"Sleep"}', 2);
do $$ begin
  assert (select answers from form_responses) = '{"q1":["o1"],"q1.other":"Sleep"}', 'unknown keys are dropped, Other text kept';
  assert (save_form_answers((select id from mine), '{}', 1)) ->> 'ignored' = 'true', 'an older save is ignored';
  assert (select answers from form_responses) ? 'q1', 'and did not wipe the answers';
  assert (select status from form_assignments) = 'in_progress', 'now in progress';
  assert pg_temp.fails($q$ select submit_form_assignment((select id from mine), '{"q1":["o1"]}', 3) $q$),
    'cannot submit without the required yes/no';
end $$;

-- ------------------------------------------------ coach: progress, no answers yet
select pg_temp.as_user('10000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from form_responses) = 0, 'coach cannot read unsubmitted answers';
  assert (select status from form_assignments where client_id = '10000000-0000-0000-0000-0000000000a1') = 'in_progress',
    'but sees the progress status';
end $$;

-- ------------------------------------------------ B cannot touch A's form
select pg_temp.as_user('10000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from form_responses where client_id = '10000000-0000-0000-0000-0000000000a1') = 0, 'B cannot read A''s answers';
  assert pg_temp.fails($q$ select save_form_answers((select id from mine), '{"q2":false}', 9) $q$), 'B cannot save into A''s form';
  assert pg_temp.fails($q$ select submit_form_assignment((select id from mine), '{"q1":["o1"],"q2":false}', 9) $q$), 'or submit it';
end $$;

-- ------------------------------------------------ A submits (No is an answer)
select pg_temp.as_user('10000000-0000-0000-0000-0000000000a1');
select submit_form_assignment((select id from mine), '{"q1":["o1"],"q2":false}', 3);
do $$ begin
  assert (submit_form_assignment((select id from mine), '{}', 4)) ->> 'already' = 'true', 'a second submit changes nothing';
  assert (select answers from form_responses) = '{"q1":["o1"],"q2":false}', 'answers from the first submit stand';
  assert (select status from form_assignments) = 'completed', 'completed';
  assert pg_temp.fails($q$ select save_form_answers((select id from mine), '{"q2":true}', 10) $q$), 'no edits after submitting';
end $$;

-- ------------------------------------------------ coach reviews, archives
select pg_temp.as_user('10000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select answers ->> 'q2' from form_responses) = 'false', 'coach reads the submitted answers, explicit No kept';
  assert (select v.content #>> '{sections,0,questions,0,label}' from form_assignments a
          join form_versions v on v.id = a.version_id where a.client_id = '10000000-0000-0000-0000-0000000000a1') = 'Main goals?',
    'review uses the wording A answered';
  assert pg_temp.fails($q$ select cancel_form_assignment((select id from mine)) $q$), 'a completed form cannot be withdrawn';
end $$;
select cancel_form_assignment(id) from form_assignments where client_id = '10000000-0000-0000-0000-0000000000b2';
delete from forms;  -- published: protected
do $$ begin
  assert (select count(*) from forms) = 1, 'a published form cannot be deleted';
end $$;
update forms set archived_at = now();
do $$ begin
  assert (select count(*) from form_assignments) = 2, 'archiving keeps assignments';
  assert (select count(*) from form_responses) = 1, 'and submitted answers';
  assert pg_temp.fails($q$ select assign_form((select id from forms), array['10000000-0000-0000-0000-0000000000b2']::uuid[]) $q$),
    'an archived form cannot be sent';
end $$;

-- ------------------------------------------------ marking reviewed
select pg_temp.as_user('10000000-0000-0000-0000-0000000000c2');
do $$ begin
  assert pg_temp.fails($q$ select mark_form_reviewed((select id from form_assignments where submitted_at is not null limit 1), true) $q$),
    'another coach cannot mark it reviewed';
end $$;
select pg_temp.as_user('10000000-0000-0000-0000-00000000000c');
select mark_form_reviewed(id, true) from form_assignments where submitted_at is not null;
do $$ begin
  assert (select reviewed_at from form_assignments where submitted_at is not null) is not null, 'coach marks a submitted form reviewed';
  assert pg_temp.fails($q$ update form_assignments set reviewed_at = now() $q$)
      or (select count(*) from form_assignments where reviewed_at is not null) = 1, 'reviewed_at only changes through the function';
end $$;

-- ------------------------------------------------ once per client, new types, file ownership
insert into forms (name, category, answer_limit, draft) values ('Agreement', 'Contract', 'once',
  '{"sections":[{"id":"s1","title":"Agreement","questions":[
     {"id":"i1","type":"info","label":"Read this","text":"Hello"},
     {"id":"t1","type":"terms","label":"Coaching agreement","terms":"Be nice.","required":true},
     {"id":"g1","type":"signature","label":"Sign","statement":"I agree.","required":true,"mode":"type"},
     {"id":"d1","type":"dropdown","label":"Pick","required":true,"options":[{"id":"x","label":"X"},{"id":"y","label":"Y"}]},
     {"id":"m1","type":"measurement","label":"Weight","unit":"kg","min":30,"max":300,"required":true},
     {"id":"h1","type":"time","label":"Wake time","required":true},
     {"id":"f1","type":"file","label":"Bloods","maxFiles":1,"required":false}]}]}');
select publish_form(id, 0) from forms where name = 'Agreement';
select assign_form((select id from forms where name = 'Agreement'), array['10000000-0000-0000-0000-0000000000a1']::uuid[]);
create temp table agr as select a.id from form_assignments a join forms f on f.id = a.form_id where f.name = 'Agreement';
grant select on agr to authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert pg_temp.fails($q$ select submit_form_assignment((select id from agr),
    '{"t1":{"agreed":true},"g1":{"agreed":true,"name":"A"},"d1":"x","m1":80,"h1":"06:30"}', 1) $q$), 'a one-letter typed signature is refused';
  assert pg_temp.fails($q$ select submit_form_assignment((select id from agr),
    '{"t1":{"agreed":true},"g1":{"agreed":true,"name":"Arjun Mehta"},"d1":"zzz","m1":80,"h1":"06:30"}', 1) $q$), 'a dropdown answer must be one of its options';
  assert pg_temp.fails($q$ select submit_form_assignment((select id from agr),
    '{"t1":{"agreed":true},"g1":{"agreed":true,"name":"Arjun Mehta"},"d1":"x","m1":500,"h1":"06:30"}', 1) $q$), 'measurement range is checked';
  assert pg_temp.fails($q$ select submit_form_assignment((select id from agr),
    '{"t1":{"agreed":true},"g1":{"agreed":true,"name":"Arjun Mehta"},"d1":"x","m1":80,"h1":"6.30"}', 1) $q$), 'time format is checked';
  assert pg_temp.fails($q$ select submit_form_assignment((select id from agr),
    '{"t1":{"agreed":true},"g1":{"agreed":true,"name":"Arjun Mehta"},"d1":"x","m1":80,"h1":"06:30","f1":[{"path":"10000000-0000-0000-0000-0000000000b2/x/y.pdf","name":"y.pdf"}]}', 1) $q$),
    'a file from someone else''s folder is refused';
  assert pg_temp.fails($q$ select submit_form_assignment((select id from agr),
    '{"g1":{"agreed":true,"name":"Arjun Mehta"},"d1":"x","m1":80,"h1":"06:30"}', 1) $q$), 'the terms must be agreed to';
end $$;
select submit_form_assignment((select id from agr),
  '{"t1":{"agreed":true},"g1":{"agreed":true,"name":"Arjun Mehta"},"d1":"x","m1":80,"h1":"06:30"}', 1);
select pg_temp.as_user('10000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select bool_and(not created) from assign_form((select id from forms where name = 'Agreement'),
          array['10000000-0000-0000-0000-0000000000a1']::uuid[])), 'once per client: no second copy after submitting';
  assert (select count(*) from form_assignments a join forms f on f.id = a.form_id where f.name = 'Agreement') = 1, 'still one copy';
end $$;
update forms set answer_limit = 'every' where name = 'Agreement';
do $$ begin
  assert (select bool_and(created) from assign_form((select id from forms where name = 'Agreement'),
          array['10000000-0000-0000-0000-0000000000a1']::uuid[])), 'every time: a new copy can be sent';
end $$;

-- ------------------------------------------------ rules, follow-ups, flags and past dates
do $$ begin
  assert cardinality(form_content_problems('{"sections":[{"id":"s1","title":"A","questions":[
     {"id":"q2","type":"long","label":"More","showIf":{"q":"q1","is":"yes"}},
     {"id":"q1","type":"yesno","label":"Yes?"}]}]}')) = 1, 'a follow-up must come after the answer it follows';
  assert cardinality(form_content_problems('{"sections":[{"id":"s1","title":"A","questions":[
     {"id":"q1","type":"yesno","label":"Yes?"},
     {"id":"q2","type":"long","label":"More","showIf":{"q":"q1","is":"maybe"}}]}]}')) = 1, 'a rule must name a real answer';
  assert cardinality(form_content_problems('{"sections":[{"id":"s1","title":"A","questions":[
     {"id":"q1","type":"yesno","label":"Yes?"},
     {"id":"q2","type":"long","label":"More","showIf":{"q":"q1","is":"yes"}},
     {"id":"q3","type":"long","label":"Even more","showIf":{"q":"q2","is":"yes"}}]}]}')) = 1, 'rules do not chain';
end $$;
insert into forms (name, category, draft) values ('Health', 'Health screen',
  '{"sections":[
     {"id":"s1","title":"History","questions":[
       {"id":"y1","type":"yesno","label":"Heart?","required":true,"flag":"yes"},
       {"id":"y1m","type":"long","label":"More","required":true,"showIf":{"q":"y1","is":"yes"}},
       {"id":"dob","type":"date","label":"Born","required":true,"allowed":"past"}]},
     {"id":"s2","title":"Clearance","showIf":{"q":"y1","is":"yes"},"questions":[
       {"id":"c1","type":"yesno","label":"Cleared?","required":true}]}]}');
select publish_form(id, 0) from forms where name = 'Health';
select assign_form((select id from forms where name = 'Health'), array['10000000-0000-0000-0000-0000000000a1']::uuid[]);
create temp table hs as select a.id from form_assignments a join forms f on f.id = a.form_id where f.name = 'Health';
grant select on hs to authenticated;
select pg_temp.as_user('10000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert pg_temp.fails($q$ select submit_form_assignment((select id from hs), '{"y1":true,"dob":"1990-01-01"}', 1) $q$),
    'a required follow-up is required once it shows';
  assert pg_temp.fails($q$ select submit_form_assignment((select id from hs), '{"y1":false,"dob":"2999-01-01"}', 1) $q$),
    'a past-only date refuses the future';
end $$;
select submit_form_assignment((select id from hs), '{"y1":false,"y1m":"stale","dob":"1990-01-01"}', 1);
do $$ begin
  assert (select answers from form_responses where assignment_id = (select id from hs)) = '{"y1":false,"dob":"1990-01-01"}'::jsonb,
    'hidden follow-ups and sections are skipped, and their stale answers dropped';
  assert not (select flagged from form_assignments where id = (select id from hs)), 'No does not flag';
end $$;
select pg_temp.as_user('10000000-0000-0000-0000-00000000000c');
select assign_form((select id from forms where name = 'Health'), array['10000000-0000-0000-0000-0000000000a1']::uuid[]);
truncate hs;
insert into hs select a.id from form_assignments a join forms f on f.id = a.form_id where f.name = 'Health' and a.submitted_at is null;
select pg_temp.as_user('10000000-0000-0000-0000-0000000000a1');
select submit_form_assignment((select id from hs), '{"y1":true,"y1m":"Stent in 2019","dob":"1990-01-01","c1":true}', 1);
do $$ begin
  assert (select flagged from form_assignments where id = (select id from hs)), 'a flagged Yes flags the response';
end $$;

reset role;
select 'forms tests passed' as result;
