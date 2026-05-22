-- =============================================================================
-- Clean test data
--
-- Wipes ALL operational data from the dev project so it can be reused safely,
-- but PRESERVES:
--   * the schema (tables, RLS, functions, views)
--   * Storage bucket configuration
--   * Auth users (Supabase Auth manages these separately; we'll handle them
--     interactively in the dashboard since deleting auth users is destructive)
--   * The admin profile row (we re-link it to no family unit after cleanup)
--
-- HOW TO USE
--   1. Make sure you have a backup if you care about any of this data.
--   2. Open Supabase SQL Editor in your DEV project (NOT production).
--   3. Paste this whole file and Run.
--   4. After running, open Authentication → Users in the dashboard and
--      delete every test user EXCEPT your admin account.
--   5. Also delete the orphaned files in the claim-documents storage bucket
--      via Storage → claim-documents → select all → delete.
--
-- DOUBLE CHECK before running:
--   - Are you in the DEV project, not the production project?
--   - Is your admin email below correct? Update line marked ← change me.
-- =============================================================================

begin;

-- 1. Wipe all the operational tables. Order matters because of FKs.
--    Use TRUNCATE ... CASCADE so the bigserial in audit_log resets too.

truncate
  public.audit_log,
  public.claim_documents,
  public.claims,
  public.persons,
  public.family_units
restart identity cascade;

-- 2. Detach every profile from its (now-deleted) family unit. The auth
--    users themselves remain — you'll delete the test ones via the
--    dashboard in the next step.

update public.profiles
  set family_unit_id = null;

-- 3. Optional: demote everyone to 'member' except your one real admin.
--    This way, when you delete the test auth users in the dashboard,
--    you can't accidentally leave a stray admin profile behind.
--
--    ⬇️ Change this email to YOUR admin email before running.

update public.profiles
  set role = case
    when id = (
      select id from auth.users where email = 'admin@example.com'  -- ← change me
    ) then 'admin'
    else 'member'
  end;

-- 4. Quick verification — should return one row with role = 'admin'
--    and family_unit_id = null.

select id, full_name, role, family_unit_id
from public.profiles
where role = 'admin';

commit;

-- =============================================================================
-- Next steps (NOT in SQL — do these in the Supabase dashboard):
--
-- A) Delete test auth users
--    Authentication → Users
--    For every user EXCEPT your admin, click the ⋯ menu → Delete user.
--    The `on delete cascade` on profiles.id will remove the matching
--    profile row automatically.
--
-- B) Delete uploaded test files
--    Storage → claim-documents
--    Select all folders → Delete. The bucket itself stays.
--
-- C) Verify the admin still works
--    Sign out, sign back in. You should land on an empty dashboard
--    (0 members, 0 claims). That's correct.
-- =============================================================================
