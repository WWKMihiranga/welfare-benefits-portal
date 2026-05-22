/**
 * Database row types. These mirror the SQL schema in supabase/migrations.
 *
 * KEEP IN SYNC: when you change the schema, update this file too.
 * In a more mature setup, run `supabase gen types typescript --project-id …`
 * to regenerate automatically. For now we maintain by hand because the
 * schema is small.
 */

export type UserRole = "admin" | "member";
export type Relationship = "member" | "spouse" | "child";
export type ClaimCategory =
  | "hospital_private"
  | "hospital_government"
  | "eye_care"
  | "testing";
export type ClaimStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "reversed";

export interface Profile {
  id: string;
  role: UserRole;
  full_name: string;
  family_unit_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface FamilyUnit {
  id: string;
  member_profile_id: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Person {
  id: string;
  family_unit_id: string;
  full_name: string;
  relationship: Relationship;
  is_committee_member: boolean;
  date_of_birth: string | null;
  nic: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

export interface Claim {
  id: string;
  family_unit_id: string;
  person_id: string;
  category: ClaimCategory;
  service_date: string;
  bill_amount_cents: number;
  days_count: number | null;
  reimbursable_amount_cents: number;
  status: ClaimStatus;
  submitted_by: string;
  submitted_at: string;
  decided_by: string | null;
  decided_at: string | null;
  admin_notes: string | null;
  member_notes: string | null;
  reverses_claim_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface ClaimDocument {
  id: string;
  claim_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
}

export interface AuditLog {
  id: number;
  actor_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
  ip_address: string | null;
  created_at: string;
}
