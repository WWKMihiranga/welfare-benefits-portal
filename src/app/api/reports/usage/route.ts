import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { getUsageByCategory } from "@/lib/reports/queries";
import { toCSV, csvResponse } from "@/lib/reports/csv";

const CATEGORY_LABELS: Record<string, string> = {
  hospital_private: "Hospital — Private",
  hospital_government: "Hospital — Government",
  eye_care: "Eye care",
  testing: "Testing",
};

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const from = request.nextUrl.searchParams.get("from") ?? undefined;
  const to = request.nextUrl.searchParams.get("to") ?? undefined;

  const rows = await getUsageByCategory(from, to);

  const csv = toCSV(
    rows.map((r) => ({
      category: CATEGORY_LABELS[r.category] ?? r.category,
      claim_count: r.claim_count,
      total_bill_lkr: (r.total_bill_cents / 100).toFixed(2),
      total_reimbursed_lkr: (r.total_reimbursed_cents / 100).toFixed(2),
    })),
    [
      { key: "category", header: "Category" },
      { key: "claim_count", header: "Claims" },
      { key: "total_bill_lkr", header: "Total billed (LKR)" },
      { key: "total_reimbursed_lkr", header: "Total reimbursed (LKR)" },
    ]
  );

  const filename = `usage-by-category${from ? `-from-${from}` : ""}${
    to ? `-to-${to}` : ""
  }.csv`;
  return csvResponse(csv, filename);
}
