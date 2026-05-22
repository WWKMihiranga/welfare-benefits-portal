-- =============================================================================
-- Seed — create the first admin user
--
-- This is NOT run automatically. You run it manually ONCE after applying
-- migrations, replacing the email below with your real admin email.
--
-- Why manually? Because Supabase Auth has its own user-creation flow
-- (passwords are hashed, email confirmation handled, etc.) so we use it
-- via the dashboard. Then we promote that user to admin with this script.
--
-- Steps:
--   1. In the Supabase Dashboard, go to Authentication → Users → Add user
--      → Create new user. Tick "Auto confirm user". Use your admin email.
--   2. Run the SQL below in the Supabase SQL Editor, replacing the email.
-- =============================================================================

update public.profiles
set role = 'admin',
    full_name = 'Administrator'             -- Edit this to your name
where id = (
  select id from auth.users where email = 'admin@example.com'   -- ← change me
);

-- Verify it worked
select id, full_name, role, family_unit_id
from public.profiles
where role = 'admin';
