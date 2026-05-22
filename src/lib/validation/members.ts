import { z } from "zod";

// -- Reusable primitives -----------------------------------------------------

const trimmedString = (max: number) =>
  z
    .string()
    .trim()
    .min(1, "Required")
    .max(max, `Must be ${max} characters or fewer`);

// Sri Lanka NIC: either 9 digits + V/X (old format) or 12 digits (new format).
// We accept optional whitespace and uppercase it before validating.
const nicRegex = /^([0-9]{9}[VvXx]|[0-9]{12})$/;

const nicSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(nicRegex, "Enter a valid NIC (9 digits + V/X, or 12 digits)")
  .optional()
  .or(z.literal("").transform(() => undefined));

// ISO date string YYYY-MM-DD, must be in the past
const dateOfBirthSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid date")
  .refine((s) => {
    const d = new Date(s + "T00:00:00Z");
    return !isNaN(d.getTime()) && d.getTime() < Date.now();
  }, "Date of birth must be in the past")
  .optional()
  .or(z.literal("").transform(() => undefined));

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email("Enter a valid email address")
  .max(255);

// -- Person schemas ----------------------------------------------------------

export const newSpouseSchema = z.object({
  full_name: trimmedString(120),
  nic: nicSchema,
  date_of_birth: dateOfBirthSchema,
});

export const newChildSchema = z.object({
  full_name: trimmedString(120),
  date_of_birth: dateOfBirthSchema,
  nic: nicSchema,
});

// -- Add Member (combined) ---------------------------------------------------

export const addMemberSchema = z.object({
  // The committee member
  member_full_name: trimmedString(120),
  member_email: emailSchema,
  member_nic: nicSchema,
  member_date_of_birth: dateOfBirthSchema,

  // Optional spouse — all-or-nothing
  has_spouse: z.boolean(),
  spouse_full_name: z
    .string()
    .trim()
    .max(120)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  spouse_nic: nicSchema,
  spouse_date_of_birth: dateOfBirthSchema,

  // Children — variable list (parsed from form data as an array)
  children: z.array(newChildSchema).max(20, "At most 20 children").default([]),
}).superRefine((data, ctx) => {
  // If has_spouse is true, spouse_full_name is required
  if (data.has_spouse && !data.spouse_full_name) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["spouse_full_name"],
      message: "Spouse name is required",
    });
  }
});

export type AddMemberInput = z.infer<typeof addMemberSchema>;
