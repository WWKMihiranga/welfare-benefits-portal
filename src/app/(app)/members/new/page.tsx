import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/auth";
import { AddMemberForm } from "./add-member-form";

export default async function AddMemberPage() {
  const { profile } = await requireUser();
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold">Add Member</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Enroll a committee member and their immediate family. The member will
          receive an email invitation to set their own password.
        </p>
      </div>
      <AddMemberForm />
    </div>
  );
}
