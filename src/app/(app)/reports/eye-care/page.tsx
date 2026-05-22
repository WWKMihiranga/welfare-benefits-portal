import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/lib/supabase/auth";
import { getUpcomingEyeCareEligibility } from "@/lib/reports/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/format";

export default async function EyeCareReportPage() {
  const { profile } = await requireUser();
  if (profile.role !== "admin") redirect("/dashboard");

  const rows = await getUpcomingEyeCareEligibility();

  return (
    <div className="max-w-4xl mx-auto space-y-6">
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
            <h1 className="text-2xl font-semibold">Eye-care eligibility</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              People eligible now, or within the next 90 days. Members and
              spouses only.
            </p>
          </div>
          <Button asChild variant="secondary">
            <a href="/api/reports/eye-care">
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-muted)]">
            Nobody is currently eligible or becoming eligible in the next 90
            days.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                  <th className="p-4 font-medium">Name</th>
                  <th className="p-4 font-medium">Relationship</th>
                  <th className="p-4 font-medium">Last claim</th>
                  <th className="p-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.person_id}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="p-4 font-medium">{r.full_name}</td>
                    <td className="p-4 text-[var(--color-text-muted)] capitalize">
                      {r.is_committee_member ? "Member" : r.relationship}
                    </td>
                    <td className="p-4 text-[var(--color-text-muted)]">
                      {r.last_service_date
                        ? formatDate(r.last_service_date)
                        : "—"}
                    </td>
                    <td className="p-4">
                      {r.currently_eligible ? (
                        <span className="inline-block px-2 py-0.5 rounded text-xs bg-emerald-100 text-emerald-900">
                          Eligible now
                        </span>
                      ) : (
                        <span className="text-[var(--color-text-muted)]">
                          Eligible from{" "}
                          {r.next_eligible_date
                            ? formatDate(r.next_eligible_date)
                            : "—"}
                        </span>
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
