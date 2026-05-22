/**
 * Types used by the eligibility engine.
 *
 * The engine takes a *claim request* (what the user is asking to claim)
 * and a snapshot of *historical context* (what has already been claimed
 * for this family / person), and returns a *decision* (whether the claim
 * is eligible and for how much).
 *
 * All amounts are in LKR cents (integer). All dates are ISO strings.
 *
 * The engine is intentionally a pure function: no DB, no I/O. Callers
 * (server actions) load the context from the DB and pass it in. This
 * makes the rules trivially testable and impossible to subtly break
 * with a stray query.
 */

export type ClaimCategory =
  | "hospital_private"
  | "hospital_government"
  | "eye_care"
  | "testing";

/** A historical claim used to compute remaining balances. */
export interface HistoricalClaim {
  id: string;
  category: ClaimCategory;
  /** Only counted if status is 'approved'. */
  status: "draft" | "pending" | "approved" | "rejected" | "reversed";
  /** Whose claim it was (relevant for per-person eye-care quota). */
  person_id: string;
  /** Date the service was rendered (used for the 3-year eye-care window
   * and the annual testing pool reset). ISO date string, YYYY-MM-DD. */
  service_date: string;
  /** The amount we already paid out for this claim, in LKR cents. */
  reimbursable_amount_cents: number;
}

/** Snapshot of the world the engine needs to make a decision. */
export interface EligibilityContext {
  /** All approved historical claims for the family unit, any category. */
  history: HistoricalClaim[];
  /** Service date of the current claim (ISO YYYY-MM-DD). */
  service_date: string;
  /** Whether the person being claimed for is the committee member or spouse
   * (only they are eligible for eye-care). */
  is_member_or_spouse: boolean;
}

/** What the user is asking to claim. */
export interface ClaimRequest {
  category: ClaimCategory;
  person_id: string;
  /** Bill amount in LKR cents. Must be > 0. */
  bill_amount_cents: number;
  /** For hospital_government only: number of admission days. */
  days_count?: number;
}

/** The engine's verdict. */
export interface EligibilityDecision {
  /** True if any reimbursement is owed. */
  eligible: boolean;
  /** How much we will reimburse (in LKR cents). 0 if not eligible. */
  reimbursable_amount_cents: number;
  /** Human-readable explanation, suitable to show in the UI. */
  reason: string;
  /** Family pool (500k) remaining BEFORE this claim. */
  pool_500k_remaining_before_cents: number;
  /** Family pool (500k) remaining AFTER this claim. */
  pool_500k_remaining_after_cents: number;
}

// -- Constants ----------------------------------------------------------------
// All amounts in LKR cents.

export const POOL_500K_CAP_CENTS = 500_000 * 100; // 50,000,000
export const PRIVATE_HOSPITAL_HIGH_BILL_THRESHOLD_CENTS = 1_000_000 * 100;
export const PRIVATE_HOSPITAL_LOW_BILL_PERCENT = 25; // 25 %
export const GOVT_HOSPITAL_PER_DAY_CENTS = 2_500 * 100;
export const GOVT_HOSPITAL_MAX_DAYS = 25;
export const EYE_CARE_LIMIT_CENTS = 15_000 * 100;
export const EYE_CARE_COOLDOWN_YEARS = 3;

export const TESTING_FREE_TIER_CENTS = 10_000 * 100;
export const TESTING_COINSURANCE_PERCENT = 50; // 50 %
export const TESTING_COINSURANCE_CAP_CENTS = 15_000 * 100;
export const TESTING_ANNUAL_MAX_CENTS =
  TESTING_FREE_TIER_CENTS +
  Math.floor((TESTING_COINSURANCE_CAP_CENTS * TESTING_COINSURANCE_PERCENT) / 100);
// = 1,750,000 cents = LKR 17,500

/** Categories that draw from the shared LKR 500,000 family pool. */
export const CATEGORIES_USING_500K_POOL: ReadonlySet<ClaimCategory> = new Set<ClaimCategory>([
  "hospital_private",
  "hospital_government",
  "eye_care",
]);
