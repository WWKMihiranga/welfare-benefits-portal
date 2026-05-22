import Link from "next/link";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatLKR } from "@/lib/utils/format";
import { POOL_500K_CAP_CENTS } from "@/lib/eligibility/types";

export default async function DashboardPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();

  if (profile.role === "admin") {
    // Counts for the admin overview. RLS gives admins everything.
    const [
      { count: memberCount },
      { count: pendingClaims },
      { count: totalClaims },
    ] = await Promise.all([
      supabase
        .from("family_units")
        .select("*", { count: "exact", head: true })
        .is("archived_at", null),
      supabase
        .from("claims")
        .select("*", { count: "exact", head: true })
        .eq("status", "pending"),
      supabase.from("claims").select("*", { count: "exact", head: true }),
    ]);

    return (
      <div className="max-w-5xl mx-auto space-y-6 animate-fade-in">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Welcome back, {profile.full_name.split(" ")[0]}.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Members</CardTitle>
              <CardDescription>Active family units</CardDescription>
            </CardHeader>
            <p className="text-3xl font-semibold">{memberCount ?? 0}</p>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Pending claims</CardTitle>
              <CardDescription>Awaiting your review</CardDescription>
            </CardHeader>
            <p className="text-3xl font-semibold">{pendingClaims ?? 0}</p>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total claims</CardTitle>
              <CardDescription>All-time</CardDescription>
            </CardHeader>
            <p className="text-3xl font-semibold">{totalClaims ?? 0}</p>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Get started</CardTitle>
            <CardDescription>Quick actions for administrators.</CardDescription>
          </CardHeader>
          <div className="flex flex-wrap gap-3">
            <Button asChild>
              <Link href="/members/new">Add a new member</Link>
            </Button>
            <Button asChild variant="secondary">
              <Link href="/members">View directory</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // ----- Member view -------------------------------------------------------
  // Show the member's own family pool balance.
  let poolUsedCents = 0;
  if (profile.family_unit_id) {
    const { data } = await supabase
      .from("claims")
      .select("reimbursable_amount_cents, category")
      .eq("family_unit_id", profile.family_unit_id)
      .eq("status", "approved")
      .in("category", ["hospital_private", "hospital_government", "eye_care"]);
    poolUsedCents = (data ?? []).reduce(
      (sum, c) => sum + (c.reimbursable_amount_cents ?? 0),
      0
    );
  }
  const poolRemainingCents = Math.max(0, POOL_500K_CAP_CENTS - poolUsedCents);

  return (
    <div className="max-w-3xl mx-auto space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-semibold">
          Welcome, {profile.full_name.split(" ")[0]}
        </h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Here&apos;s your family&apos;s benefit summary.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Family benefit pool</CardTitle>
          <CardDescription>
            Lifetime limit of LKR 500,000 shared across hospital and eye-care
            claims.
          </CardDescription>
        </CardHeader>
        <div className="space-y-3">
          <div className="h-2 bg-[var(--color-surface-2)] rounded-full overflow-hidden">
            <div
              className="h-full bg-[var(--color-accent)] transition-all"
              style={{
                width: `${Math.min(100, (poolUsedCents / POOL_500K_CAP_CENTS) * 100)}%`,
              }}
            />
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[var(--color-text-muted)]">
              Used: {formatLKR(poolUsedCents)}
            </span>
            <span className="font-medium">
              Remaining: {formatLKR(poolRemainingCents)}
            </span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Submit a claim</CardTitle>
          <CardDescription>
            File a claim for a hospital bill, eye care, or medical testing.
          </CardDescription>
        </CardHeader>
        <Button asChild>
          <Link href="/claims/new">Start a new claim</Link>
        </Button>
      </Card>
    </div>
  );
}
