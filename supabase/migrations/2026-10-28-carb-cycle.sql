-- Carb cycling. Run once on the live database:
-- Supabase dashboard -> SQL Editor -> New query -> paste all -> Run.
-- Safe to run again.
--
-- A nutrition plan can carry carbs for three kinds of day, e.g.
-- {"rest": 339, "training": 488, "legs": 563}. The app picks the kind from
-- the client's training plan for that date (rest day, leg day, any other
-- session) and uses those carbs instead of the plan's single carbs number.
-- Protein, fats and fibre stay the same every day.

alter table public.plan_assignments add column if not exists carb_cycle jsonb;
alter table public.plan_assignments drop constraint if exists plan_assignments_carb_cycle_check;
alter table public.plan_assignments add constraint plan_assignments_carb_cycle_check check (
  carb_cycle is null or (
    jsonb_typeof(carb_cycle) = 'object'
    and carb_cycle ?& array['rest', 'training', 'legs']
    and (carb_cycle - 'rest' - 'training' - 'legs') = '{}'::jsonb
    and jsonb_typeof(carb_cycle -> 'rest') = 'number' and (carb_cycle ->> 'rest')::numeric between 0 and 1000
    and jsonb_typeof(carb_cycle -> 'training') = 'number' and (carb_cycle ->> 'training')::numeric between 0 and 1000
    and jsonb_typeof(carb_cycle -> 'legs') = 'number' and (carb_cycle ->> 'legs')::numeric between 0 and 1000
    and protein_g is not null));

-- assign_nutrition() also takes p_targets.carb_cycle (same signature as before).
create or replace function public.assign_nutrition(
  p_client uuid, p_kind text, p_name text, p_starts_on date default current_date,
  p_plan jsonb default null, p_template uuid default null, p_targets jsonb default null, p_note text default null)
returns public.plan_assignments
language plpgsql
security definer
set search_path = ''
as $$
declare
  latest public.plan_assignments;
  plan   jsonb;
  row    public.plan_assignments;
  t_p int; t_c int; t_f int; t_fib int;
  t_cycle jsonb;
begin
  if not public.is_coach() then
    raise exception 'Only the coach can assign plans' using errcode = '42501';
  end if;
  if not exists (select 1 from public.profiles where id = p_client and role = 'client') then
    raise exception 'Client not found' using errcode = '22023';
  end if;
  if p_kind not in ('meal_plan', 'macros') then
    raise exception 'Choose a meal plan or macro targets' using errcode = '22023';
  end if;
  p_starts_on := coalesce(p_starts_on, current_date);

  select * into latest from public.plan_assignments where client_id = p_client order by version desc limit 1;
  if found then
    if p_starts_on < latest.starts_on then
      raise exception 'A new version cannot start before the current one (%)', latest.starts_on using errcode = '22023';
    end if;
    if p_starts_on < current_date - 1 then
      raise exception 'A new version cannot start in the past; history stays as it was' using errcode = '22023';
    end if;
  end if;

  if p_kind = 'meal_plan' then
    if p_plan is null and p_template is not null then
      select t.plan into plan from public.plan_templates t where t.id = p_template;
      if plan is null then
        raise exception 'Template not found' using errcode = '22023';
      end if;
    else
      plan := p_plan;
    end if;
    plan := public.nutrition_plan_snapshot(plan);
  end if;

  if p_targets is not null and p_targets <> 'null'::jsonb then
    t_p := (p_targets ->> 'protein_g')::int;
    t_c := (p_targets ->> 'carbs_g')::int;
    t_f := (p_targets ->> 'fats_g')::int;
    t_fib := (p_targets ->> 'fibre_g')::int;
    if jsonb_typeof(p_targets -> 'carb_cycle') = 'object' then
      t_cycle := jsonb_build_object(
        'rest', (p_targets -> 'carb_cycle' ->> 'rest')::int,
        'training', (p_targets -> 'carb_cycle' ->> 'training')::int,
        'legs', (p_targets -> 'carb_cycle' ->> 'legs')::int);
    end if;
  end if;

  update public.plan_assignments
     set ends_on = greatest(p_starts_on - 1, starts_on - 1)
   where client_id = p_client and (ends_on is null or ends_on >= p_starts_on);

  insert into public.plan_assignments (client_id, version, kind, name, template_id, plan,
                                       protein_g, carbs_g, fats_g, fibre_g, carb_cycle, starts_on, coach_note)
  values (p_client, coalesce(latest.version, 0) + 1, p_kind, coalesce(nullif(trim(p_name), ''), 'Nutrition plan'),
          case when p_kind = 'meal_plan' then p_template end, plan, t_p, t_c, t_f, t_fib, t_cycle, p_starts_on, p_note)
  returning * into row;
  return row;
end;
$$;
