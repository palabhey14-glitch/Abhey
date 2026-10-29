-- Coach-only client records for the Clients page: status, tags, notes and
-- payment details. Clients never see this table. Safe to run more than once.

create table if not exists public.client_admin (
  client_id        uuid primary key references public.profiles (id) on delete cascade,
  status           text not null default 'active' check (status in ('active', 'inactive')),
  tags             text[] not null default '{}' check (cardinality(tags) <= 20),
  notes            text check (notes is null or length(notes) <= 2000),
  payment_amount   numeric(10, 2) check (payment_amount is null or payment_amount between 0 and 100000),
  payment_schedule text not null default 'none'
                   check (payment_schedule in ('none', 'one_off', 'weekly', 'fortnightly', 'monthly', 'three_payments')),
  invited_at       timestamptz,  -- when the coach added them from the app
  inactive_at      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

alter table public.client_admin enable row level security;

drop policy if exists "coach manages client records" on public.client_admin;
create policy "coach manages client records" on public.client_admin for all to authenticated
  using ((select public.is_coach()))
  with check ((select public.is_coach()) and exists (select 1 from public.profiles p where p.id = client_id and p.role = 'client'));

revoke all on public.client_admin from anon, authenticated;
grant select, insert, update on public.client_admin to authenticated;

drop trigger if exists touch_client_admin on public.client_admin;
create trigger touch_client_admin before update on public.client_admin
  for each row execute function public.touch_updated_at();

-- Inactive keeps its date; going back to active clears it.
create or replace function public.client_admin_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.status = 'inactive' and (tg_op = 'INSERT' or old.status is distinct from 'inactive') then
    new.inactive_at := now();
  elsif new.status = 'active' then
    new.inactive_at := null;
  end if;
  return new;
end;
$$;
drop trigger if exists client_admin_status on public.client_admin;
create trigger client_admin_status before insert or update on public.client_admin
  for each row execute function public.client_admin_status();

-- Tags are trimmed and de-duplicated ignoring case.
create or replace function public.client_admin_tags()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.tags := coalesce((
    select array_agg(t order by min_ord)
    from (select min(trim(x)) as t, min(ord) as min_ord
            from unnest(new.tags) with ordinality as u (x, ord)
           where length(trim(x)) between 1 and 40
           group by lower(trim(x))) d
  ), '{}');
  return new;
end;
$$;
drop trigger if exists client_admin_tags on public.client_admin;
create trigger client_admin_tags before insert or update of tags on public.client_admin
  for each row execute function public.client_admin_tags();
