import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase admin client. Uses the SECRET key, which BYPASSES Row Level
 * Security entirely.
 *
 * ⚠️ DANGER ⚠️
 * Anything done with this client has full database access. Before using it,
 * ALWAYS verify the caller is an admin via the regular server client's
 * profile lookup. Never expose this client (or anything that calls it)
 * to a Client Component or any unauthenticated route.
 *
 * Use cases (all in trusted server code):
 *   - Inviting a new auth user (auth.admin.inviteUserByEmail)
 *   - Creating audit log entries (which have no INSERT policy)
 *   - Anything else that legitimately requires bypassing RLS
 *
 * For ordinary admin operations on tables (insert/update/delete), prefer the
 * regular server client + RLS policies that check public.is_admin(). That way
 * the database itself enforces the rule, not just our application code.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const secret = process.env.SUPABASE_SECRET_KEY;

  if (!url || !secret) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SECRET_KEY env vars"
    );
  }

  return createSupabaseClient(url, secret, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });
}
