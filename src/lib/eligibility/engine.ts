/**
 * Eligibility engine.
 *
 * All rules in one file, with a single public entry point `evaluateClaim`.
 * Pure functions only — no I/O. Hand it the request and context, it tells
 * you what is reimbursable and why.
 *
 * Tested in __tests__/eligibility.test.ts — if you change a rule here,
 * update or add a test there first.
 */

import {
  CATEGORIES_USING_500K_POOL,
  EYE_CARE_COOLDOWN_YEARS,
  EYE_CARE_LIMIT_CENTS,
  GOVT_HOSPITAL_MAX_DAYS,
  GOVT_HOSPITAL_PER_DAY_CENTS,
  POOL_500K_CAP_CENTS,
  PRIVATE_HOSPITAL_HIGH_BILL_THRESHOLD_CENTS,
  PRIVATE_HOSPITAL_LOW_BILL_PERCENT,
  TESTING_ANNUAL_MAX_CENTS,
  TESTING_COINSURANCE_CAP_CENTS,
  TESTING_COINSURANCE_PERCENT,
  TESTING_FREE_TIER_CENTS,
  type ClaimRequest,
  type EligibilityContext,
  type EligibilityDecision,
  type HistoricalClaim,
} from "./types";

// -- Helpers ------------------------------------------------------------------

function approvedOnly(history: HistoricalClaim[]): HistoricalClaim[] {
  return history.filter((c) => c.status === "approved");
}

function sumReimbursed(claims: HistoricalClaim[]): number {
  return claims.reduce((acc, c) => acc + c.reimbursable_amount_cents, 0);
}

function pool500kRemaining(history: HistoricalClaim[]): number {
  const drawing = approvedOnly(history).filter((c) =>
    CATEGORIES_USING_500K_POOL.has(c.category)
  );
  const used = sumReimbursed(drawing);
  return Math.max(0, POOL_500K_CAP_CENTS - used);
}

/** Returns the most recent approved eye_care claim for a person, or null. */
function lastEyeCareClaim(
  history: HistoricalClaim[],
  personId: string
): HistoricalClaim | null {
  const eye = approvedOnly(history)
    .filter((c) => c.category === "eye_care" && c.person_id === personId)
    .sort((a, b) => b.service_date.localeCompare(a.service_date));
  return eye[0] ?? null;
}

/** YYYY-MM-DD date diff in whole years (calendar-based, not 365-day-based). */
function yearsBetween(earlier: string, later: string): number {
  const [ey, em, ed] = earlier.split("-").map(Number);
  const [ly, lm, ld] = later.split("-").map(Number);
  let years = ly - ey;
  if (lm < em || (lm === em && ld < ed)) years -= 1;
  return years;
}

/** Sum testing-pool spend in the calendar year of the given service date. */
function testingPoolUsedThisYear(
  history: HistoricalClaim[],
  serviceDate: string
): number {
  const year = serviceDate.slice(0, 4);
  return sumReimbursed(
    approvedOnly(history).filter(
      (c) => c.category === "testing" && c.service_date.startsWith(year)
    )
  );
}

// -- Per-category rules -------------------------------------------------------

interface InternalDecision {
  reimbursable_amount_cents: number;
  reason: string;
}

function evaluatePrivateHospital(
  request: ClaimRequest,
  poolRemaining: number
): InternalDecision {
  if (poolRemaining <= 0) {
    return {
      reimbursable_amount_cents: 0,
      reason: "The LKR 500,000 family limit has been fully used.",
    };
  }

  let computed: number;
  let reason: string;

  if (request.bill_amount_cents >= PRIVATE_HOSPITAL_HIGH_BILL_THRESHOLD_CENTS) {
    // High bill (≥ 1M LKR) → pay the entire remaining pool (up to 500k cap)
    computed = POOL_500K_CAP_CENTS;
    reason =
      "Private hospital bill is LKR 1,000,000 or more — full LKR 500,000 family limit paid in one lump.";
  } else {
    // Low bill (< 1M LKR) → pay 25% of the bill
    computed = Math.floor(
      (request.bill_amount_cents * PRIVATE_HOSPITAL_LOW_BILL_PERCENT) / 100
    );
    reason = `Private hospital bill under LKR 1,000,000 — 25% reimbursement.`;
  }

  // Cannot exceed remaining pool
  const amount = Math.min(computed, poolRemaining);
  if (amount < computed) {
    reason += ` Capped at remaining family balance.`;
  }
  return { reimbursable_amount_cents: amount, reason };
}

function evaluateGovernmentHospital(
  request: ClaimRequest,
  poolRemaining: number
): InternalDecision {
  if (poolRemaining <= 0) {
    return {
      reimbursable_amount_cents: 0,
      reason: "The LKR 500,000 family limit has been fully used.",
    };
  }

  const days = request.days_count ?? 0;
  if (days <= 0) {
    return {
      reimbursable_amount_cents: 0,
      reason: "Number of admission days is required for government hospital claims.",
    };
  }

  const eligibleDays = Math.min(days, GOVT_HOSPITAL_MAX_DAYS);
  let computed = eligibleDays * GOVT_HOSPITAL_PER_DAY_CENTS;

  // Can never reimburse more than the bill
  if (computed > request.bill_amount_cents) {
    computed = request.bill_amount_cents;
  }

  const amount = Math.min(computed, poolRemaining);

  let reason = `Government hospital reimbursement: LKR 2,500 × ${eligibleDays} day${eligibleDays === 1 ? "" : "s"}.`;
  if (days > GOVT_HOSPITAL_MAX_DAYS) {
    reason += ` Day cap of ${GOVT_HOSPITAL_MAX_DAYS} applied.`;
  }
  if (amount < computed) {
    reason += ` Capped at remaining family balance.`;
  }
  return { reimbursable_amount_cents: amount, reason };
}

function evaluateEyeCare(
  request: ClaimRequest,
  context: EligibilityContext,
  poolRemaining: number
): InternalDecision {
  if (!context.is_member_or_spouse) {
    return {
      reimbursable_amount_cents: 0,
      reason:
        "Eye care is only available to the committee member and their spouse.",
    };
  }

  if (poolRemaining <= 0) {
    return {
      reimbursable_amount_cents: 0,
      reason: "The LKR 500,000 family limit has been fully used.",
    };
  }

  const last = lastEyeCareClaim(context.history, request.person_id);
  if (last) {
    const yrs = yearsBetween(last.service_date, context.service_date);
    if (yrs < EYE_CARE_COOLDOWN_YEARS) {
      const eligibleFrom = addYears(last.service_date, EYE_CARE_COOLDOWN_YEARS);
      return {
        reimbursable_amount_cents: 0,
        reason: `Eye care is available once every ${EYE_CARE_COOLDOWN_YEARS} years. Last claim was ${last.service_date}; next eligible from ${eligibleFrom}.`,
      };
    }
  }

  let computed = Math.min(request.bill_amount_cents, EYE_CARE_LIMIT_CENTS);
  const amount = Math.min(computed, poolRemaining);

  let reason = `Eye care reimbursement up to LKR 15,000 per person every 3 years.`;
  if (computed < request.bill_amount_cents) {
    reason += ` Bill exceeds LKR 15,000 limit.`;
  }
  if (amount < computed) {
    reason += ` Capped at remaining family balance.`;
  }
  return { reimbursable_amount_cents: amount, reason };
}

function evaluateTesting(
  request: ClaimRequest,
  context: EligibilityContext
): InternalDecision {
  const usedThisYear = testingPoolUsedThisYear(
    context.history,
    context.service_date
  );
  const remainingAnnual = Math.max(0, TESTING_ANNUAL_MAX_CENTS - usedThisYear);

  if (remainingAnnual <= 0) {
    return {
      reimbursable_amount_cents: 0,
      reason: "Annual testing limit (LKR 17,500) has been fully used this year.",
    };
  }

  // Apply the two-tier rule on THIS bill alone, treating earlier-this-year
  // claims as having already consumed part of the annual cap.
  // We simulate: start with the full free tier and coinsurance cap, then
  // subtract what's been spent.

  let freeTierRemaining = TESTING_FREE_TIER_CENTS;
  let coinsuranceCapRemaining = TESTING_COINSURANCE_CAP_CENTS;

  // Subtract previous usage from free tier first, then coinsurance.
  let toSubtract = usedThisYear;
  const fromFree = Math.min(toSubtract, freeTierRemaining);
  freeTierRemaining -= fromFree;
  toSubtract -= fromFree;
  // Whatever the user already received as coinsurance reimbursement implies
  // 2× of that came out of the coinsurance bill pool.
  const usedCoinsuranceBill = toSubtract * 2;
  coinsuranceCapRemaining = Math.max(0, coinsuranceCapRemaining - usedCoinsuranceBill);

  let bill = request.bill_amount_cents;
  let reimbursable = 0;

  // First, the free tier
  const freeUsedNow = Math.min(bill, freeTierRemaining);
  reimbursable += freeUsedNow;
  bill -= freeUsedNow;

  // Then 50% of the next chunk, up to the coinsurance bill cap
  if (bill > 0 && coinsuranceCapRemaining > 0) {
    const coinsuranceBillNow = Math.min(bill, coinsuranceCapRemaining);
    reimbursable += Math.floor(
      (coinsuranceBillNow * TESTING_COINSURANCE_PERCENT) / 100
    );
  }

  // Anything past the bill cap is out of pocket for the user.
  let reason = "Testing: first LKR 10,000 reimbursed in full, next LKR 15,000 at 50%.";
  if (usedThisYear > 0) {
    reason += ` LKR ${(usedThisYear / 100).toLocaleString("en-LK")} already reimbursed this year.`;
  }
  if (reimbursable === 0) {
    reason = "Annual testing limit has no remaining benefit for this bill.";
  }

  return { reimbursable_amount_cents: reimbursable, reason };
}

// -- Utilities ----------------------------------------------------------------

function addYears(dateStr: string, years: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  return `${y + years}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

// -- Public entry point -------------------------------------------------------

/**
 * Evaluate a claim request. The single source of truth for eligibility.
 * Always call this from the server (server actions). Never trust the client.
 */
export function evaluateClaim(
  request: ClaimRequest,
  context: EligibilityContext
): EligibilityDecision {
  // Basic sanity check
  if (request.bill_amount_cents <= 0) {
    return failed(0, 0, "Bill amount must be greater than zero.");
  }

  const poolBefore = pool500kRemaining(context.history);

  let internal: InternalDecision;
  switch (request.category) {
    case "hospital_private":
      internal = evaluatePrivateHospital(request, poolBefore);
      break;
    case "hospital_government":
      internal = evaluateGovernmentHospital(request, poolBefore);
      break;
    case "eye_care":
      internal = evaluateEyeCare(request, context, poolBefore);
      break;
    case "testing":
      internal = evaluateTesting(request, context);
      break;
  }

  // Compute pool-after.
  const drawsFromPool = CATEGORIES_USING_500K_POOL.has(request.category);
  const poolAfter = drawsFromPool
    ? Math.max(0, poolBefore - internal.reimbursable_amount_cents)
    : poolBefore;

  return {
    eligible: internal.reimbursable_amount_cents > 0,
    reimbursable_amount_cents: internal.reimbursable_amount_cents,
    reason: internal.reason,
    pool_500k_remaining_before_cents: poolBefore,
    pool_500k_remaining_after_cents: poolAfter,
  };
}

function failed(
  before: number,
  after: number,
  reason: string
): EligibilityDecision {
  return {
    eligible: false,
    reimbursable_amount_cents: 0,
    reason,
    pool_500k_remaining_before_cents: before,
    pool_500k_remaining_after_cents: after,
  };
}
