-- Messages: one private conversation per client, between that client and the
-- coach. Not a group chat: a client only ever sees their own conversation.
-- Safe to run more than once.

create table if not exists public.messages (
  id         uuid primary key default gen_random_uuid(),
  client_id  uuid not null references public.profiles (id) on delete cascade,  -- whose conversation
  sender_id  uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  body       text not null check (length(trim(body)) between 1 and 4000),
  created_at timestamptz not null default now(),
  read_at    timestamptz  -- when the other person opened it
);

create index if not exists messages_thread on public.messages (client_id, created_at desc);

alter table public.messages enable row level security;

-- The client reads their own conversation; the coach reads all of them.
drop policy if exists "read own conversation" on public.messages;
create policy "read own conversation" on public.messages for select to authenticated
  using (client_id = (select auth.uid()) or (select public.is_coach()));

-- A client writes only into their own conversation; the coach writes only
-- into a client's. The sender is always the signed-in person.
drop policy if exists "write own conversation" on public.messages;
create policy "write own conversation" on public.messages for insert to authenticated
  with check (
    sender_id = (select auth.uid())
    and (
      (client_id = (select auth.uid()) and exists (select 1 from public.profiles p where p.id = client_id and p.role = 'client'))
      or ((select public.is_coach()) and exists (select 1 from public.profiles p where p.id = client_id and p.role = 'client'))
    )
  );

-- No edits or deletes from the browser. Read receipts go through the
-- function below so nobody can rewrite a message.
revoke all on public.messages from anon, authenticated;
grant select on public.messages to authenticated;
grant insert (client_id, body) on public.messages to authenticated;

-- Marks the other person's messages in a conversation as read.
create or replace function public.mark_messages_read(p_client uuid)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  n integer;
begin
  if auth.uid() is null or not (p_client = auth.uid() or public.is_coach()) then
    raise exception 'Conversation not found';
  end if;
  update public.messages set read_at = now()
   where client_id = p_client and read_at is null and sender_id <> auth.uid();
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function public.mark_messages_read(uuid) from public, anon;
grant execute on function public.mark_messages_read(uuid) to authenticated;

-- Live updates in the app (Supabase Realtime still applies the rules above).
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages') then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;
