-- =============================================================================
-- Migration 0005 — Reporting views
--
-- Two views to keep report queries simple and fast:
--   1. v_family_balances        — pool used + remaining per family unit
--   2. v_eye_care_status        — last eye-care date + next eligible date per person
--
-- Both use security_invoker so RLS from underlying tables applies — admins see
-- everything, members see only their own family.
-- =============================================================================

create or replace view public.v_family_balances
with (security_invoker = true)
as
with pool_usage as (
  select
    family_unit_id,
    coalesce(sum(reimbursable_amount_cents), 0)::bigint as pool_used_cents
  from public.claims
  where status = 'approved'
    and category in ('hospital_private', 'hospital_government', 'eye_care')
  group by family_unit_id
),
testing_usage_year as (
  select
    family_unit_id,
    extract(year from service_date)::int as year,
    coalesce(sum(reimbursable_amount_cents), 0)::bigint as testing_used_cents
  from public.claims
  where status = 'approved' and category = 'testing'
  group by family_unit_id, extract(year from service_date)
)
select
  fu.id                                                   as family_unit_id,
  fu.archived_at,
  p.full_name                                             as member_name,
  coalesce(pu.pool_used_cents, 0)                         as pool_used_cents,
  (50000000 - coalesce(pu.pool_used_cents, 0))::bigint    as pool_remaining_cents,
  coalesce(
    (select tu.testing_used_cents
     from testing_usage_year tu
     where tu.family_unit_id = fu.id
       and tu.year = extract(year from current_date)::int),
    0
  )::bigint                                               as testing_used_this_year_cents
from public.family_units fu
join public.profiles p on p.id = fu.member_profile_id
left join pool_usage pu on pu.family_unit_id = fu.id;

grant select on public.v_family_balances to authenticated;

-- ---- Eye care status per person --------------------------------------------
-- Lists every eligible person (committee member + spouse) with their last
-- eye-care claim date and the next date they become eligible (3 years later).

create or replace view public.v_eye_care_status
with (security_invoker = true)
as
with last_eye as (
  select
    person_id,
    max(service_date) as last_service_date
  from public.claims
  where status = 'approved' and category = 'eye_care'
  group by person_id
)
select
  p.id                                                    as person_id,
  p.family_unit_id,
  p.full_name,
  p.relationship,
  p.is_committee_member,
  le.last_service_date,
  case
    when le.last_service_date is null then null
    else (le.last_service_date + interval '3 years')::date
  end                                                     as next_eligible_date,
  case
    when le.last_service_date is null then true
    when le.last_service_date + interval '3 years' <= current_date then true
    else false
  end                                                     as currently_eligible
from public.persons p
left join last_eye le on le.person_id = p.id
where p.archived_at is null
  and (p.is_committee_member or p.relationship = 'spouse');

grant select on public.v_eye_care_status to authenticated;
