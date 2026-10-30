-- Coach-managed folders and resources. A client must be permitted on both the
-- folder and the individual item; uploads remain in a private bucket.
create table if not exists public.shared_folders (
  id uuid primary key default gen_random_uuid(),
  coach_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  description text check (description is null or length(description) <= 1000),
  access_scope text not null default 'coach' check (access_scope in ('coach', 'selected', 'all')),
  client_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, coach_id)
);
create index if not exists shared_folders_coach_idx on public.shared_folders(coach_id, updated_at desc);
alter table public.shared_folders enable row level security;
revoke all on public.shared_folders from anon;
grant select, insert, update, delete on public.shared_folders to authenticated;
create policy "coach or invited client reads folders" on public.shared_folders for select to authenticated
  using (coach_id = (select auth.uid()) or (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'client')
    and (access_scope = 'all' or (access_scope = 'selected' and (select auth.uid()) = any(client_ids)))));
create policy "coach creates own folders" on public.shared_folders for insert to authenticated
  with check (coach_id = (select auth.uid()) and (select public.is_coach()));
create policy "coach updates own folders" on public.shared_folders for update to authenticated
  using (coach_id = (select auth.uid()) and (select public.is_coach()))
  with check (coach_id = (select auth.uid()) and (select public.is_coach()));
create policy "coach deletes own folders" on public.shared_folders for delete to authenticated
  using (coach_id = (select auth.uid()) and (select public.is_coach()));
create trigger touch_shared_folders before update on public.shared_folders
  for each row execute function public.touch_updated_at();

create table if not exists public.shared_files (
  id uuid primary key default gen_random_uuid(),
  folder_id uuid not null,
  coach_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 120),
  description text check (description is null or length(description) <= 1000),
  kind text not null check (kind in ('upload', 'link')),
  storage_path text unique,
  external_url text check (external_url is null or length(external_url) <= 4096),
  mime_type text,
  size_bytes bigint check (size_bytes is null or size_bytes between 0 and 104857600),
  access_scope text not null default 'coach' check (access_scope in ('coach', 'selected', 'all')),
  client_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (folder_id, coach_id) references public.shared_folders(id, coach_id) on delete cascade,
  check ((kind = 'upload' and storage_path is not null and external_url is null
      and split_part(storage_path, '/', 1) = coach_id::text)
    or (kind = 'link' and external_url is not null and external_url ~* '^https?://' and storage_path is null))
);
create index if not exists shared_files_folder_idx on public.shared_files(folder_id, updated_at desc);
alter table public.shared_files enable row level security;
revoke all on public.shared_files from anon;
grant select, insert, update, delete on public.shared_files to authenticated;
create policy "coach or invited client reads files" on public.shared_files for select to authenticated
  using (coach_id = (select auth.uid()) or (
    exists (select 1 from public.profiles p where p.id = (select auth.uid()) and p.role = 'client')
    and
    (access_scope = 'all' or (access_scope = 'selected' and (select auth.uid()) = any(client_ids)))
    and exists (select 1 from public.shared_folders f where f.id = folder_id and f.coach_id = coach_id
      and (f.access_scope = 'all' or (f.access_scope = 'selected' and (select auth.uid()) = any(f.client_ids))))));
create policy "coach creates own files" on public.shared_files for insert to authenticated
  with check (coach_id = (select auth.uid()) and (select public.is_coach()));
create policy "coach updates own files" on public.shared_files for update to authenticated
  using (coach_id = (select auth.uid()) and (select public.is_coach()))
  with check (coach_id = (select auth.uid()) and (select public.is_coach()));
create policy "coach deletes own files" on public.shared_files for delete to authenticated
  using (coach_id = (select auth.uid()) and (select public.is_coach()));
create trigger touch_shared_files before update on public.shared_files
  for each row execute function public.touch_updated_at();

insert into storage.buckets(id, name, public, file_size_limit)
values ('coach-files', 'coach-files', false, 104857600)
on conflict(id) do nothing;
create policy "coach uploads own shared files" on storage.objects for insert to authenticated
  with check (bucket_id = 'coach-files' and (select public.is_coach())
    and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "permitted client reads shared files" on storage.objects for select to authenticated
  using (bucket_id = 'coach-files' and (
    ((storage.foldername(name))[1] = (select auth.uid())::text and (select public.is_coach()))
    or exists (select 1 from public.shared_files sf where sf.storage_path = name
      and sf.coach_id::text = (storage.foldername(name))[1])));
create policy "coach removes own shared files" on storage.objects for delete to authenticated
  using (bucket_id = 'coach-files' and (select public.is_coach())
    and (storage.foldername(name))[1] = (select auth.uid())::text);
