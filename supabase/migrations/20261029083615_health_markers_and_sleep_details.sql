-- Additive only. No imported readings and no changes to existing app colours or plans.
begin;

create table public.health_marker_readings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  day date not null check (day <= current_date + 1),
  taken_at time not null,
  marker text not null check (marker in ('heart_rate', 'resting_heart_rate', 'hrv', 'blood_glucose', 'blood_pressure', 'body_temperature', 'respiratory_rate')),
  value numeric(7,2) not null,
  secondary_value numeric(7,2),
  notes text check (notes is null or length(notes) <= 500),
  created_at timestamptz not null default now(),
  constraint health_marker_value_bounds check (
    (marker = 'heart_rate' and value between 1 and 350) or
    (marker = 'resting_heart_rate' and value between 1 and 300) or
    (marker = 'hrv' and value between 0 and 1000) or
    (marker = 'blood_glucose' and value between 0.1 and 100) or
    (marker = 'blood_pressure' and value between 1 and 400) or
    (marker = 'body_temperature' and value between 20 and 50) or
    (marker = 'respiratory_rate' and value between 1 and 150)
  ),
  constraint health_marker_pressure_pair check (
    (marker = 'blood_pressure' and secondary_value is not null and secondary_value between 1 and 300 and secondary_value < value)
    or (marker <> 'blood_pressure' and secondary_value is null)
  )
);
create index health_marker_readings_user_day_idx on public.health_marker_readings(user_id, day, taken_at, id);
alter table public.health_marker_readings enable row level security;
revoke all on public.health_marker_readings from anon, authenticated;
grant select, insert, update on public.health_marker_readings to authenticated;
create policy "clients and coach read health readings" on public.health_marker_readings
  for select to authenticated using (user_id = (select auth.uid()) or (select public.is_coach()));
create policy "clients add own health readings" on public.health_marker_readings
  for insert to authenticated with check (user_id = (select auth.uid()));
create policy "clients edit own health readings" on public.health_marker_readings
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Duration stays in daily_logs.sleep_h, shared with the existing Sleep habit.
-- Extra details and device scores are optional and are never estimated.
alter table public.daily_logs
  add column sleep_bedtime time,
  add column sleep_core_min int check (sleep_core_min between 0 and 960),
  add column sleep_rem_min int check (sleep_rem_min between 0 and 960),
  add column sleep_deep_min int check (sleep_deep_min between 0 and 960),
  add column sleep_awake_min int check (sleep_awake_min between 0 and 960),
  add column sleep_latency_min int check (sleep_latency_min between 0 and 960),
  add column sleep_efficiency_pct numeric(4,1) check (sleep_efficiency_pct between 0 and 100),
  add column sleep_restfulness_pct numeric(4,1) check (sleep_restfulness_pct between 0 and 100),
  add column sleep_score int check (sleep_score between 0 and 100),
  add column sleep_interruptions int check (sleep_interruptions between 0 and 200),
  add column sleep_rhr_bpm int check (sleep_rhr_bpm between 1 and 300),
  add column sleep_hrv_ms numeric(6,1) check (sleep_hrv_ms between 0 and 1000);
-- No new total-stage constraint on daily_logs: the existing duration-only
-- habit can be edited independently. Detailed entry validates stage totals.
commit;
