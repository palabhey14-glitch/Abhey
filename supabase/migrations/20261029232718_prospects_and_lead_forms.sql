-- Additive prospect CRM. No existing client, plan or log rows are modified.
create table public.prospect_lead_forms (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.profiles(id),
  title text not null check (length(trim(title)) between 1 and 120),
  description text not null default '' check (length(description) <= 500),
  draft_schema jsonb not null default '{"questions":[]}' check (jsonb_typeof(draft_schema)='object' and pg_column_size(draft_schema)<50000),
  published_schema jsonb check (published_schema is null or (jsonb_typeof(published_schema)='object' and pg_column_size(published_schema)<50000)),
  public_token uuid not null unique default gen_random_uuid(),
  accepting boolean not null default false,
  version integer not null default 0 check (version >= 0),
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not accepting or (published_schema is not null and archived_at is null))
);
create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.profiles(id),
  first_name text not null check (length(trim(first_name)) between 1 and 40),
  last_name text not null default '' check (length(last_name)<=40),
  email text check (email is null or length(email)<=254),
  phone text check (phone is null or length(phone)<=26),
  deal_value numeric(12,2) check (deal_value is null or deal_value between 0 and 1000000),
  currency text not null default 'AUD' check (currency='AUD'),
  stage text not null default 'call_not_scheduled' check (stage in ('new','call_not_scheduled','call_scheduled','call_completed','follow_up','converted','lost')),
  close_percentage smallint check (close_percentage is null or close_percentage between 0 and 100),
  tags text[] not null default '{}' check (cardinality(tags)<=20),
  notes text check (notes is null or length(notes)<=2000),
  source text not null default 'manual' check (source in ('manual','lead_form')),
  lead_form_id uuid references public.prospect_lead_forms(id) on delete set null,
  answers jsonb not null default '{}' check (jsonb_typeof(answers)='object' and pg_column_size(answers)<50000),
  form_snapshot jsonb check (form_snapshot is null or (jsonb_typeof(form_snapshot)='object' and pg_column_size(form_snapshot)<50000)),
  submission_key uuid unique,
  converted_client_id uuid references public.profiles(id) on delete set null,
  converted_at timestamptz,
  archived_at timestamptz,
  stage_changed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index prospects_coach_created_idx on public.prospects(coach_id,created_at desc);
create index prospects_lead_form_idx on public.prospects(lead_form_id);
create index prospects_converted_client_idx on public.prospects(converted_client_id);
create index prospect_lead_forms_coach_idx on public.prospect_lead_forms(coach_id);
create table public.prospect_submission_limits (
  form_id uuid not null references public.prospect_lead_forms(id) on delete cascade,
  ip_hash text not null check (length(ip_hash)=64),
  window_start timestamptz not null default now(),
  attempts integer not null default 1,
  primary key(form_id,ip_hash)
);

alter table public.prospects enable row level security;
alter table public.prospect_lead_forms enable row level security;
alter table public.prospect_submission_limits enable row level security;
revoke all on public.prospects,public.prospect_lead_forms,public.prospect_submission_limits from public,anon,authenticated;
grant select,insert,update on public.prospects,public.prospect_lead_forms to authenticated;
grant all on public.prospects,public.prospect_lead_forms,public.prospect_submission_limits to service_role;
create policy "coach manages prospects" on public.prospects for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "coach manages lead forms" on public.prospect_lead_forms for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
-- No anonymous/client policy exists: the public form endpoint returns only the
-- published form, and accepts validated submissions through the service role.

create function public.prospect_touch() returns trigger language plpgsql set search_path='' as $$
begin
  new.updated_at:=now();
  if tg_table_name='prospects' then
    if new.stage is distinct from old.stage then new.stage_changed_at:=now(); end if;
  end if;
  return new;
end; $$;
revoke all on function public.prospect_touch() from public,anon;
grant execute on function public.prospect_touch() to authenticated,service_role;
create trigger touch_prospects before update on public.prospects for each row execute function public.prospect_touch();
create trigger touch_prospect_lead_forms before update on public.prospect_lead_forms for each row execute function public.prospect_touch();

-- Atomic public submission; callable only by the server's service role.
create function public.submit_prospect_lead(p_token uuid,p_values jsonb,p_request_id uuid,p_ip_hash text,p_version integer)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare f public.prospect_lead_forms%rowtype; tries integer;
begin
  select * into f from public.prospect_lead_forms where public_token=p_token and accepting and archived_at is null and published_schema is not null for share;
  if f.id is null then return jsonb_build_object('accepted',false,'reason','unavailable'); end if;
  if p_version is distinct from f.version then return jsonb_build_object('accepted',false,'reason','changed'); end if;
  if exists(select 1 from public.prospects where submission_key=p_request_id and lead_form_id=f.id) then return jsonb_build_object('accepted',true); end if;
  if p_request_id is null or p_ip_hash is null or length(p_ip_hash)<>64 or jsonb_typeof(p_values)<>'object' or pg_column_size(p_values)>40000 then raise exception 'Invalid submission'; end if;
  if length(trim(coalesce(p_values->>'first_name',''))) not between 1 and 40 or length(coalesce(p_values->>'last_name',''))>40 or length(coalesce(p_values->>'email','')) not between 3 and 254 or coalesce(p_values->>'email','') !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or jsonb_typeof(p_values->'answers') is distinct from 'object' then raise exception 'Invalid contact details'; end if;
  insert into public.prospect_submission_limits(form_id,ip_hash) values(f.id,p_ip_hash)
    on conflict(form_id,ip_hash) do update set
      attempts=case when prospect_submission_limits.window_start < now()-interval '1 hour' then 1 else prospect_submission_limits.attempts+1 end,
      window_start=case when prospect_submission_limits.window_start < now()-interval '1 hour' then now() else prospect_submission_limits.window_start end
    returning attempts into tries;
  if tries>5 then return jsonb_build_object('accepted',false,'reason','rate_limit'); end if;
  insert into public.prospects(coach_id,first_name,last_name,email,phone,stage,source,lead_form_id,answers,form_snapshot,submission_key)
    values(f.coach_id,trim(p_values->>'first_name'),coalesce(p_values->>'last_name',''),lower(p_values->>'email'),nullif(p_values->>'phone',''),'new','lead_form',f.id,p_values->'answers',f.published_schema,p_request_id)
    on conflict(submission_key) do nothing;
  return jsonb_build_object('accepted',true);
end; $$;
revoke all on function public.submit_prospect_lead(uuid,jsonb,uuid,text,integer) from public,anon,authenticated;
grant execute on function public.submit_prospect_lead(uuid,jsonb,uuid,text,integer) to service_role;
