-- PROPOSED, NOT RUN. Optional consent choices from the app's privacy screen.
-- Run in the Supabase SQL Editor only after Abhey approves the consent proposal.
-- Clients may set or clear their own values; the existing profiles policies
-- already limit updates to the client's own row.
begin;
alter table public.profiles
  add column if not exists marketing_consent_at timestamptz,
  add column if not exists photo_share_consent_at timestamptz;
grant update (marketing_consent_at, photo_share_consent_at) on public.profiles to authenticated;
comment on column public.profiles.marketing_consent_at is 'When the client opted in to marketing email. Null = no.';
comment on column public.profiles.photo_share_consent_at is 'When the client agreed Abhey may ask before sharing photos or results publicly. Null = no.';
commit;
