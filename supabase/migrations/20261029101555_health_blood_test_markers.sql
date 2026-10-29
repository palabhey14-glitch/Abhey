-- Extend health readings with blood-test results. No results are imported.
begin;
alter table public.health_marker_readings
  alter column value type numeric(14,6),
  alter column secondary_value type numeric(14,6),
  alter column taken_at drop not null,
  add column reading_unit text,
  add column result_qualifier text not null default '=' check (result_qualifier in ('=', '<', '>')),
  add column reference_range text check (reference_range is null or length(reference_range) <= 120),
  add column lab_name text check (lab_name is null or length(lab_name) <= 120);

alter table public.health_marker_readings drop constraint health_marker_readings_marker_check;
alter table public.health_marker_readings add constraint health_marker_readings_marker_check check (marker in (
  'heart_rate','resting_heart_rate','hrv','blood_glucose','blood_pressure','body_temperature','respiratory_rate',
  'free_testosterone','total_testosterone','shbg','estradiol','tsh','free_t4','free_t3',
  'total_cholesterol','ldl_cholesterol','hdl_cholesterol','triglycerides'
));
alter table public.health_marker_readings drop constraint health_marker_value_bounds;
alter table public.health_marker_readings add constraint health_marker_value_bounds check (
  (marker = 'heart_rate' and value between 1 and 350) or
  (marker = 'resting_heart_rate' and value between 1 and 300) or
  (marker = 'hrv' and value between 0 and 1000) or
  (marker = 'blood_glucose' and value between 0.1 and 100) or
  (marker = 'blood_pressure' and value between 1 and 400) or
  (marker = 'body_temperature' and value between 20 and 50) or
  (marker = 'respiratory_rate' and value between 1 and 150) or
  (marker in ('free_testosterone','total_testosterone','shbg','estradiol','tsh','free_t4','free_t3','total_cholesterol','ldl_cholesterol','hdl_cholesterol','triglycerides') and value between 0 and 99999999)
);
alter table public.health_marker_readings add constraint health_marker_lab_units check (
  case marker
    when 'free_testosterone' then reading_unit is not null and reading_unit in ('pmol/L','pg/mL','ng/dL','nmol/L')
    when 'total_testosterone' then reading_unit is not null and reading_unit in ('nmol/L','ng/dL')
    when 'shbg' then reading_unit is not null and reading_unit = 'nmol/L'
    when 'estradiol' then reading_unit is not null and reading_unit in ('pmol/L','pg/mL')
    when 'tsh' then reading_unit is not null and reading_unit in ('mIU/L','µIU/mL')
    when 'free_t4' then reading_unit is not null and reading_unit in ('pmol/L','ng/dL')
    when 'free_t3' then reading_unit is not null and reading_unit in ('pmol/L','pg/mL')
    when 'total_cholesterol' then reading_unit is not null and reading_unit in ('mmol/L','mg/dL')
    when 'ldl_cholesterol' then reading_unit is not null and reading_unit in ('mmol/L','mg/dL')
    when 'hdl_cholesterol' then reading_unit is not null and reading_unit in ('mmol/L','mg/dL')
    when 'triglycerides' then reading_unit is not null and reading_unit in ('mmol/L','mg/dL')
    else reading_unit is null and result_qualifier = '=' and reference_range is null and lab_name is null
  end
);
alter table public.health_marker_readings add constraint health_marker_time_required check (
  marker in ('free_testosterone','total_testosterone','shbg','estradiol','tsh','free_t4','free_t3','total_cholesterol','ldl_cholesterol','hdl_cholesterol','triglycerides') or taken_at is not null
);
create index health_marker_readings_user_marker_day_idx on public.health_marker_readings(user_id, marker, day desc);
-- Existing ownership and coach read policies continue to protect these rows.
commit;
