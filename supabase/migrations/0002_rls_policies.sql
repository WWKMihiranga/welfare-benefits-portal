-- =============================================================================
-- Migration 0002 — Row Level Security
--
-- This is the security foundation. Every table is locked down so that:
--   * Members can only access rows tied to their own family_unit_id
--   * Admins can read/write everything
--   * Anonymous users see nothing
--
-- Performance notes applied throughout:
--   * Every auth.uid() / function call is wrapped in (select ...) so Postgres
--     evaluates it once per query, not once per row.
--   * Every policy is restricted to the `authenticated` role via TO clause.
--   * Helper functions are SECURITY DEFINER to bypass RLS recursion when
--     looking up the current user's role / family unit.
--   * Columns referenced in policies (family_unit_id) already have indexes.
-- =============================================================================

-- ---- Helper functions -------------------------------------------------------

-- Returns the role of the currently authenticated user.
-- SECURITY DEFINER so the function bypasses RLS on profiles (otherwise the
-- profile RLS policy would call this function, recursing forever).
create or replace function public.current_user_role()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid()
$$;

-- Returns the family_unit_id of the currently authenticated user.
-- Returns NULL for admins (who don't belong to a single family unit).
create or replace function public.current_user_family_unit_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select family_unit_id from public.profiles where id = auth.uid()
$$;

-- Convenience: is the current user an admin?
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) = 'admin',
    false
  )
$$;

-- Lock down the helper functions so untrusted clients can't call them
-- with arbitrary arguments. (They take no args, so this is belt-and-braces.)
revoke all on function public.current_user_role() from public;
revoke all on function public.current_user_family_unit_id() from public;
revoke all on function public.is_admin() from public;

grant execute on function public.current_user_role() to authenticated;
grant execute on function public.current_user_family_unit_id() to authenticated;
grant execute on function public.is_admin() to authenticated;

-- ---- Enable RLS on every public table ---------------------------------------

alter table public.profiles         enable row level security;
alter table public.family_units     enable row level security;
alter table public.persons          enable row level security;
alter table public.claims           enable row level security;
alter table public.claim_documents  enable row level security;
alter table public.audit_log        enable row level security;

-- =============================================================================
-- profiles
-- =============================================================================
-- Read:   user can read own profile; admins can read all
-- Update: user can update own profile (limited fields handled by app);
--         admins can update all
-- Insert: handled by the tg_handle_new_user trigger (SECURITY DEFINER);
--         no direct insert policy needed for either role
-- Delete: nobody can delete profiles directly; archive via auth.users

create policy "profiles_select_own_or_admin"
  on public.profiles
  for select
  to authenticated
  using (
    id = (select auth.uid())
    or (select public.is_admin())
  );

create policy "profiles_update_own"
  on public.profiles
  for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "profiles_admin_all"
  on public.profiles
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- =============================================================================
-- family_units
-- =============================================================================
-- Read:   member sees own unit; admin sees all
-- Write:  admin only

create policy "family_units_select_own_or_admin"
  on public.family_units
  for select
  to authenticated
  using (
    id = (select public.current_user_family_unit_id())
    or (select public.is_admin())
  );

create policy "family_units_admin_write"
  on public.family_units
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- =============================================================================
-- persons
-- =============================================================================
-- Read:   member sees persons in own unit; admin sees all
-- Write:  admin only (members are not allowed to edit their own family list;
--         that's a deliberate workflow choice — admins enroll the family)

create policy "persons_select_own_unit_or_admin"
  on public.persons
  for select
  to authenticated
  using (
    family_unit_id = (select public.current_user_family_unit_id())
    or (select public.is_admin())
  );

create policy "persons_admin_write"
  on public.persons
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- =============================================================================
-- claims
-- =============================================================================
-- Read:   member sees claims for own unit; admin sees all
-- Insert: member can insert a claim with status='pending' for own unit;
--         admin can insert any claim
-- Update: member can only update own draft (we may not use drafts in MVP);
--         admin can update status and admin_notes
-- Delete: nobody — claims are immutable; use status='reversed' instead

create policy "claims_select_own_unit_or_admin"
  on public.claims
  for select
  to authenticated
  using (
    family_unit_id = (select public.current_user_family_unit_id())
    or (select public.is_admin())
  );

-- Members can only insert claims for their own family unit, and only as
-- 'pending' or 'draft'. They cannot pre-approve their own claim.
create policy "claims_insert_member"
  on public.claims
  for insert
  to authenticated
  with check (
    family_unit_id = (select public.current_user_family_unit_id())
    and submitted_by = (select auth.uid())
    and status in ('draft', 'pending')
    and decided_by is null
    and decided_at is null
  );

create policy "claims_insert_admin"
  on public.claims
  for insert
  to authenticated
  with check ((select public.is_admin()));

-- Admins can update any claim (approve, reject, reverse, edit notes).
create policy "claims_update_admin"
  on public.claims
  for update
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- =============================================================================
-- claim_documents
-- =============================================================================
-- Mirrors the parent claim's access rules. Since this table doesn't have
-- family_unit_id directly, we join through claims.

create policy "claim_documents_select"
  on public.claim_documents
  for select
  to authenticated
  using (
    claim_id in (
      select id from public.claims
      where family_unit_id = (select public.current_user_family_unit_id())
    )
    or (select public.is_admin())
  );

-- Members can upload documents only for their own family's claims
create policy "claim_documents_insert_member"
  on public.claim_documents
  for insert
  to authenticated
  with check (
    uploaded_by = (select auth.uid())
    and claim_id in (
      select id from public.claims
      where family_unit_id = (select public.current_user_family_unit_id())
    )
  );

create policy "claim_documents_admin"
  on public.claim_documents
  for all
  to authenticated
  using ((select public.is_admin()))
  with check ((select public.is_admin()));

-- =============================================================================
-- audit_log
-- =============================================================================
-- Read:   admin only (the audit log is sensitive — it shows who did what)
-- Write:  nobody via API. The app inserts audit entries through server-side
--         code using the secret key (which bypasses RLS). This ensures audit
--         entries cannot be forged or suppressed by clients.

create policy "audit_log_admin_select"
  on public.audit_log
  for select
  to authenticated
  using ((select public.is_admin()));

-- No insert/update/delete policies → only the secret key (bypassrls) can write.
