import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/supabase/auth";
import { getRecentAuditLog } from "@/lib/reports/queries";
import { toCSV, csvResponse } from "@/lib/reports/csv";

export async function GET(request: NextRequest) {
  try {
    await requireAdmin();
  } catch {
    return new Response("Forbidden", { status: 403 });
  }

  const limit = Math.min(
    1000,
    Math.max(1, parseInt(request.nextUrl.searchParams.get("limit") ?? "500", 10))
  );

  const rows = await getRecentAuditLog(limit);

  const csv = toCSV(
    rows.map((r) => ({
      timestamp: r.created_at,
      actor: r.actor_name ?? "(unknown)",
      action: r.action,
      entity_type: r.entity_type,
      entity_id: r.entity_id ?? "",
      details: r.details ? JSON.stringify(r.details) : "",
    })),
    [
      { key: "timestamp", header: "Timestamp (UTC)" },
      { key: "actor", header: "Actor" },
      { key: "action", header: "Action" },
      { key: "entity_type", header: "Entity type" },
      { key: "entity_id", header: "Entity ID" },
      { key: "details", header: "Details (JSON)" },
    ]
  );

  return csvResponse(csv, `audit-log-${new Date().toISOString().slice(0, 10)}.csv`);
}
