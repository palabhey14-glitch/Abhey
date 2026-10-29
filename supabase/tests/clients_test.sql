-- Coach-only client records. Run after supabase_stub.sql, schema.sql and the
-- clients migration:  psql -v ON_ERROR_STOP=1 -f clients_test.sql
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
  ('30000000-0000-0000-0000-00000000000c', 'coach@example.com'),
  ('30000000-0000-0000-0000-0000000000a1', 'a@example.com');
update public.profiles set role = 'coach' where id = '30000000-0000-0000-0000-00000000000c';

select pg_temp.as_user('30000000-0000-0000-0000-00000000000c');
insert into client_admin (client_id, tags, notes, payment_amount, payment_schedule)
  values ('30000000-0000-0000-0000-0000000000a1', '{ VIP ,vip,Recomp,""}', 'Night shifts', 750, 'three_payments');
do $$ begin
  assert (select tags from client_admin) = '{VIP,Recomp}', 'tags trimmed and de-duplicated ignoring case';
  assert pg_temp.fails($q$ insert into client_admin (client_id) values ('30000000-0000-0000-0000-00000000000c') $q$), 'only clients get records';
  assert pg_temp.fails($q$ update client_admin set payment_schedule = 'yearly' $q$), 'only known schedules';
end $$;
update client_admin set status = 'inactive';
do $$ begin
  assert (select inactive_at from client_admin) is not null, 'inactive is dated';
end $$;
update client_admin set status = 'active';
do $$ begin
  assert (select inactive_at from client_admin) is null, 'active again clears the date';
  assert pg_temp.fails($q$ delete from client_admin $q$), 'records are not deleted from the browser';
end $$;

select pg_temp.as_user('30000000-0000-0000-0000-0000000000a1');
do $$ begin
  assert (select count(*) from client_admin) = 0, 'a client cannot read the coach records, even their own';
  assert pg_temp.fails($q$ insert into client_admin (client_id) values ('30000000-0000-0000-0000-0000000000a1') $q$), 'or write them';
end $$;

reset role;
select 'clients tests passed' as result;
