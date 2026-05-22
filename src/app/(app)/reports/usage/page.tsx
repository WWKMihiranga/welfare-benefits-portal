import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, Download } from "lucide-react";
import { requireUser } from "@/lib/supabase/auth";
import { getUsageByCategory } from "@/lib/reports/queries";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLKR } from "@/lib/utils/format";

const CATEGORY_LABELS: Record<string, string> = {
  hospital_private: "Hospital — Private",
  hospital_government: "Hospital — Government",
  eye_care: "Eye care",
  testing: "Testing",
};

interface PageProps {
  searchParams: Promise<{ from?: string; to?: string }>;
}

export default async function UsageReportPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  if (profile.role !== "admin") redirect("/dashboard");

  const params = await searchParams;
  const from = params.from?.trim() || undefined;
  const to = params.to?.trim() || undefined;

  const rows = await getUsageByCategory(from, to);

  const totals = rows.reduce(
    (acc, r) => ({
      claim_count: acc.claim_count + r.claim_count,
      total_bill_cents: acc.total_bill_cents + r.total_bill_cents,
      total_reimbursed_cents:
        acc.total_reimbursed_cents + r.total_reimbursed_cents,
    }),
    { claim_count: 0, total_bill_cents: 0, total_reimbursed_cents: 0 }
  );

  const exportUrl = `/api/reports/usage?${new URLSearchParams({
    ...(from ? { from } : {}),
    ...(to ? { to } : {}),
  })}`;

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
            <h1 className="text-2xl font-semibold">Usage by category</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Approved claims only. Aggregated by service date.
            </p>
          </div>
          <Button asChild variant="secondary">
            <a href={exportUrl}>
              <Download className="h-4 w-4" />
              Export CSV
            </a>
          </Button>
        </div>
      </div>

      {/* Filter */}
      <Card>
        <form method="get" className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[140px]">
            <Label htmlFor="from">From</Label>
            <Input id="from" name="from" type="date" defaultValue={from ?? ""} />
          </div>
          <div className="flex-1 min-w-[140px]">
            <Label htmlFor="to">To</Label>
            <Input id="to" name="to" type="date" defaultValue={to ?? ""} />
          </div>
          <Button type="submit" variant="secondary">
            Apply
          </Button>
          {(from || to) && (
            <Button asChild variant="ghost">
              <Link href="/reports/usage">Clear</Link>
            </Button>
          )}
        </form>
      </Card>

      {/* Table */}
      <Card className="p-0 overflow-hidden">
        {rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-muted)]">
            No approved claims {from || to ? "match this filter" : "yet"}.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                  <th className="p-4 font-medium">Category</th>
                  <th className="p-4 font-medium text-right">Claims</th>
                  <th className="p-4 font-medium text-right">Billed</th>
                  <th className="p-4 font-medium text-right">Reimbursed</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.category}
                    className="border-b border-[var(--color-border)] last:border-0"
                  >
                    <td className="p-4">
                      {CATEGORY_LABELS[r.category] ?? r.category}
                    </td>
                    <td className="p-4 text-right">{r.claim_count}</td>
                    <td className="p-4 text-right">
                      {formatLKR(r.total_bill_cents)}
                    </td>
                    <td className="p-4 text-right font-medium">
                      {formatLKR(r.total_reimbursed_cents)}
                    </td>
                  </tr>
                ))}
                <tr className="bg-[var(--color-surface-2)] font-medium">
                  <td className="p-4">Total</td>
                  <td className="p-4 text-right">{totals.claim_count}</td>
                  <td className="p-4 text-right">
                    {formatLKR(totals.total_bill_cents)}
                  </td>
                  <td className="p-4 text-right">
                    {formatLKR(totals.total_reimbursed_cents)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
