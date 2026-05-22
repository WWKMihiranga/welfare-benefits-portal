import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { SubmitClaimForm } from "./submit-claim-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default async function NewClaimPage() {
  const { profile } = await requireUser();
  const supabase = await createClient();

  // Members submit for their own family. Admins, in this MVP, also use this
  // page scoped to a chosen family — but for simplicity we'll only show
  // members' own family for now. (Admin claim-on-behalf-of can come later.)
  if (!profile.family_unit_id) {
    // Admin or unenrolled — for now, redirect to dashboard.
    redirect("/dashboard");
  }

  const { data: persons, error } = await supabase
    .from("persons")
    .select("id, full_name, relationship, is_committee_member")
    .eq("family_unit_id", profile.family_unit_id)
    .is("archived_at", null)
    .order("is_committee_member", { ascending: false })
    .order("relationship", { ascending: true });

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Submit Claim</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          File a new welfare benefit claim. You&apos;ll see an estimated
          reimbursement amount before you submit.
        </p>
      </div>

      {error || !persons || persons.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No family members on record</CardTitle>
            <CardDescription>
              Your administrator needs to enroll your family before you can
              submit claims. Please contact them.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <SubmitClaimForm
          persons={persons.map((p) => ({
            id: p.id,
            full_name: p.full_name,
            relationship: p.relationship,
            is_committee_member: p.is_committee_member,
          }))}
        />
      )}
    </div>
  );
}
