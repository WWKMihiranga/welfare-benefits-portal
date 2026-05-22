import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/lib/supabase/auth";
import { getRecentAuditLog } from "@/lib/reports/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDateTime } from "@/lib/utils/format";

const ACTION_LABELS: Record<string, string> = {
  "member.created": "Member created",
  "member.archived": "Member archived",
  "claim.submitted": "Claim submitted",
  "claim.approved": "Claim approved",
  "claim.rejected": "Claim rejected",
  "claim.reversed": "Claim reversed",
  "claim.document_added": "Document attached",
};

const ACTION_COLORS: Record<string, string> = {
  "member.created": "bg-blue-100 text-blue-900",
  "member.archived": "bg-gray-200 text-gray-700",
  "claim.submitted": "bg-amber-100 text-amber-900",
  "claim.approved": "bg-emerald-100 text-emerald-900",
  "claim.rejected": "bg-red-100 text-red-900",
  "claim.reversed": "bg-gray-200 text-gray-700",
  "claim.document_added": "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]",
};

export default async function AuditReportPage() {
  const { profile } = await requireUser();
  if (profile.role !== "admin") redirect("/dashboard");

  const rows = await getRecentAuditLog(200);

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <Link
          href="/reports"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          All reports
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">Audit log</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Most recent {rows.length} events. Export for the full history.
            </p>
          </div>
          <Button asChild variant="secondary">
            <a href="/api/reports/audit?limit=1000">
              <Download className="h-4 w-4" />
              Export CSV (last 1000)
            </a>
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-muted)]">
            No audit entries yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                  <th className="p-4 font-medium whitespace-nowrap">When</th>
                  <th className="p-4 font-medium">Actor</th>
                  <th className="p-4 font-medium">Action</th>
                  <th className="p-4 font-medium">Details</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]"
                  >
                    <td className="p-4 text-[var(--color-text-muted)] whitespace-nowrap">
                      {formatDateTime(r.created_at)}
                    </td>
                    <td className="p-4">{r.actor_name ?? "—"}</td>
                    <td className="p-4">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-xs ${
                          ACTION_COLORS[r.action] ??
                          "bg-[var(--color-surface-2)] text-[var(--color-text-muted)]"
                        }`}
                      >
                        {ACTION_LABELS[r.action] ?? r.action}
                      </span>
                    </td>
                    <td className="p-4 text-xs text-[var(--color-text-muted)]">
                      <AuditDetails details={r.details} />
                      {r.entity_id && (
                        <Link
                          href={
                            r.entity_type === "claim"
                              ? `/claims/${r.entity_id}`
                              : r.entity_type === "family_unit"
                              ? `/members/${r.entity_id}`
                              : "#"
                          }
                          className="text-[var(--color-accent)] hover:underline ml-2"
                        >
                          View
                        </Link>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function AuditDetails({ details }: { details: Record<string, unknown> | null }) {
  if (!details) return null;

  // Try to render some common fields nicely; fall back to JSON
  const parts: string[] = [];
  if (typeof details.member_name === "string")
    parts.push(`Member: ${details.member_name}`);
  if (typeof details.email === "string") parts.push(`Email: ${details.email}`);
  if (typeof details.category === "string")
    parts.push(`Category: ${details.category}`);
  if (typeof details.reimbursable_amount_cents === "number")
    parts.push(
      `Amount: LKR ${(details.reimbursable_amount_cents / 100).toLocaleString("en-LK")}`
    );
  if (typeof details.computed_amount_cents === "number")
    parts.push(
      `Computed: LKR ${(details.computed_amount_cents / 100).toLocaleString("en-LK")}`
    );
  if (typeof details.override_amount_cents === "number")
    parts.push(
      `Override: LKR ${(details.override_amount_cents / 100).toLocaleString("en-LK")}`
    );
  if (typeof details.file_name === "string")
    parts.push(`File: ${details.file_name}`);
  if (typeof details.reason === "string")
    parts.push(`Reason: ${details.reason}`);

  if (parts.length > 0) {
    return <span>{parts.join(" · ")}</span>;
  }

  // Fallback
  return <span className="font-mono">{JSON.stringify(details)}</span>;
}
