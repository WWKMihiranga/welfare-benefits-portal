import { z } from "zod";

// -- Reusable primitives -----------------------------------------------------

const positiveAmountCents = z
  .number({ invalid_type_error: "Enter a valid amount" })
  .int("Amount must be a whole number of cents")
  .positive("Amount must be greater than zero")
  .max(100_000_000_00, "Amount is too large"); // sanity cap: LKR 10 crore

const isoDate = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    if (isNaN(d.getTime())) return false;
    // Service date must be in the past or today, but not absurdly old
    const now = Date.now();
    const tenYearsAgo = now - 10 * 365 * 24 * 60 * 60 * 1000;
    return d.getTime() <= now && d.getTime() >= tenYearsAgo;
  }, "Service date must be within the past 10 years and not in the future");

const claimCategorySchema = z.enum([
  "hospital_private",
  "hospital_government",
  "eye_care",
  "testing",
]);

// -- Claim submission --------------------------------------------------------

/**
 * The form payload from the member or admin submitting a claim.
 * Bill amount is in LKR rupees (whole units) — we convert to cents server-side.
 *
 * person_id identifies which family member the claim is for. The server
 * verifies the person belongs to the submitter's family unit.
 */
export const submitClaimSchema = z
  .object({
    person_id: z.string().uuid("Select a person"),
    category: claimCategorySchema,
    service_date: isoDate,
    /** Bill amount in LKR (rupees, not cents). Min 1 rupee. */
    bill_amount_rupees: z
      .number({ invalid_type_error: "Enter the bill amount" })
      .positive("Bill amount must be greater than zero")
      .max(100_000_000, "Bill amount is too large"),
    /** Days of admission — only for hospital_government */
    days_count: z
      .number()
      .int()
      .positive()
      .max(365, "Days must be 365 or fewer")
      .optional(),
    member_notes: z
      .string()
      .max(500, "Notes are too long")
      .optional()
      .or(z.literal("").transform(() => undefined)),
  })
  .superRefine((data, ctx) => {
    if (data.category === "hospital_government") {
      if (!data.days_count || data.days_count < 1) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ["days_count"],
          message: "Number of admission days is required",
        });
      }
    }
  });

export type SubmitClaimInput = z.infer<typeof submitClaimSchema>;

// -- Eligibility preview (subset of submit) ----------------------------------

export const previewEligibilitySchema = submitClaimSchema._def.schema.pick({
  person_id: true,
  category: true,
  service_date: true,
  bill_amount_rupees: true,
  days_count: true,
});

// -- Claim decision (admin) --------------------------------------------------

export const decideClaimSchema = z.object({
  claim_id: z.string().uuid(),
  decision: z.enum(["approve", "reject"]),
  /** Admin may override the calculated reimbursement. In rupees. */
  override_amount_rupees: z
    .number()
    .min(0, "Cannot be negative")
    .optional(),
  admin_notes: z
    .string()
    .max(500, "Notes are too long")
    .optional()
    .or(z.literal("").transform(() => undefined)),
}).superRefine((data, ctx) => {
  // If rejecting, admin notes are encouraged but not required
  // If approving with override, note is required for audit clarity
  if (
    data.decision === "approve" &&
    data.override_amount_rupees !== undefined &&
    !data.admin_notes
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["admin_notes"],
      message: "Please add a note explaining the override",
    });
  }
});

export type DecideClaimInput = z.infer<typeof decideClaimSchema>;
