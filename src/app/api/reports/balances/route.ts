import { requireAdmin } from "@/lib/supabase/auth";
import { getFamilyBalances } from "@/lib/reports/queries";
import { toCSV, csvResponse } from "@/lib/reports/csv";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await getFamilyBalances();

  const csv = toCSV(
    rows.map((r) => ({
      member_name: r.member_name,
      pool_used_lkr: (r.pool_used_cents / 100).toFixed(2),
      pool_remaining_lkr: (r.pool_remaining_cents / 100).toFixed(2),
      testing_used_this_year_lkr: (
        r.testing_used_this_year_cents / 100
      ).toFixed(2),
    })),
    [
      { key: "member_name", header: "Member" },
      { key: "pool_used_lkr", header: "Pool used (LKR)" },
      { key: "pool_remaining_lkr", header: "Pool remaining (LKR)" },
      {
        key: "testing_used_this_year_lkr",
        header: "Testing used this year (LKR)",
      },
    ]
  );

  return csvResponse(csv, `family-balances-${new Date().toISOString().slice(0, 10)}.csv`);
}
