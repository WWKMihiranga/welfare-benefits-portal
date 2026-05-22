import "server-only";
import { createClient } from "@/lib/supabase/server";

/**
 * Helpers for report queries. All admin-only — callers must verify role
 * before invoking.
 */

export interface UsageByCategoryRow {
  category: string;
  claim_count: number;
  total_bill_cents: number;
  total_reimbursed_cents: number;
}

/**
 * Sum approved claims grouped by category within an optional date range.
 * Dates are inclusive, on `service_date`.
 */
export async function getUsageByCategory(
  fromDate?: string,
  toDate?: string
): Promise<UsageByCategoryRow[]> {
  const supabase = await createClient();

  let q = supabase
    .from("claims")
    .select("category, bill_amount_cents, reimbursable_amount_cents")
    .eq("status", "approved");

  if (fromDate) q = q.gte("service_date", fromDate);
  if (toDate) q = q.lte("service_date", toDate);

  const { data, error } = await q;
  if (error) throw new Error(error.message);

  // Aggregate in app code — this dataset is small enough (<= a few thousand
  // approved claims at any time for a 200-1000 member org) that this is fine
  // and saves us a SQL RPC. If the dataset grows large, switch to a SQL RPC.
  const acc = new Map<string, UsageByCategoryRow>();
  for (const c of data ?? []) {
    const cat = c.category as string;
    const existing = acc.get(cat) ?? {
      category: cat,
      claim_count: 0,
      total_bill_cents: 0,
      total_reimbursed_cents: 0,
    };
    existing.claim_count += 1;
    existing.total_bill_cents += c.bill_amount_cents ?? 0;
    existing.total_reimbursed_cents += c.reimbursable_amount_cents ?? 0;
    acc.set(cat, existing);
  }
  return Array.from(acc.values()).sort((a, b) =>
    a.category.localeCompare(b.category)
  );
}

export interface FamilyBalanceRow {
  family_unit_id: string;
  member_name: string;
  pool_used_cents: number;
  pool_remaining_cents: number;
  testing_used_this_year_cents: number;
}

export async function getFamilyBalances(): Promise<FamilyBalanceRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_family_balances")
    .select("*")
    .is("archived_at", null)
    .order("pool_used_cents", { ascending: false });

  if (error) throw new Error(error.message);
  return (data ?? []) as FamilyBalanceRow[];
}

export interface EyeCareStatusRow {
  person_id: string;
  family_unit_id: string;
  full_name: string;
  relationship: string;
  is_committee_member: boolean;
  last_service_date: string | null;
  next_eligible_date: string | null;
  currently_eligible: boolean;
}

/**
 * People whose 3-year eye-care window is opening soon (within the next 90
 * days) or who have never claimed. Sorted by who becomes eligible first.
 */
export async function getUpcomingEyeCareEligibility(): Promise<
  EyeCareStatusRow[]
> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("v_eye_care_status")
    .select("*");

  if (error) throw new Error(error.message);

  const today = new Date();
  const cutoff = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);
  const cutoffStr = cutoff.toISOString().slice(0, 10);

  return ((data ?? []) as EyeCareStatusRow[])
    .filter((r) => {
      if (r.currently_eligible) return true;
      if (!r.next_eligible_date) return true;
      return r.next_eligible_date <= cutoffStr;
    })
    .sort((a, b) => {
      const an = a.next_eligible_date ?? "0000-00-00";
      const bn = b.next_eligible_date ?? "0000-00-00";
      return an.localeCompare(bn);
    });
}

export interface AuditLogRow {
  id: number;
  created_at: string;
  actor_name: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
}

/**
 * Recent audit log entries with actor name joined in (best-effort — if the
 * actor's profile has been deleted, name is null).
 */
export async function getRecentAuditLog(
  limit = 100
): Promise<AuditLogRow[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, created_at, action, entity_type, entity_id, details, actor_id")
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  const rows = (data ?? []) as Array<{
    id: number;
    created_at: string;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, unknown> | null;
    actor_id: string | null;
  }>;

  // Resolve actor names in one batched lookup
  const actorIds = Array.from(
    new Set(rows.map((r) => r.actor_id).filter((x): x is string => !!x))
  );

  const nameById = new Map<string, string>();
  if (actorIds.length > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", actorIds);
    for (const p of profiles ?? []) {
      nameById.set(p.id, p.full_name);
    }
  }

  return rows.map((row) => ({
    id: row.id,
    created_at: row.created_at,
    action: row.action,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    details: row.details,
    actor_name: row.actor_id ? nameById.get(row.actor_id) ?? null : null,
  }));
}
