import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Append-only audit log. Uses the admin client because the audit_log table
 * has no INSERT policy by design — only server code with the secret key
 * can write to it. That makes audit entries forge-proof from the client.
 *
 * Conventions:
 *   - `action` follows the format `<entity>.<verb>`, e.g. 'member.created',
 *     'claim.approved', 'claim.reversed'.
 *   - `details` is a JSONB blob — include enough context to understand
 *     what happened later. For state changes, include both `before` and
 *     `after` snapshots.
 *
 * NEVER include sensitive data in details (passwords, full NICs, etc.).
 */
export interface AuditEntry {
  actorId: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  details?: Record<string, unknown> | null;
}

export async function writeAudit(entry: AuditEntry): Promise<void> {
  const admin = createAdminClient();

  const { error } = await admin.from("audit_log").insert({
    actor_id: entry.actorId,
    action: entry.action,
    entity_type: entry.entityType,
    entity_id: entry.entityId ?? null,
    details: entry.details ?? null,
  });

  if (error) {
    // We log but do not throw — a failed audit entry should not break the
    // user's action. Audit failures should be monitored externally.
    console.error("[audit] failed to write entry", { entry, error });
  }
}
