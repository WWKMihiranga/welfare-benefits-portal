import Link from "next/link";
import { Plus } from "lucide-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate, formatLKR } from "@/lib/utils/format";
import type { ClaimStatus } from "@/lib/db/types";

const PAGE_SIZE = 30;

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
  searchParams: Promise<{ status?: string; page?: string }>;
}

export default async function ClaimsPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  const supabase = await createClient();

  const params = await searchParams;
  const statusFilter = (params.status ?? "") as "" | ClaimStatus;
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  // For admins the default filter is "pending" so they land on the queue
  const effectiveStatus =
    statusFilter ||
    (profile.role === "admin" && !params.status ? "pending" : "");

  // Build query — RLS does the scoping (member sees own family only)
  let q = supabase
    .from("claims")
    .select(
      `
        id, category, service_date, bill_amount_cents,
        reimbursable_amount_cents, status, submitted_at, decided_at,
        person:persons!claims_person_id_fkey(full_name),
        family_unit_id
      `,
      { count: "exact" }
    )
    .order("submitted_at", { ascending: false });

  if (effectiveStatus) {
    q = q.eq("status", effectiveStatus);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: rows, count, error } = await q.range(from, to);
  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  const statusTabs: Array<{ value: "" | ClaimStatus; label: string }> = [
    { value: "", label: "All" },
    { value: "pending", label: "Pending" },
    { value: "approved", label: "Approved" },
    { value: "rejected", label: "Rejected" },
    { value: "reversed", label: "Reversed" },
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Claims</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {profile.role === "admin"
              ? `All claims — ${totalCount} ${effectiveStatus || "in view"}`
              : `Your family's claims — ${totalCount} total`}
          </p>
        </div>
        {profile.role === "member" && (
          <Button asChild>
            <Link href="/claims/new">
              <Plus className="h-4 w-4" />
              Submit claim
            </Link>
          </Button>
        )}
      </div>

      <Card className="p-0 overflow-hidden">
        {/* Status filter tabs */}
        <div className="border-b border-[var(--color-border)] flex flex-wrap">
          {statusTabs.map((tab) => {
            const isActive =
              effectiveStatus === tab.value ||
              (tab.value === "" && !effectiveStatus);
            const params = new URLSearchParams();
            if (tab.value) params.set("status", tab.value);
            const href = `/claims${params.toString() ? "?" + params : ""}`;
            return (
              <Link
                key={tab.value || "all"}
                href={href}
                className={`px-4 py-3 text-sm border-b-2 transition-colors -mb-px ${
                  isActive
                    ? "border-[var(--color-accent)] text-[var(--color-accent)] font-medium"
                    : "border-transparent text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </div>

        {error ? (
          <div className="p-8 text-sm text-[var(--color-danger)]">
            Could not load claims: {error.message}
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-muted)]">
            No claims to show.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                  <th className="p-4 font-medium">Submitted</th>
                  <th className="p-4 font-medium">For</th>
                  <th className="p-4 font-medium">Category</th>
                  <th className="p-4 font-medium">Bill</th>
                  <th className="p-4 font-medium">Reimbursement</th>
                  <th className="p-4 font-medium">Status</th>
                  <th className="p-4 font-medium w-px"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const personName =
                    Array.isArray(row.person)
                      ? row.person[0]?.full_name
                      : (row.person as { full_name: string } | null)?.full_name;
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]"
                    >
                      <td className="p-4 text-[var(--color-text-muted)] whitespace-nowrap">
                        {formatDate(row.submitted_at)}
                      </td>
                      <td className="p-4">{personName ?? "—"}</td>
                      <td className="p-4 text-[var(--color-text-muted)]">
                        {CATEGORY_LABELS[row.category] ?? row.category}
                      </td>
                      <td className="p-4 whitespace-nowrap">
                        {formatLKR(row.bill_amount_cents)}
                      </td>
                      <td className="p-4 whitespace-nowrap font-medium">
                        {formatLKR(row.reimbursable_amount_cents)}
                      </td>
                      <td className="p-4">
                        <span
                          className={`inline-block px-2 py-0.5 rounded text-xs capitalize ${
                            STATUS_STYLES[row.status as ClaimStatus]
                          }`}
                        >
                          {row.status}
                        </span>
                      </td>
                      <td className="p-4">
                        <Link
                          href={`/claims/${row.id}`}
                          className="text-[var(--color-accent)] hover:underline"
                        >
                          View
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {totalPages > 1 && (
          <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between text-sm">
            <div className="text-[var(--color-text-muted)]">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Button asChild variant="secondary" size="sm">
                  <Link
                    href={`/claims?${new URLSearchParams({
                      ...(effectiveStatus ? { status: effectiveStatus } : {}),
                      page: String(page - 1),
                    })}`}
                  >
                    Previous
                  </Link>
                </Button>
              )}
              {page < totalPages && (
                <Button asChild variant="secondary" size="sm">
                  <Link
                    href={`/claims?${new URLSearchParams({
                      ...(effectiveStatus ? { status: effectiveStatus } : {}),
                      page: String(page + 1),
                    })}`}
                  >
                    Next
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
