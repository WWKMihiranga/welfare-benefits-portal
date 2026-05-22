import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/lib/supabase/auth";
import { getFamilyBalances } from "@/lib/reports/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { formatLKR } from "@/lib/utils/format";
import { POOL_500K_CAP_CENTS } from "@/lib/eligibility/types";

export default async function BalancesReportPage() {
  const { profile } = await requireUser();
  if (profile.role !== "admin") redirect("/dashboard");

  const rows = await getFamilyBalances();

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
            <h1 className="text-2xl font-semibold">Family balances</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              {rows.length} active families. Pool cap is LKR 500,000 per family.
            </p>
          </div>
          <Button asChild variant="secondary">
            <a href="/api/reports/balances">
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>

      <Card className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-muted)]">
            No active families yet.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                  <th className="p-4 font-medium">Member</th>
                  <th className="p-4 font-medium">Pool used</th>
                  <th className="p-4 font-medium">Pool remaining</th>
                  <th className="p-4 font-medium">Testing (this year)</th>
                  <th className="p-4 font-medium w-32">Usage</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const pct = Math.min(
                    100,
                    Math.round((r.pool_used_cents / POOL_500K_CAP_CENTS) * 100)
                  );
                  return (
                    <tr
                      key={r.family_unit_id}
                      className="border-b border-[var(--color-border)] last:border-0"
                    >
                      <td className="p-4 font-medium">
                        <Link
                          href={`/members/${r.family_unit_id}`}
                          className="hover:text-[var(--color-accent)]"
                        >
                          {r.member_name}
                        </Link>
                      </td>
                      <td className="p-4">{formatLKR(r.pool_used_cents)}</td>
                      <td className="p-4">{formatLKR(r.pool_remaining_cents)}</td>
                      <td className="p-4 text-[var(--color-text-muted)]">
                        {formatLKR(r.testing_used_this_year_cents)}
                      </td>
                      <td className="p-4">
                        <div className="flex items-center gap-2">
                          <div className="flex-1 h-1.5 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
                            <div
                              className={`h-full transition-all ${
                                pct >= 90
                                  ? "bg-[var(--color-danger)]"
                                  : pct >= 70
                                  ? "bg-[var(--color-warning)]"
                                  : "bg-[var(--color-accent)]"
                              }`}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                          <span className="text-xs text-[var(--color-text-muted)] w-9 text-right">
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
