"use server";

import { revalidatePath } from "next/cache";
import { requireUser, requireAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit/log";
import {
  submitClaimSchema,
  previewEligibilitySchema,
  decideClaimSchema,
} from "@/lib/validation/claims";
import { evaluateClaim } from "@/lib/eligibility/engine";
import { rupeesToCents } from "@/lib/utils/format";
import type {
  ClaimRequest,
  EligibilityContext,
  EligibilityDecision,
  HistoricalClaim,
} from "@/lib/eligibility/types";

export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

// =============================================================================
// Helpers
// =============================================================================

/**
 * Load all approved claims for a family unit, scoped down to what the
 * eligibility engine needs. The current claim being evaluated is excluded
 * (for re-evaluation at approval time).
 */
async function loadHistory(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  familyUnitId: string,
  excludeClaimId?: string
): Promise<HistoricalClaim[]> {
  let q = supabase
    .from("claims")
    .select("id, category, status, person_id, service_date, reimbursable_amount_cents")
    .eq("family_unit_id", familyUnitId);

  if (excludeClaimId) {
    q = q.neq("id", excludeClaimId);
  }

  const { data, error } = await q;
  if (error) throw new Error(`History load failed: ${error.message}`);
  return (data ?? []) as HistoricalClaim[];
}

/**
 * Verify a person belongs to the given family unit AND is not archived.
 * Returns the is_committee_member / spouse flag the engine needs.
 */
async function loadPerson(
  supabase: Awaited<ReturnType<typeof import("@/lib/supabase/server").createClient>>,
  personId: string,
  familyUnitId: string
) {
  const { data, error } = await supabase
    .from("persons")
    .select("id, family_unit_id, relationship, is_committee_member, archived_at, full_name")
    .eq("id", personId)
    .single();

  if (error || !data) return null;
  if (data.family_unit_id !== familyUnitId) return null;
  if (data.archived_at) return null;
  return data;
}

// =============================================================================
// Preview eligibility (live UI feedback)
// =============================================================================

/**
 * Run the eligibility engine without writing anything. Used by the claim
 * submission form to show the member what they'd get if they submitted.
 *
 * This is safe to call frequently — it's a pure read.
 */
export async function previewEligibility(
  input: unknown
): Promise<ActionResult<EligibilityDecision & { person_name: string }>> {
  const { profile, supabase } = await requireUser();

  const parsed = previewEligibilitySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid preview input",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const i = parsed.data;

  // Members can only preview for their own family. Admins can preview for
  // any family — but we need to know which family the person belongs to.
  // We resolve the family unit from the person.
  const { data: personRow } = await supabase
    .from("persons")
    .select("id, family_unit_id, relationship, is_committee_member, full_name, archived_at")
    .eq("id", i.person_id)
    .single();

  if (!personRow || personRow.archived_at) {
    return { ok: false, error: "Person not found." };
  }

  // If the user is a regular member, they can only preview within their own family.
  if (profile.role !== "admin" && personRow.family_unit_id !== profile.family_unit_id) {
    return { ok: false, error: "You can only submit claims for your own family." };
  }

  const history = await loadHistory(supabase, personRow.family_unit_id);

  const isMemberOrSpouse =
    personRow.is_committee_member || personRow.relationship === "spouse";

  const request: ClaimRequest = {
    category: i.category,
    person_id: i.person_id,
    bill_amount_cents: rupeesToCents(i.bill_amount_rupees),
    days_count: i.days_count,
  };

  const context: EligibilityContext = {
    history,
    service_date: i.service_date,
    is_member_or_spouse: isMemberOrSpouse,
  };

  const decision = evaluateClaim(request, context);
  return { ok: true, data: { ...decision, person_name: personRow.full_name } };
}

// =============================================================================
// Submit a claim
// =============================================================================

export async function submitClaim(
  input: unknown
): Promise<ActionResult<{ claim_id: string; reimbursable_amount_cents: number }>> {
  const { user, profile, supabase } = await requireUser();

  const parsed = submitClaimSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const i = parsed.data;

  // Resolve the family unit from the person, and verify ownership.
  // For members: family must match their own. For admins: any family is fine.
  const { data: personRow } = await supabase
    .from("persons")
    .select("id, family_unit_id, relationship, is_committee_member, archived_at")
    .eq("id", i.person_id)
    .single();

  if (!personRow || personRow.archived_at) {
    return { ok: false, error: "Person not found." };
  }

  if (profile.role !== "admin" && personRow.family_unit_id !== profile.family_unit_id) {
    return { ok: false, error: "You can only submit claims for your own family." };
  }

  // Run eligibility — this is the authoritative computation.
  const history = await loadHistory(supabase, personRow.family_unit_id);
  const isMemberOrSpouse =
    personRow.is_committee_member || personRow.relationship === "spouse";

  const billCents = rupeesToCents(i.bill_amount_rupees);
  const request: ClaimRequest = {
    category: i.category,
    person_id: i.person_id,
    bill_amount_cents: billCents,
    days_count: i.days_count,
  };
  const decision = evaluateClaim(request, {
    history,
    service_date: i.service_date,
    is_member_or_spouse: isMemberOrSpouse,
  });

  // Insert the claim. RLS verifies family ownership + status restriction
  // for members (must be 'pending' and submitted_by = own user).
  const { data: inserted, error: insertError } = await supabase
    .from("claims")
    .insert({
      family_unit_id: personRow.family_unit_id,
      person_id: i.person_id,
      category: i.category,
      service_date: i.service_date,
      bill_amount_cents: billCents,
      days_count: i.category === "hospital_government" ? i.days_count : null,
      reimbursable_amount_cents: decision.reimbursable_amount_cents,
      status: "pending",
      submitted_by: user.id,
      member_notes: i.member_notes ?? null,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return {
      ok: false,
      error: insertError?.message ?? "Could not submit the claim.",
    };
  }

  await writeAudit({
    actorId: user.id,
    action: "claim.submitted",
    entityType: "claim",
    entityId: inserted.id,
    details: {
      category: i.category,
      bill_amount_cents: billCents,
      reimbursable_amount_cents: decision.reimbursable_amount_cents,
      service_date: i.service_date,
      person_id: i.person_id,
    },
  });

  revalidatePath("/claims");
  revalidatePath("/dashboard");

  return {
    ok: true,
    data: {
      claim_id: inserted.id,
      reimbursable_amount_cents: decision.reimbursable_amount_cents,
    },
  };
}

// =============================================================================
// Decide a claim (admin only)
// =============================================================================

/**
 * Approve or reject a claim. On approval, the reimbursement is re-computed
 * server-side — never trusting the value stored at submission time. This
 * guards against any tampering between submission and approval (e.g. another
 * claim approved in between that consumed pool balance).
 *
 * The admin may override the calculated amount, but must provide a note.
 */
export async function decideClaim(
  input: unknown
): Promise<ActionResult<{ claim_id: string; status: string }>> {
  const { user, supabase } = await requireAdmin();

  const parsed = decideClaimSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Invalid input.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
    };
  }
  const i = parsed.data;

  // Load the claim
  const { data: claim, error: loadError } = await supabase
    .from("claims")
    .select("*")
    .eq("id", i.claim_id)
    .single();

  if (loadError || !claim) {
    return { ok: false, error: "Claim not found." };
  }
  if (claim.status !== "pending") {
    return {
      ok: false,
      error: `Claim is already ${claim.status} and cannot be changed.`,
    };
  }

  let newReimbursementCents = claim.reimbursable_amount_cents;
  let auditDetails: Record<string, unknown> = {
    decision: i.decision,
    previous_status: claim.status,
  };

  if (i.decision === "approve") {
    // Re-run eligibility at approval time using current history.
    const { data: personRow } = await supabase
      .from("persons")
      .select("relationship, is_committee_member")
      .eq("id", claim.person_id)
      .single();

    if (!personRow) {
      return { ok: false, error: "Claim's person could not be loaded." };
    }

    const history = await loadHistory(supabase, claim.family_unit_id, claim.id);
    const decision = evaluateClaim(
      {
        category: claim.category,
        person_id: claim.person_id,
        bill_amount_cents: claim.bill_amount_cents,
        days_count: claim.days_count ?? undefined,
      },
      {
        history,
        service_date: claim.service_date,
        is_member_or_spouse:
          personRow.is_committee_member || personRow.relationship === "spouse",
      }
    );

    newReimbursementCents = decision.reimbursable_amount_cents;

    if (i.override_amount_rupees !== undefined) {
      const overrideCents = rupeesToCents(i.override_amount_rupees);
      if (overrideCents > claim.bill_amount_cents) {
        return {
          ok: false,
          error: "Override cannot exceed the bill amount.",
        };
      }
      auditDetails.computed_amount_cents = decision.reimbursable_amount_cents;
      auditDetails.override_amount_cents = overrideCents;
      newReimbursementCents = overrideCents;
    } else {
      auditDetails.computed_amount_cents = decision.reimbursable_amount_cents;
    }
  } else {
    // Rejecting — reimbursement amount becomes 0
    newReimbursementCents = 0;
  }

  const newStatus = i.decision === "approve" ? "approved" : "rejected";

  const { error: updateError } = await supabase
    .from("claims")
    .update({
      status: newStatus,
      reimbursable_amount_cents: newReimbursementCents,
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      admin_notes: i.admin_notes ?? null,
    })
    .eq("id", i.claim_id)
    .eq("status", "pending"); // optimistic concurrency check

  if (updateError) {
    return {
      ok: false,
      error: `Could not save decision: ${updateError.message}`,
    };
  }

  await writeAudit({
    actorId: user.id,
    action: `claim.${newStatus}`,
    entityType: "claim",
    entityId: i.claim_id,
    details: auditDetails,
  });

  revalidatePath("/claims");
  revalidatePath(`/claims/${i.claim_id}`);
  revalidatePath("/dashboard");

  return { ok: true, data: { claim_id: i.claim_id, status: newStatus } };
}

// =============================================================================
// Reverse an approved claim (admin only)
// =============================================================================

export async function reverseClaim(
  claimId: string,
  reason: string
): Promise<ActionResult<{ claim_id: string }>> {
  const { user, supabase } = await requireAdmin();

  if (!/^[0-9a-f-]{36}$/i.test(claimId)) {
    return { ok: false, error: "Invalid claim id." };
  }
  if (!reason || reason.trim().length < 5) {
    return {
      ok: false,
      error: "Please provide a reason for the reversal (at least 5 characters).",
    };
  }

  const { data: claim } = await supabase
    .from("claims")
    .select("status")
    .eq("id", claimId)
    .single();

  if (!claim) return { ok: false, error: "Claim not found." };
  if (claim.status !== "approved") {
    return {
      ok: false,
      error: "Only approved claims can be reversed.",
    };
  }

  const { error } = await supabase
    .from("claims")
    .update({
      status: "reversed",
      decided_by: user.id,
      decided_at: new Date().toISOString(),
      admin_notes: reason.trim(),
    })
    .eq("id", claimId)
    .eq("status", "approved");

  if (error) {
    return { ok: false, error: `Could not reverse: ${error.message}` };
  }

  await writeAudit({
    actorId: user.id,
    action: "claim.reversed",
    entityType: "claim",
    entityId: claimId,
    details: { reason },
  });

  revalidatePath("/claims");
  revalidatePath(`/claims/${claimId}`);
  return { ok: true, data: { claim_id: claimId } };
}

// =============================================================================
// Document signed-URL generators
// =============================================================================

/**
 * Generate a signed URL the client uses to download a bill scan. Verifies
 * the requester has access to the parent claim before issuing the URL.
 * URL expires in 60 seconds — plenty for the browser to start the download.
 */
export async function getDocumentSignedUrl(
  documentId: string
): Promise<ActionResult<{ url: string; file_name: string }>> {
  const { profile, supabase } = await requireUser();

  const { data: doc, error } = await supabase
    .from("claim_documents")
    .select("storage_path, file_name, claim_id, claims(family_unit_id)")
    .eq("id", documentId)
    .single();

  if (error || !doc) {
    return { ok: false, error: "Document not found." };
  }

  // Belt-and-braces — RLS already filters above, but check explicitly.
  const familyUnitId = Array.isArray(doc.claims)
    ? doc.claims[0]?.family_unit_id
    : (doc.claims as { family_unit_id: string } | null)?.family_unit_id;

  if (
    profile.role !== "admin" &&
    familyUnitId !== profile.family_unit_id
  ) {
    return { ok: false, error: "Not allowed." };
  }

  // Use the admin client to mint the signed URL — Supabase storage signed-URL
  // creation only works with elevated auth in some configurations.
  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage
    .from("claim-documents")
    .createSignedUrl(doc.storage_path, 60);

  if (signError || !signed) {
    return { ok: false, error: "Could not generate download link." };
  }

  return { ok: true, data: { url: signed.signedUrl, file_name: doc.file_name } };
}

/**
 * Record a successful upload in claim_documents. Called by the client AFTER
 * a successful upload via the user's own Supabase Storage client. We verify
 * the path follows our convention to prevent forged metadata.
 */
export async function registerClaimDocument(input: {
  claim_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
}): Promise<ActionResult<{ document_id: string }>> {
  const { user, profile, supabase } = await requireUser();

  // Validate the storage path format: {family_unit_id}/{claim_id}/{filename}
  const parts = input.storage_path.split("/");
  if (parts.length !== 3) {
    return { ok: false, error: "Invalid storage path." };
  }
  const [pathFamilyUnit, pathClaimId] = parts;
  if (pathClaimId !== input.claim_id) {
    return { ok: false, error: "Storage path doesn't match claim id." };
  }

  // For members, verify the path's family unit matches their own.
  if (profile.role !== "admin" && pathFamilyUnit !== profile.family_unit_id) {
    return { ok: false, error: "Not allowed." };
  }

  // Verify the claim exists and belongs to that family unit.
  const { data: claim } = await supabase
    .from("claims")
    .select("id, family_unit_id, status")
    .eq("id", input.claim_id)
    .single();

  if (!claim) return { ok: false, error: "Claim not found." };
  if (claim.family_unit_id !== pathFamilyUnit) {
    return { ok: false, error: "Claim doesn't belong to that family unit." };
  }
  if (claim.status !== "pending" && claim.status !== "draft" && profile.role !== "admin") {
    return {
      ok: false,
      error: "Cannot add documents to a claim once decided.",
    };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("claim_documents")
    .insert({
      claim_id: input.claim_id,
      storage_path: input.storage_path,
      file_name: input.file_name,
      mime_type: input.mime_type,
      size_bytes: input.size_bytes,
      uploaded_by: user.id,
    })
    .select("id")
    .single();

  if (insertError || !inserted) {
    return {
      ok: false,
      error: insertError?.message ?? "Could not record the document.",
    };
  }

  await writeAudit({
    actorId: user.id,
    action: "claim.document_added",
    entityType: "claim",
    entityId: input.claim_id,
    details: {
      document_id: inserted.id,
      file_name: input.file_name,
      size_bytes: input.size_bytes,
    },
  });

  revalidatePath(`/claims/${input.claim_id}`);
  return { ok: true, data: { document_id: inserted.id } };
}
