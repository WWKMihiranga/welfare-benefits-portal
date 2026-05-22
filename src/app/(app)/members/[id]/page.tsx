import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Mail, Calendar, IdCard } from "lucide-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { formatDate } from "@/lib/utils/format";
import { ArchiveMemberButton } from "./archive-button";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function MemberDetailPage({ params }: PageProps) {
  const { profile } = await requireUser();
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }

  const { id: familyUnitId } = await params;
  const supabase = await createClient();

  // Load the family unit + member profile
  const { data: unit, error: unitError } = await supabase
    .from("family_units")
    .select(
      `
        id,
        archived_at,
        created_at,
        member_profile_id,
        profiles!family_units_member_profile_id_fkey (
          id,
          full_name
        )
      `
    )
    .eq("id", familyUnitId)
    .single();

  if (unitError || !unit) {
    notFound();
  }

  // Load the auth user (for email)
  let memberEmail: string | null = null;
  if (unit.member_profile_id) {
    // We need the email, which lives on auth.users — not directly queryable
    // with RLS. Use the admin client (we already verified admin above).
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();
    const { data: authUser } = await admin.auth.admin.getUserById(
      unit.member_profile_id
    );
    memberEmail = authUser.user?.email ?? null;
  }

  // Load persons
  const { data: persons } = await supabase
    .from("persons")
    .select("*")
    .eq("family_unit_id", familyUnitId)
    .is("archived_at", null)
    .order("is_committee_member", { ascending: false })
    .order("relationship", { ascending: true })
    .order("date_of_birth", { ascending: true, nullsFirst: false });

  const memberProfile = Array.isArray(unit.profiles)
    ? unit.profiles[0]
    : unit.profiles;
  const memberName = memberProfile?.full_name ?? "Unknown member";

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <Link
          href="/members"
          className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-text)] mb-3"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to directory
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-semibold">{memberName}</h1>
            <p className="text-sm text-[var(--color-text-muted)] mt-1">
              Enrolled {formatDate(unit.created_at)}
              {unit.archived_at && " · Archived"}
            </p>
          </div>
          {!unit.archived_at && (
            <ArchiveMemberButton familyUnitId={familyUnitId} />
          )}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>The member&apos;s login details.</CardDescription>
        </CardHeader>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-[var(--color-text-subtle)]" />
            <span>{memberEmail ?? "—"}</span>
          </div>
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Family</CardTitle>
          <CardDescription>
            {persons?.length ?? 0} person
            {persons?.length === 1 ? "" : "s"} covered.
          </CardDescription>
        </CardHeader>
        {!persons || persons.length === 0 ? (
          <div className="text-sm text-[var(--color-text-subtle)] py-4 text-center">
            No persons recorded.
          </div>
        ) : (
          <div className="space-y-3">
            {persons.map((p) => (
              <div
                key={p.id}
                className="border border-[var(--color-border)] rounded-md p-4"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="font-medium">{p.full_name}</div>
                    <div className="text-xs uppercase tracking-wide text-[var(--color-text-subtle)] mt-0.5">
                      {p.is_committee_member ? "Committee member" : p.relationship}
                    </div>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[var(--color-text-muted)]">
                  {p.date_of_birth && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {formatDate(p.date_of_birth)}
                    </span>
                  )}
                  {p.nic && (
                    <span className="inline-flex items-center gap-1">
                      <IdCard className="h-3 w-3" />
                      {p.nic}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
