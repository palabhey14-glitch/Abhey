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

reset role;
select 'forms tests passed' as result;
