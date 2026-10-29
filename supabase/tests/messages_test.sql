-- Messages rules. Run after supabase_stub.sql, schema.sql and the messages
-- migration:  psql -v ON_ERROR_STOP=1 -f messages_test.sql
create or replace function pg_temp.as_user(uid text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claim.sub', uid, false);
  perform set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, false);
  set role authenticated;
end $$;
create or replace function pg_temp.fails(q text) returns boolean language plpgsql as $$
begin
  execute q;
  return false;
exception when others then
  return true;
end $$;

reset role;
insert into auth.users (id, email) values
  ('20000000-0000-0000-0000-00000000000c', 'coach@example.com'),
  ('20000000-0000-0000-0000-0000000000a1', 'a@example.com'),
  ('20000000-0000-0000-0000-0000000000b2', 'b@example.com');
update public.profiles set role = 'coach' where id = '20000000-0000-0000-0000-00000000000c';

-- Client A writes to the coach.
select pg_temp.as_user('20000000-0000-0000-0000-0000000000a1');
insert into messages (client_id, body) values ('20000000-0000-0000-0000-0000000000a1', 'Hi Abhey');
do $$ begin
  assert pg_temp.fails($q$ insert into messages (client_id, body) values ('20000000-0000-0000-0000-0000000000b2', 'sneaky') $q$),
    'a client cannot write into another client''s conversation';
  assert pg_temp.fails($q$ insert into messages (client_id, sender_id, body) values ('20000000-0000-0000-0000-0000000000a1', '20000000-0000-0000-0000-00000000000c', 'fake') $q$),
    'a client cannot pretend to be the coach';
  assert pg_temp.fails($q$ insert into messages (client_id, body) values ('20000000-0000-0000-0000-0000000000a1', '   ') $q$),
    'an empty message is refused';
  assert pg_temp.fails($q$ update messages set body = 'edited' $q$), 'messages cannot be edited';
  assert pg_temp.fails($q$ delete from messages $q$), 'messages cannot be deleted';
end $$;

-- Client B sees nothing of A's conversation.
select pg_temp.as_user('20000000-0000-0000-0000-0000000000b2');
do $$ begin
  assert (select count(*) from messages) = 0, 'client B cannot read client A''s messages';
  assert pg_temp.fails($q$ select mark_messages_read('20000000-0000-0000-0000-0000000000a1') $q$), 'client B cannot mark A''s messages read';
end $$;

-- The coach reads and replies.
select pg_temp.as_user('20000000-0000-0000-0000-00000000000c');
do $$ begin
  assert (select count(*) from messages) = 1, 'the coach sees the client''s message';
end $$;
select mark_messages_read('20000000-0000-0000-0000-0000000000a1');
insert into messages (client_id, body) values ('20000000-0000-0000-0000-0000000000a1', 'Hey, how did training go?');
do $$ begin
  assert (select read_at from messages where body = 'Hi Abhey') is not null, 'the coach opening it marks it read';
  assert (select read_at from messages where body like 'Hey%') is null, 'the coach''s own reply stays unread';
  assert pg_temp.fails($q$ insert into messages (client_id, body) values ('20000000-0000-0000-0000-00000000000c', 'note to self') $q$),
    'the coach writes only into a client''s conversation';
end $$;

select pg_temp.as_user('20000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from messages) = 2, 'client A sees both messages';
end $$;

reset role;
select 'messages tests passed' as result;
