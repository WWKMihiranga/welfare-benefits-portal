"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { writeAudit } from "@/lib/audit/log";
import { addMemberSchema } from "@/lib/validation/members";

/**
 * The shape returned to the client by server actions in this module.
 * Using a discriminated union so the UI can branch on `ok`.
 */
export type ActionResult<T = unknown> =
  | { ok: true; data: T }
  | { ok: false; error: string; fieldErrors?: Record<string, string[]> };

/**
 * Server action: invite a new committee member and enroll their family.
 *
 * Flow:
 *   1. Verify caller is admin.
 *   2. Parse + validate the form payload with Zod.
 *   3. Send invite email via auth.admin.inviteUserByEmail
 *      (also creates the auth.users row, which fires our trigger to create
 *      the profile row).
 *   4. Call fn_complete_member_enrollment which atomically creates the
 *      family_unit and persons rows.
 *   5. Write audit entry.
 *   6. Revalidate the members directory.
 *
 * Returns the new family_unit_id on success, or a structured error.
 */
export async function inviteMember(
  formInput: unknown
): Promise<ActionResult<{ family_unit_id: string }>> {
  // 1. Auth
  const { user } = await requireAdmin();

  // 2. Validate
  const parsed = addMemberSchema.safeParse(formInput);
  if (!parsed.success) {
    return {
      ok: false,
      error: "Please fix the highlighted fields and try again.",
      fieldErrors: parsed.error.flatten().fieldErrors as Record<
        string,
        string[]
      >,
    };
  }
  const input = parsed.data;

  const admin = createAdminClient();

  // 3. Invite the auth user. This sends an email with a confirmation link
  //    that redirects to /auth/confirm. The user will set their password
  //    on first login.
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3000";

  const { data: inviteData, error: inviteError } =
    await admin.auth.admin.inviteUserByEmail(input.member_email, {
      data: {
        full_name: input.member_full_name,
      },
      redirectTo: `${appUrl}/auth/confirm?next=/dashboard`,
    });

  if (inviteError || !inviteData.user) {
    return {
      ok: false,
      error:
        inviteError?.message ??
        "Could not send the invitation. Please try again.",
    };
  }

  const newAuthUserId = inviteData.user.id;

  // 4. Atomically create family_unit + persons
  const childrenPayload = input.children.map((c) => ({
    full_name: c.full_name,
    nic: c.nic ?? null,
    date_of_birth: c.date_of_birth ?? null,
  }));

  const { data: enrollmentRows, error: enrollError } = await admin.rpc(
    "fn_complete_member_enrollment",
    {
      p_auth_user_id: newAuthUserId,
      p_member_full_name: input.member_full_name,
      p_member_nic: input.member_nic ?? null,
      p_member_dob: input.member_date_of_birth ?? null,
      p_spouse_full_name: input.has_spouse
        ? input.spouse_full_name ?? null
        : null,
      p_spouse_nic: input.has_spouse ? input.spouse_nic ?? null : null,
      p_spouse_dob: input.has_spouse
        ? input.spouse_date_of_birth ?? null
        : null,
      p_children: childrenPayload,
    }
  );

  if (enrollError || !enrollmentRows || enrollmentRows.length === 0) {
    // Best-effort rollback: delete the auth user we just created so the
    // admin can retry without an orphaned auth.users row.
    await admin.auth.admin.deleteUser(newAuthUserId);
    return {
      ok: false,
      error:
        "Invitation email was sent, but creating the family record failed. " +
        "The invite has been rolled back. Please try again.",
    };
  }

  const familyUnitId = enrollmentRows[0].family_unit_id as string;

  // 5. Audit
  await writeAudit({
    actorId: user.id,
    action: "member.created",
    entityType: "family_unit",
    entityId: familyUnitId,
    details: {
      email: input.member_email,
      member_name: input.member_full_name,
      has_spouse: input.has_spouse,
      child_count: input.children.length,
    },
  });

  // 6. Refresh the directory
  revalidatePath("/members");
  revalidatePath("/dashboard");

  return { ok: true, data: { family_unit_id: familyUnitId } };
}

/**
 * Server action: archive a family unit (soft delete).
 *
 * Archiving sets archived_at on the family_unit and all its persons. The
 * auth user is left alone — they can still sign in but will have no family
 * context. (Future enhancement: also disable the auth user.)
 *
 * Claims are NOT archived — historical records must remain visible.
 */
export async function archiveFamilyUnit(
  familyUnitId: string
): Promise<ActionResult<{ archived: true }>> {
  const { user, supabase } = await requireAdmin();

  // Validate the id format minimally
  if (!/^[0-9a-f-]{36}$/i.test(familyUnitId)) {
    return { ok: false, error: "Invalid family unit id." };
  }

  const now = new Date().toISOString();

  // Archive the family unit. RLS allows admin write.
  const { error: unitError } = await supabase
    .from("family_units")
    .update({ archived_at: now })
    .eq("id", familyUnitId);

  if (unitError) {
    return { ok: false, error: `Could not archive: ${unitError.message}` };
  }

  // Archive all persons in the unit
  const { error: personsError } = await supabase
    .from("persons")
    .update({ archived_at: now })
    .eq("family_unit_id", familyUnitId)
    .is("archived_at", null);

  if (personsError) {
    return {
      ok: false,
      error: `Family unit archived but persons update failed: ${personsError.message}`,
    };
  }

  await writeAudit({
    actorId: user.id,
    action: "member.archived",
    entityType: "family_unit",
    entityId: familyUnitId,
  });

  revalidatePath("/members");
  revalidatePath(`/members/${familyUnitId}`);
  return { ok: true, data: { archived: true } };
}
