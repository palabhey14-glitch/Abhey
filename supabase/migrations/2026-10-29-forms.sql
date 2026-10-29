-- Forms: onboarding, health screens, contracts and feedback forms the coach
-- builds once and sends to clients. Run once on the live database:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run again. Adds tables only; nothing existing is changed.
--
--   forms             the coach's form: name, category, tags and the draft
--                     being edited (welcome screen, sections, questions,
--                     options and thank-you screen, as one JSON document)
--   form_versions     a frozen copy of the draft made on every Publish.
--                     Never changed afterwards.
--   form_assignments  one form version sent to one client
--   form_responses    the client's answers, saved as they go
--
-- Clients only ever see the version they were sent, so later edits never
-- change a form a client is filling in or has already answered. The coach
-- sees answers once the client submits (progress before that).

create table if not exists public.forms (
  id                   uuid primary key default gen_random_uuid(),
  coach_id             uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  name                 text not null check (length(trim(name)) between 1 and 120),
  category             text not null check (category in ('Onboarding', 'Health screen', 'Contract', 'Feedback', 'Other')),
  description          text check (description is null or length(description) <= 200),
  tags                 text[] not null default '{}' check (cardinality(tags) <= 20),
  notes                text check (notes is null or length(notes) <= 1000),  -- only the coach sees these
  draft                jsonb not null default '{}'::jsonb
                       check (jsonb_typeof(draft) = 'object' and pg_column_size(draft) <= 300000),
  draft_rev            integer not null default 0,  -- goes up by one on every save
  published_version_id uuid,
  published_rev        integer,                     -- draft_rev that was last published
  is_default           boolean not null default false,  -- the coach's go-to form for its category
  archived_at          timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists forms_one_default
  on public.forms (coach_id, category) where is_default and archived_at is null;

create table if not exists public.form_versions (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.forms (id) on delete restrict,
  version      integer not null check (version >= 1),
  name         text not null,
  category     text not null,
  description  text,
  content      jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references public.profiles (id) on delete set null,
  unique (form_id, version)
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'forms_published_version_fk') then
    alter table public.forms add constraint forms_published_version_fk
      foreign key (published_version_id) references public.form_versions (id) on delete restrict;
  end if;
end $$;

create table if not exists public.form_assignments (
  id           uuid primary key default gen_random_uuid(),
  form_id      uuid not null references public.forms (id) on delete restrict,
  version_id   uuid not null references public.form_versions (id) on delete restrict,
  client_id    uuid not null references public.profiles (id) on delete cascade,
  assigned_by  uuid references public.profiles (id) on delete set null,
  assigned_at  timestamptz not null default now(),
  started_at   timestamptz,
  submitted_at timestamptz,
  cancelled_at timestamptz,
  status       text generated always as (
                 case when cancelled_at is not null then 'cancelled'
                      when submitted_at is not null then 'completed'
                      when started_at is not null then 'in_progress'
                      else 'not_started' end) stored
);

-- One open copy of a form per client at a time.
create unique index if not exists form_assignments_one_open
  on public.form_assignments (form_id, client_id) where submitted_at is null and cancelled_at is null;
create index if not exists form_assignments_client on public.form_assignments (client_id, assigned_at desc);
create index if not exists form_versions_form on public.form_versions (form_id, version desc);

create table if not exists public.form_responses (
  assignment_id uuid primary key references public.form_assignments (id) on delete cascade,
  client_id     uuid not null references public.profiles (id) on delete cascade,
  answers       jsonb not null default '{}'::jsonb
                check (jsonb_typeof(answers) = 'object' and pg_column_size(answers) <= 200000),
  seq           bigint not null default 0,  -- the browser's save counter; older saves are ignored
  saved_at      timestamptz,
  submitted_at  timestamptz
);

drop trigger if exists touch_forms on public.forms;
create trigger touch_forms before update on public.forms
  for each row execute function public.touch_updated_at();

-- Draft saves must count up, so an older save that arrives late (or a second
-- open tab) can never overwrite newer work. Tags are trimmed and de-duplicated
-- ignoring case.
create or replace function public.guard_form()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    if new.coach_id <> old.coach_id then
      raise exception 'A form cannot move to another coach';
    end if;
    if new.draft is distinct from old.draft and new.draft_rev <= old.draft_rev then
      raise exception 'stale_draft: this form was changed somewhere else. Reload to see the latest version.'
        using errcode = 'P0409';
    end if;
  end if;
  new.tags := coalesce((
    select array_agg(t order by first_at)
    from (
      select (array_agg(trim(x) order by ord))[1] as t, min(ord) as first_at
      from unnest(new.tags) with ordinality as u (x, ord)
      where length(trim(x)) between 1 and 40
      group by lower(trim(x))
    ) d
  ), '{}');
  return new;
end;
$$;

drop trigger if exists guard_forms on public.forms;
create trigger guard_forms before insert or update on public.forms
  for each row execute function public.guard_form();

-- ---------------------------------------------------------------------------
-- Checks shared by Publish and Submit. The app runs the same checks first
-- (site/app/js/forms.js) so the coach and client see them inline.
-- ---------------------------------------------------------------------------

create or replace function public.form_content_problems(content jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  out text[] := '{}';
  s jsonb;
  q jsonb;
  n_sections int := 0;
  n_questions int := 0;
  t text;
  n_opts int;
  si int := 0;
begin
  if jsonb_typeof(content -> 'sections') <> 'array' or jsonb_array_length(content -> 'sections') = 0 then
    return array['The form needs at least one section'];
  end if;
  for s in select * from jsonb_array_elements(content -> 'sections') loop
    si := si + 1;
    n_sections := n_sections + 1;
    if length(trim(coalesce(s ->> 'title', ''))) = 0 then
      out := out || format('Section %s needs a title', si);
    end if;
    if jsonb_typeof(s -> 'questions') <> 'array' or jsonb_array_length(s -> 'questions') = 0 then
      out := out || format('Section %s has no questions', si);
      continue;
    end if;
    for q in select * from jsonb_array_elements(s -> 'questions') loop
      n_questions := n_questions + 1;
      t := q ->> 'type';
      if t is null or t not in ('short', 'long', 'single', 'multi', 'scale', 'number', 'date', 'yesno', 'ack') then
        out := out || format('Question %s has an unknown answer type', n_questions);
      end if;
      if length(trim(coalesce(q ->> 'label', ''))) = 0 then
        out := out || format('Question %s needs a question', n_questions);
      end if;
      if t in ('single', 'multi') then
        select count(*) into n_opts from jsonb_array_elements(coalesce(q -> 'options', '[]')) o
          where length(trim(coalesce(o ->> 'label', ''))) > 0;
        if coalesce((q ->> 'allowOther')::boolean, false) then n_opts := n_opts + 1; end if;
        if n_opts < 2 then
          out := out || format('Question %s needs at least two options', n_questions);
        end if;
        if t = 'multi' and (q ->> 'minPicks') is not null and (q ->> 'maxPicks') is not null
           and (q ->> 'minPicks')::numeric > (q ->> 'maxPicks')::numeric then
          out := out || format('Question %s asks for more minimum picks than maximum', n_questions);
        end if;
      end if;
      if t in ('number', 'scale') and (q ->> 'min') is not null and (q ->> 'max') is not null
         and (q ->> 'min')::numeric >= (q ->> 'max')::numeric then
        out := out || format('Question %s has a lowest value that is not below the highest', n_questions);
      end if;
    end loop;
  end loop;
  if n_questions = 0 then
    out := out || 'Add at least one question'::text;
  end if;
  return out;
end;
$$;

-- An answer counts when it is not empty. No and false are answers.
create or replace function public.form_answer_problems(content jsonb, answers jsonb)
returns text[]
language plpgsql
immutable
set search_path = ''
as $$
declare
  out text[] := '{}';
  q jsonb;
  a jsonb;
  t text;
  n int := 0;
begin
  for q in
    select qq from jsonb_array_elements(content -> 'sections') s, jsonb_array_elements(s -> 'questions') qq
  loop
    n := n + 1;
    t := q ->> 'type';
    a := answers -> (q ->> 'id');
    if a is null or a = 'null'::jsonb
       or (jsonb_typeof(a) = 'string' and length(trim(a #>> '{}')) = 0)
       or (jsonb_typeof(a) = 'array' and jsonb_array_length(a) = 0) then
      if coalesce((q ->> 'required')::boolean, false) then
        out := out || format('Question %s is required', n);
      end if;
      continue;
    end if;
    if t = 'ack' and a <> 'true'::jsonb then
      if coalesce((q ->> 'required')::boolean, false) then
        out := out || format('Question %s must be ticked', n);
      end if;
    elsif t in ('number', 'scale') then
      if jsonb_typeof(a) <> 'number' then
        out := out || format('Question %s needs a number', n);
      elsif ((q ->> 'min') is not null and (a #>> '{}')::numeric < (q ->> 'min')::numeric)
         or ((q ->> 'max') is not null and (a #>> '{}')::numeric > (q ->> 'max')::numeric) then
        out := out || format('Question %s is out of range', n);
      end if;
    elsif t = 'yesno' and jsonb_typeof(a) <> 'boolean' then
      out := out || format('Question %s needs Yes or No', n);
    elsif t in ('short', 'long') and (q ->> 'maxLength') is not null
          and length(a #>> '{}') > (q ->> 'maxLength')::int then
      out := out || format('Question %s is too long', n);
    elsif t = 'multi' and jsonb_typeof(a) = 'array' then
      if (q ->> 'minPicks') is not null and jsonb_array_length(a) < (q ->> 'minPicks')::int then
        out := out || format('Question %s needs more picks', n);
      elsif (q ->> 'maxPicks') is not null and jsonb_array_length(a) > (q ->> 'maxPicks')::int then
        out := out || format('Question %s has too many picks', n);
      end if;
    end if;
  end loop;
  return out;
end;
$$;

-- Keeps only answers to questions that exist in this version (plus the
-- "Other" text boxes, saved as "<question id>.other").
create or replace function public.form_clean_answers(content jsonb, answers jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select coalesce(jsonb_object_agg(k, v), '{}'::jsonb)
  from jsonb_each(coalesce(answers, '{}'::jsonb)) as e (k, v)
  where exists (
    select 1 from jsonb_array_elements(content -> 'sections') s, jsonb_array_elements(s -> 'questions') q
    where k = q ->> 'id' or k = (q ->> 'id') || '.other'
  );
$$;

-- ---------------------------------------------------------------------------
-- Actions. Each checks who is calling; the browser's word is never enough.
-- ---------------------------------------------------------------------------

-- Publish: freeze the saved draft as the next version.
create or replace function public.publish_form(p_form uuid, p_rev integer)
returns public.form_versions
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forms;
  v public.form_versions;
  problems text[];
begin
  select * into f from public.forms where id = p_form and coach_id = auth.uid() for update;
  if f.id is null or not public.is_coach() then
    raise exception 'Form not found';
  end if;
  if f.archived_at is not null then
    raise exception 'Restore this form before publishing it';
  end if;
  if f.draft_rev <> p_rev then
    raise exception 'stale_draft: this form was changed somewhere else. Reload to see the latest version.'
      using errcode = 'P0409';
  end if;
  problems := public.form_content_problems(f.draft);
  if cardinality(problems) > 0 then
    raise exception 'This form is not ready to publish: %', array_to_string(problems, '; ');
  end if;
  if f.published_rev = f.draft_rev and f.published_version_id is not null then
    select * into v from public.form_versions where id = f.published_version_id;
    return v;  -- nothing changed since the last publish
  end if;
  insert into public.form_versions (form_id, version, name, category, description, content, published_by)
  values (f.id, coalesce((select max(version) from public.form_versions where form_id = f.id), 0) + 1,
          f.name, f.category, f.description, f.draft, auth.uid())
  returning * into v;
  update public.forms set published_version_id = v.id, published_rev = f.draft_rev where id = f.id;
  return v;
end;
$$;

-- Send the published version to clients. Skips anyone who already has an
-- open copy of this form.
create or replace function public.assign_form(p_form uuid, p_clients uuid[])
returns table (client_id uuid, assignment_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  f public.forms;
  c uuid;
  existing uuid;
  new_id uuid;
begin
  select * into f from public.forms where id = p_form and coach_id = auth.uid();
  if f.id is null or not public.is_coach() then
    raise exception 'Form not found';
  end if;
  if f.archived_at is not null then
    raise exception 'Restore this form before sending it';
  end if;
  if f.published_version_id is null then
    raise exception 'Publish this form before sending it';
  end if;
  foreach c in array coalesce(p_clients, '{}') loop
    if not exists (select 1 from public.profiles p where p.id = c and p.role = 'client') then
      raise exception 'Client not found';
    end if;
    select a.id into existing from public.form_assignments a
      where a.form_id = f.id and a.client_id = c and a.submitted_at is null and a.cancelled_at is null;
    if existing is not null then
      client_id := c; assignment_id := existing; created := false;
      return next;
      continue;
    end if;
    insert into public.form_assignments (form_id, version_id, client_id, assigned_by)
    values (f.id, f.published_version_id, c, auth.uid())
    returning id into new_id;
    insert into public.form_responses (assignment_id, client_id) values (new_id, c);
    client_id := c; assignment_id := new_id; created := true;
    return next;
  end loop;
end;
$$;

-- Withdraw a form the client has not submitted yet.
create or replace function public.cancel_form_assignment(p_assignment uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.form_assignments a set cancelled_at = now()
  from public.forms f
  where a.id = p_assignment and f.id = a.form_id and f.coach_id = auth.uid() and public.is_coach()
    and a.submitted_at is null and a.cancelled_at is null;
  if not found then
    raise exception 'Only an open form can be withdrawn';
  end if;
end;
$$;

-- The client's progress. p_seq counts up in the browser; a save older than
-- the one already stored is ignored, so answers never go backwards.
create or replace function public.save_form_answers(p_assignment uuid, p_answers jsonb, p_seq bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.form_assignments;
  r public.form_responses;
  content jsonb;
begin
  select * into a from public.form_assignments where id = p_assignment and client_id = auth.uid() for update;
  if a.id is null then
    raise exception 'Form not found';
  end if;
  if a.cancelled_at is not null then
    raise exception 'Your coach withdrew this form';
  end if;
  if a.submitted_at is not null then
    raise exception 'already_submitted: this form has already been sent' using errcode = 'P0410';
  end if;
  select * into r from public.form_responses where assignment_id = a.id for update;
  if r.seq >= p_seq then
    return jsonb_build_object('seq', r.seq, 'saved_at', r.saved_at, 'ignored', true);
  end if;
  select v.content into content from public.form_versions v where v.id = a.version_id;
  update public.form_responses
     set answers = public.form_clean_answers(content, p_answers), seq = p_seq, saved_at = now()
   where assignment_id = a.id
  returning * into r;
  if a.started_at is null then
    update public.form_assignments set started_at = now() where id = a.id;
  end if;
  return jsonb_build_object('seq', r.seq, 'saved_at', r.saved_at, 'ignored', false);
end;
$$;

-- Submit. Sending twice (a double tap, or a retry after the network dropped)
-- returns the first submission and changes nothing.
create or replace function public.submit_form_assignment(p_assignment uuid, p_answers jsonb, p_seq bigint)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  a public.form_assignments;
  content jsonb;
  clean jsonb;
  problems text[];
begin
  select * into a from public.form_assignments where id = p_assignment and client_id = auth.uid() for update;
  if a.id is null then
    raise exception 'Form not found';
  end if;
  if a.submitted_at is not null then
    return jsonb_build_object('submitted_at', a.submitted_at, 'already', true);
  end if;
  if a.cancelled_at is not null then
    raise exception 'Your coach withdrew this form';
  end if;
  select v.content into content from public.form_versions v where v.id = a.version_id;
  clean := public.form_clean_answers(content, p_answers);
  problems := public.form_answer_problems(content, clean);
  if cardinality(problems) > 0 then
    raise exception 'Some answers are missing: %', array_to_string(problems, '; ');
  end if;
  update public.form_responses
     set answers = clean, seq = greatest(seq, p_seq), saved_at = now(), submitted_at = now()
   where assignment_id = a.id;
  update public.form_assignments
     set submitted_at = now(), started_at = coalesce(started_at, now())
   where id = a.id
  returning * into a;
  return jsonb_build_object('submitted_at', a.submitted_at, 'already', false);
end;
$$;

revoke execute on function public.publish_form(uuid, integer), public.assign_form(uuid, uuid[]),
  public.cancel_form_assignment(uuid), public.save_form_answers(uuid, jsonb, bigint),
  public.submit_form_assignment(uuid, jsonb, bigint) from public, anon;
grant execute on function public.publish_form(uuid, integer), public.assign_form(uuid, uuid[]),
  public.cancel_form_assignment(uuid), public.save_form_answers(uuid, jsonb, bigint),
  public.submit_form_assignment(uuid, jsonb, bigint) to authenticated;
grant execute on function public.form_content_problems(jsonb), public.form_answer_problems(jsonb, jsonb)
  to authenticated;

-- ---------------------------------------------------------------------------
-- Who can read and change what
-- ---------------------------------------------------------------------------

alter table public.forms            enable row level security;
alter table public.form_versions    enable row level security;
alter table public.form_assignments enable row level security;
alter table public.form_responses   enable row level security;

revoke all on public.forms, public.form_versions, public.form_assignments, public.form_responses from anon;
revoke all on public.forms, public.form_versions, public.form_assignments, public.form_responses from authenticated;
-- The coach edits forms directly. Versions, assignments and answers only
-- change through the actions above.
grant select, delete on public.forms to authenticated;
grant insert (name, category, description, tags, notes, draft) on public.forms to authenticated;
grant update (name, category, description, tags, notes, draft, draft_rev, archived_at, is_default) on public.forms to authenticated;
grant select on public.form_versions, public.form_assignments, public.form_responses to authenticated;

drop policy if exists "coach reads own forms" on public.forms;
create policy "coach reads own forms" on public.forms
  for select to authenticated using (coach_id = (select auth.uid()) and (select public.is_coach()));
drop policy if exists "coach adds forms" on public.forms;
create policy "coach adds forms" on public.forms
  for insert to authenticated with check (coach_id = (select auth.uid()) and (select public.is_coach()));
drop policy if exists "coach edits own forms" on public.forms;
create policy "coach edits own forms" on public.forms
  for update to authenticated
  using (coach_id = (select auth.uid()) and (select public.is_coach()))
  with check (coach_id = (select auth.uid()) and (select public.is_coach()));
-- Only a form that was never published can be deleted; published ones are archived.
drop policy if exists "coach deletes unpublished forms" on public.forms;
create policy "coach deletes unpublished forms" on public.forms
  for delete to authenticated
  using (coach_id = (select auth.uid()) and (select public.is_coach()) and published_version_id is null);

drop policy if exists "coach or assigned client reads versions" on public.form_versions;
create policy "coach or assigned client reads versions" on public.form_versions
  for select to authenticated using (
    exists (select 1 from public.forms f where f.id = form_versions.form_id and f.coach_id = (select auth.uid()))
    or exists (select 1 from public.form_assignments a
               where a.version_id = form_versions.id and a.client_id = (select auth.uid()))
  );

drop policy if exists "client or coach reads assignments" on public.form_assignments;
create policy "client or coach reads assignments" on public.form_assignments
  for select to authenticated using (
    client_id = (select auth.uid())
    or exists (select 1 from public.forms f where f.id = form_assignments.form_id and f.coach_id = (select auth.uid()))
  );

-- The coach reads answers only after the client submits.
drop policy if exists "client reads own answers, coach reads submitted" on public.form_responses;
create policy "client reads own answers, coach reads submitted" on public.form_responses
  for select to authenticated using (
    client_id = (select auth.uid())
    or (submitted_at is not null and exists (
      select 1 from public.form_assignments a join public.forms f on f.id = a.form_id
      where a.id = form_responses.assignment_id and f.coach_id = (select auth.uid())))
  );
