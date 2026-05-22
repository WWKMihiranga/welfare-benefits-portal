import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar } from "@/components/layout/sidebar";
import { Topbar } from "@/components/layout/topbar";
import type { UserRole } from "@/lib/db/types";

/**
 * Route group wrapper for everything an authenticated user can access.
 *
 *   1. Verifies the user is signed in (proxy.ts already did this).
 *   2. Loads the user's profile (role + family unit) to drive UI.
 *
 * If the profile row is missing — which only happens if the auth user was
 * created outside the normal flow — we show a clear error rather than
 * silently letting them through.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: profile, error } = await supabase
    .from("profiles")
    .select("role, full_name, family_unit_id")
    .eq("id", user.id)
    .single();

  if (error || !profile) {
    // The auth user exists but no profile row was created. This should
    // never happen in normal use — the on-auth trigger creates the row.
    return (
      <div className="min-h-screen flex items-center justify-center p-8">
        <div className="max-w-md text-center">
          <h1 className="text-xl font-semibold mb-2">Account not set up</h1>
          <p className="text-sm text-[var(--color-text-muted)]">
            Your account exists but is not yet linked to a profile. Please
            contact your administrator.
          </p>
        </div>
      </div>
    );
  }

  const role = profile.role as UserRole;

  return (
    <div className="flex min-h-screen">
      <Sidebar role={role} />
      <div className="flex-1 flex flex-col min-w-0">
        <Topbar
          email={user.email ?? ""}
          fullName={profile.full_name}
          role={role}
        />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </div>
  );
}
