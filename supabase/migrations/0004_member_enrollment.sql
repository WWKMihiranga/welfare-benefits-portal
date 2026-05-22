-- =============================================================================
-- Migration 0004 — Member-enrollment stored procedure
--
-- Once an admin has invited an auth user (via supabase.auth.admin.inviteUserByEmail),
-- this procedure finishes the enrollment: it creates the family_unit, links the
-- profile to it, and inserts the member + spouse + children persons rows — all
-- in one database transaction. Either everything happens or nothing does.
--
-- We do this in SQL rather than a series of supabase-js calls because:
--   1. supabase-js doesn't expose true multi-statement transactions
--   2. Doing it server-side is faster (one round trip)
--   3. The transaction guarantee is unambiguous
--
-- The caller (a server action with admin auth) supplies the auth_user_id of
-- the just-invited user. SECURITY DEFINER lets the procedure bypass the
-- admin-only RLS on persons/family_units, which is safe because:
--   - We're going to make the procedure callable only by the `service_role`
--     (the admin client). Members cannot call it.
-- =============================================================================

create or replace function public.fn_complete_member_enrollment(
  p_auth_user_id uuid,
  p_member_full_name text,
  p_member_nic text default null,
  p_member_dob date default null,
  p_spouse_full_name text default null,
  p_spouse_nic text default null,
  p_spouse_dob date default null,
  p_children jsonb default '[]'::jsonb     -- [{full_name, nic, dob}]
)
returns table (family_unit_id uuid, member_person_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_family_unit_id uuid;
  v_member_person_id uuid;
  v_child jsonb;
begin
  -- 1. Ensure the profile row exists (the on-auth trigger should already
  --    have created it). Update full_name to the canonical value the admin
  --    typed in the form.
  update public.profiles
    set full_name = p_member_full_name,
        role = 'member'
    where id = p_auth_user_id;

  if not found then
    -- Shouldn't happen — trigger creates rows on auth.users insert
    raise exception 'Profile not found for auth user %', p_auth_user_id;
  end if;

  -- 2. Create the family_unit
  insert into public.family_units (member_profile_id)
  values (p_auth_user_id)
  returning id into v_family_unit_id;

  -- 3. Link the profile to the family_unit
  update public.profiles
    set family_unit_id = v_family_unit_id
    where id = p_auth_user_id;

  -- 4. Insert the committee member as a person
  insert into public.persons (
    family_unit_id, full_name, relationship, is_committee_member,
    date_of_birth, nic
  )
  values (
    v_family_unit_id, p_member_full_name, 'member', true,
    p_member_dob, p_member_nic
  )
  returning id into v_member_person_id;

  -- 5. Insert spouse if provided
  if p_spouse_full_name is not null then
    insert into public.persons (
      family_unit_id, full_name, relationship, is_committee_member,
      date_of_birth, nic
    )
    values (
      v_family_unit_id, p_spouse_full_name, 'spouse', false,
      p_spouse_dob, p_spouse_nic
    );
  end if;

  -- 6. Insert children
  for v_child in select * from jsonb_array_elements(p_children) loop
    insert into public.persons (
      family_unit_id, full_name, relationship, is_committee_member,
      date_of_birth, nic
    )
    values (
      v_family_unit_id,
      v_child->>'full_name',
      'child',
      false,
      nullif(v_child->>'date_of_birth', '')::date,
      nullif(v_child->>'nic', '')
    );
  end loop;

  return query select v_family_unit_id, v_member_person_id;
end;
$$;

-- Lock it down: only the admin (service_role) can call this.
revoke all on function public.fn_complete_member_enrollment from public;
revoke all on function public.fn_complete_member_enrollment from authenticated;
revoke all on function public.fn_complete_member_enrollment from anon;
grant execute on function public.fn_complete_member_enrollment to service_role;

-- =============================================================================
-- Helper view: family units with their committee member's basic info.
-- Used by the Member Directory. Inherits RLS from underlying tables via
-- security_invoker = true.
-- =============================================================================

create or replace view public.v_family_units_summary
with (security_invoker = true)
as
select
  fu.id                              as family_unit_id,
  fu.archived_at,
  fu.created_at                      as enrolled_at,
  p_profile.full_name                as member_name,
  p_member.id                        as member_person_id,
  (
    select count(*) from public.persons p
    where p.family_unit_id = fu.id and p.archived_at is null
  )                                  as person_count
from public.family_units fu
join public.profiles p_profile on p_profile.id = fu.member_profile_id
left join public.persons p_member
  on p_member.family_unit_id = fu.id
  and p_member.is_committee_member
  and p_member.archived_at is null;

grant select on public.v_family_units_summary to authenticated;
