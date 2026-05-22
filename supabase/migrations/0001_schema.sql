-- =============================================================================
-- Migration 0001 — Schema
--
-- The full database schema for the welfare portal. Order matters here:
-- enums → tables → indexes → triggers. RLS policies live in migration 0002.
--
-- Money convention: all monetary columns are INTEGER, storing LKR cents
-- (i.e. LKR 500,000 = 50000000). Never use FLOAT/NUMERIC for money in code,
-- and never display these values without dividing by 100.
--
-- Date convention: all timestamps are TIMESTAMPTZ stored in UTC. Display
-- conversion to Asia/Colombo happens in the application layer.
-- =============================================================================

-- ---- Enums ------------------------------------------------------------------

create type user_role as enum ('admin', 'member');

create type relationship as enum ('member', 'spouse', 'child');

create type claim_category as enum (
  'hospital_private',
  'hospital_government',
  'eye_care',
  'testing'
);

create type claim_status as enum (
  'draft',
  'pending',
  'approved',
  'rejected',
  'reversed'
);

-- ---- profiles ---------------------------------------------------------------
-- Links auth.users (managed by Supabase Auth) to a role and, for members,
-- to a family unit. One row per auth user.

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  role user_role not null default 'member',
  full_name text not null,
  family_unit_id uuid,                       -- null for admins; FK added below
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---- family_units -----------------------------------------------------------
-- Each committee member's family is a "family unit". The LKR 500,000 pool
-- is owned at this level and shared across all persons in the unit.

create table public.family_units (
  id uuid primary key default gen_random_uuid(),
  -- The committee member who owns this unit. We always create the unit and
  -- the committee member's profile together.
  member_profile_id uuid not null unique references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz                    -- soft delete
);

-- Now we can add the FK from profiles.family_unit_id → family_units.id
alter table public.profiles
  add constraint profiles_family_unit_id_fkey
  foreign key (family_unit_id) references public.family_units(id) on delete set null;

-- ---- persons ----------------------------------------------------------------
-- The actual humans in a family unit. The committee member, their spouse,
-- their children. Each row is one person.
--
-- is_committee_member denormalizes whether this person is the committee
-- member themselves (relevant for eye-care eligibility: only the member
-- and spouse are eligible). We enforce: exactly one is_committee_member
-- per family_unit (handled by the unique partial index below).

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  family_unit_id uuid not null references public.family_units(id) on delete restrict,
  full_name text not null,
  relationship relationship not null,
  is_committee_member boolean not null default false,
  date_of_birth date,
  nic text,                                  -- Sri Lanka National Identity Card
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz                    -- soft delete

  -- A child cannot be the committee member, etc.
  ,constraint persons_committee_relationship check (
    (is_committee_member and relationship = 'member')
    or (not is_committee_member and relationship in ('spouse', 'child'))
  )
);

-- Exactly one committee member per family unit
create unique index persons_one_committee_per_unit
  on public.persons (family_unit_id)
  where is_committee_member and archived_at is null;

-- A family unit has at most one spouse at a time
create unique index persons_one_spouse_per_unit
  on public.persons (family_unit_id)
  where relationship = 'spouse' and archived_at is null;

-- ---- claims -----------------------------------------------------------------
-- One row per claim submission. Eligibility is computed at submission time
-- AND re-verified at approval time (defense in depth).
--
-- Workflow:
--   draft     → member is editing, not yet submitted
--   pending   → submitted, awaiting admin review
--   approved  → admin approved, reimbursement final
--   rejected  → admin rejected, reason in admin_notes
--   reversed  → previously approved, then administratively reversed
--
-- Once approved or rejected, claims are immutable (except status changes
-- through the dedicated workflow). Mistakes are fixed by creating a
-- reversal entry.

create table public.claims (
  id uuid primary key default gen_random_uuid(),
  family_unit_id uuid not null references public.family_units(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  category claim_category not null,

  -- The date the medical service was rendered (not the date of submission)
  service_date date not null,

  -- The total bill amount the user submits, in LKR cents
  bill_amount_cents integer not null check (bill_amount_cents > 0),

  -- For hospital_government claims only: how many days the admission was
  days_count integer check (days_count is null or days_count > 0),

  -- Calculated by the eligibility engine. The amount we will reimburse.
  reimbursable_amount_cents integer not null check (reimbursable_amount_cents >= 0),

  status claim_status not null default 'pending',

  -- Who submitted (member or admin acting on member's behalf)
  submitted_by uuid not null references auth.users(id) on delete restrict,
  submitted_at timestamptz not null default now(),

  -- Who decided (approved/rejected/reversed)
  decided_by uuid references auth.users(id) on delete restrict,
  decided_at timestamptz,
  admin_notes text,

  -- Free-form member notes about the claim
  member_notes text,

  -- If this claim reverses an earlier one, point at it
  reverses_claim_id uuid references public.claims(id) on delete restrict,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- days_count is only meaningful for government hospital claims
  constraint claims_days_only_for_govt check (
    (category = 'hospital_government' and days_count is not null)
    or (category <> 'hospital_government' and days_count is null)
  ),

  -- Reimbursement cannot exceed the bill
  constraint claims_reimbursement_lte_bill check (
    reimbursable_amount_cents <= bill_amount_cents
  )
);

-- ---- claim_documents --------------------------------------------------------
-- Bill scans / supporting documents stored in Supabase Storage. We keep a
-- pointer here so we can list and authorize access.

create table public.claim_documents (
  id uuid primary key default gen_random_uuid(),
  claim_id uuid not null references public.claims(id) on delete cascade,
  storage_path text not null,                -- path inside the private bucket
  file_name text not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  uploaded_at timestamptz not null default now()
);

-- ---- audit_log --------------------------------------------------------------
-- Append-only record of every sensitive action. Never updated, never deleted.

create table public.audit_log (
  id bigserial primary key,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,                      -- e.g. 'claim.approved', 'member.created'
  entity_type text not null,                 -- e.g. 'claim', 'person', 'profile'
  entity_id uuid,
  details jsonb,                             -- structured context (old/new values, etc.)
  ip_address inet,
  created_at timestamptz not null default now()
);

-- ---- Indexes (for RLS policy performance and common queries) ----------------

-- profiles
create index profiles_family_unit_id_idx on public.profiles (family_unit_id)
  where family_unit_id is not null;

-- persons
create index persons_family_unit_id_idx on public.persons (family_unit_id);
create index persons_archived_idx on public.persons (archived_at)
  where archived_at is null;

-- claims (RLS will filter by family_unit_id; reports filter by status/date)
create index claims_family_unit_id_idx on public.claims (family_unit_id);
create index claims_status_idx on public.claims (status);
create index claims_service_date_idx on public.claims (service_date);
create index claims_person_id_idx on public.claims (person_id);
create index claims_category_idx on public.claims (category);

-- claim_documents
create index claim_documents_claim_id_idx on public.claim_documents (claim_id);

-- audit_log (queried by entity, by actor, and by time)
create index audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index audit_log_actor_idx on public.audit_log (actor_id);
create index audit_log_created_at_idx on public.audit_log (created_at desc);

-- ---- Triggers — auto-update updated_at --------------------------------------

create or replace function public.tg_set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger tg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.tg_set_updated_at();

create trigger tg_family_units_updated_at
  before update on public.family_units
  for each row execute function public.tg_set_updated_at();

create trigger tg_persons_updated_at
  before update on public.persons
  for each row execute function public.tg_set_updated_at();

create trigger tg_claims_updated_at
  before update on public.claims
  for each row execute function public.tg_set_updated_at();

-- ---- Helper: profile-creation trigger ---------------------------------------
-- When a new auth.users row is created (via Supabase Auth signup or invite),
-- automatically create a matching profiles row. The role and family_unit_id
-- are filled in later by admin actions.
--
-- We pull `full_name` from the user's `raw_user_meta_data` if present;
-- admins setting up a member will include it when sending the invite.

create or replace function public.tg_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, full_name, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', new.email, 'Unnamed'),
    coalesce((new.raw_user_meta_data->>'role')::user_role, 'member')
  );
  return new;
end;
$$;

create trigger tg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.tg_handle_new_user();
