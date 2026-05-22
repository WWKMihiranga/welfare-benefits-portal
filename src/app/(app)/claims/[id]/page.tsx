import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate, formatDateTime, formatLKR } from "@/lib/utils/format";
import type { ClaimStatus } from "@/lib/db/types";
import { ClaimDocumentsSection } from "./documents-section";
import { ClaimDecisionPanel } from "./decision-panel";

const CATEGORY_LABELS: Record<string, string> = {
  hospital_private: "Hospital — Private",
  hospital_government: "Hospital — Government",
  eye_care: "Eye care",
  testing: "Testing",
};

const STATUS_STYLES: Record<ClaimStatus, string> = {
  draft: "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]",
  pending: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  rejected: "bg-red-100 text-red-900",
  reversed: "bg-gray-200 text-gray-700",
};

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ClaimDetailPage({ params }: PageProps) {
  const { profile } = await requireUser();
  const { id: claimId } = await params;
  const supabase = await createClient();

  const { data: claim, error } = await supabase
    .from("claims")
    .select(
      `
        *,
        person:persons!claims_person_id_fkey(full_name, relationship, is_committee_member)
      `
    )
    .eq("id", claimId)
    .single();

  if (error || !claim) {
    notFound();
  }

  const person = Array.isArray(claim.person) ? claim.person[0] : claim.person;

  // Load documents (RLS already scopes)
  const { data: documents } = await supabase
    .from("claim_documents")
    .select("id, file_name, mime_type, size_bytes, uploaded_at")
    .eq("claim_id", claim.id)
    .order("uploaded_at", { ascending: true });

  const canUpload =
    claim.status === "pending" || claim.status === "draft" || profile.role === "admin";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/claims"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to claims
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">
              {CATEGORY_LABELS[claim.category]} claim
            </h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Submitted {formatDateTime(claim.submitted_at)}
            </p>
          </div>
          <span
            className={`inline-block px-3 py-1 rounded text-sm capitalize ${
              STATUS_STYLES[claim.status as ClaimStatus]
            }`}
          >
            {claim.status}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Details</CardTitle>
        </CardHeader>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
          <div>
            <dt className="text-[var(--color-text-muted)]">For</dt>
            <dd className="font-medium">{person?.full_name ?? "—"}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)]">Service date</dt>
            <dd className="font-medium">{formatDate(claim.service_date)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)]">Bill amount</dt>
            <dd className="font-medium">{formatLKR(claim.bill_amount_cents)}</dd>
          </div>
          <div>
            <dt className="text-[var(--color-text-muted)]">Reimbursement</dt>
            <dd className="font-medium">
              {formatLKR(claim.reimbursable_amount_cents)}
              {claim.status === "pending" && (
                <span className="text-xs text-[var(--color-text-muted)] font-normal ml-1">
                  (estimate)
                </span>
              )}
            </dd>
          </div>
          {claim.days_count != null && (
            <div>
              <dt className="text-[var(--color-text-muted)]">Admission days</dt>
              <dd className="font-medium">{claim.days_count}</dd>
            </div>
          )}
          {claim.decided_at && (
            <div>
              <dt className="text-[var(--color-text-muted)]">Decided</dt>
              <dd className="font-medium">{formatDateTime(claim.decided_at)}</dd>
            </div>
          )}
        </dl>

        {claim.member_notes && (
          <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
            <dt className="text-sm text-[var(--color-text-muted)] mb-1">
              Member notes
            </dt>
            <dd className="text-sm whitespace-pre-wrap">{claim.member_notes}</dd>
          </div>
        )}
        {claim.admin_notes && (
          <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
            <dt className="text-sm text-[var(--color-text-muted)] mb-1">
              Administrator notes
            </dt>
            <dd className="text-sm whitespace-pre-wrap">{claim.admin_notes}</dd>
          </div>
        )}
      </Card>

      {/* Documents section */}
      <ClaimDocumentsSection
        claimId={claim.id}
        familyUnitId={claim.family_unit_id}
        documents={documents ?? []}
        canUpload={canUpload}
      />

      {/* Admin decision panel — only for pending claims, only for admins */}
      {profile.role === "admin" && claim.status === "pending" && (
        <ClaimDecisionPanel
          claimId={claim.id}
          currentEstimateCents={claim.reimbursable_amount_cents}
          billAmountCents={claim.bill_amount_cents}
        />
      )}

      {profile.role === "admin" && claim.status === "approved" && (
        <Card>
          <CardHeader>
            <CardTitle>Reverse this claim</CardTitle>
            <CardDescription>
              Use this only to correct a mistake. The reversal is logged.
            </CardDescription>
          </CardHeader>
          <ClaimDecisionPanel
            claimId={claim.id}
            currentEstimateCents={claim.reimbursable_amount_cents}
            billAmountCents={claim.bill_amount_cents}
            reverseMode
          />
        </Card>
      )}
    </div>
  );
}
