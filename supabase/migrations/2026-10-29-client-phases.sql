-- Coach-planned client phases. Projected end dates are advisory: phases never
-- auto-complete when an end date passes. Existing client data is untouched.
create table if not exists public.client_phases (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  start_date date not null,
  end_date date not null check (end_date >= start_date),
  description text check (description is null or length(description) <= 2000),
  status text not null default 'not_started' check (status in ('not_started', 'active', 'completed')),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_phases_client_start_idx on public.client_phases(client_id, start_date);
create unique index if not exists client_phases_one_active_idx on public.client_phases(client_id) where status = 'active';
alter table public.client_phases enable row level security;
revoke all on public.client_phases from anon;
grant select, insert, update, delete on public.client_phases to authenticated;

drop policy if exists "read own phases or coach reads all" on public.client_phases;
create policy "read own phases or coach reads all" on public.client_phases for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));
drop policy if exists "coach adds phases" on public.client_phases;
create policy "coach adds phases" on public.client_phases for insert to authenticated
  with check ((select public.is_coach()));
drop policy if exists "coach updates phases" on public.client_phases;
create policy "coach updates phases" on public.client_phases for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
drop policy if exists "coach deletes phases" on public.client_phases;
create policy "coach deletes phases" on public.client_phases for delete to authenticated
  using ((select public.is_coach()));

-- The active switch runs as one transaction so there is never a partial swap.
create or replace function public.activate_client_phase(p_phase_id uuid)
returns void language plpgsql security invoker set search_path = '' as $$
declare target_client uuid;
begin
  if not public.is_coach() then raise exception 'Coach access required'; end if;
  select client_id into target_client from public.client_phases where id = p_phase_id;
  if target_client is null then raise exception 'Phase not found'; end if;
  perform pg_advisory_xact_lock(hashtext(target_client::text));
  update public.client_phases set status = 'not_started', completed_at = null, updated_at = now()
    where client_id = target_client and status = 'active' and id <> p_phase_id;
  update public.client_phases set status = 'active', completed_at = null, updated_at = now()
    where id = p_phase_id;
end; $$;
revoke all on function public.activate_client_phase(uuid) from public, anon;
grant execute on function public.activate_client_phase(uuid) to authenticated;
