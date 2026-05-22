import { requireAdmin } from "@/lib/supabase/auth";
import { getUpcomingEyeCareEligibility } from "@/lib/reports/queries";
import { toCSV, csvResponse } from "@/lib/reports/csv";

export async function GET() {
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const rows = await getUpcomingEyeCareEligibility();

  const csv = toCSV(
    rows.map((r) => ({
      full_name: r.full_name,
      relationship: r.is_committee_member ? "Committee member" : r.relationship,
      last_service_date: r.last_service_date ?? "—",
      next_eligible_date: r.next_eligible_date ?? "Eligible now",
      currently_eligible: r.currently_eligible ? "Yes" : "No",
    })),
    [
      { key: "full_name", header: "Name" },
      { key: "relationship", header: "Relationship" },
      { key: "last_service_date", header: "Last claim" },
      { key: "next_eligible_date", header: "Next eligible" },
      { key: "currently_eligible", header: "Eligible now" },
    ]
  );

  return csvResponse(csv, `eye-care-eligibility-${new Date().toISOString().slice(0, 10)}.csv`);
}
