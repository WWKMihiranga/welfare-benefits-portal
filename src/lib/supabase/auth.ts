import "server-only";
import { redirect } from "next/navigation";
import { createClient } from "./server";
import type { UserRole } from "@/lib/db/types";

/**
 * Require an authenticated user. Returns the user + profile. Redirects to
 * /login if not signed in, or to a friendly error if the profile is missing.
 * Use this at the top of every server action and protected page that needs
 * the user identity.
 */
export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("id, role, full_name, family_unit_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // Profile missing — sign-out and bounce to login
    await supabase.auth.signOut();
    redirect("/login?error=no_profile");
  }

  return {
    user,
    profile,
    supabase,
  } as const;
}

/**
 * Require an authenticated admin. Same as requireUser, but throws if the
 * user is not an admin. Used at the top of every admin-only server action.
 */
export async function requireAdmin() {
  const ctx = await requireUser();
  if (ctx.profile.role !== "admin") {
    // We throw instead of redirecting because server actions handle errors
    // as form state, which lets the caller show a clean error UI.
    throw new Error("Forbidden: admin access required");
  }
  return ctx;
}

/**
 * Convenience: returns the role for the current session. Used in layouts
 * and pages that need to branch on role.
 */
export async function getCurrentRole(): Promise<UserRole | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  return (data?.role as UserRole) ?? null;
}
