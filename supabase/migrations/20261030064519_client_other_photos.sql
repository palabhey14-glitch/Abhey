-- Client-owned photos outside weekly check-ins. Objects use the existing
-- private progress-photos bucket under <user_id>/gallery/.
create table if not exists public.client_other_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  caption text check (caption is null or length(caption) <= 120),
  created_at timestamptz not null default now(),
  constraint client_other_photos_gallery_path check (
    storage_path like user_id::text || '/gallery/%'
  )
);

create index if not exists client_other_photos_user_created_idx
  on public.client_other_photos (user_id, created_at desc);
alter table public.client_other_photos enable row level security;
revoke all on public.client_other_photos from anon;
grant select, insert, delete on public.client_other_photos to authenticated;

create policy "client reads own other photos" on public.client_other_photos
  for select to authenticated using (user_id = (select auth.uid()));
create policy "client adds own other photos" on public.client_other_photos
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "client deletes own other photos" on public.client_other_photos
  for delete to authenticated using (user_id = (select auth.uid()));
