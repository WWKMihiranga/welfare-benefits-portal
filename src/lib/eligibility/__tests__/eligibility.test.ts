/**
 * Tests for the eligibility engine.
 * Run with: npm test
 *
 * Uses Node's built-in test runner (node:test) — no extra dependencies.
 * Each test case is named after the Figma rule it verifies.
 */

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { evaluateClaim } from "../engine";
import type { EligibilityContext, HistoricalClaim } from "../types";

// -- Helpers ------------------------------------------------------------------

const TODAY = "2026-05-11";

function ctx(overrides: Partial<EligibilityContext> = {}): EligibilityContext {
  return {
    history: [],
    service_date: TODAY,
    is_member_or_spouse: true,
    ...overrides,
  };
}

function approved(c: Partial<HistoricalClaim>): HistoricalClaim {
  return {
    id: c.id ?? "h1",
    category: c.category ?? "hospital_private",
    status: "approved",
    person_id: c.person_id ?? "p1",
    service_date: c.service_date ?? "2025-01-01",
    reimbursable_amount_cents: c.reimbursable_amount_cents ?? 0,
  };
}

// LKR → cents
const lkr = (n: number) => n * 100;

// -- Private hospital ---------------------------------------------------------

describe("private hospital", () => {
  it("pays full LKR 500,000 when bill is exactly 1,000,000", () => {
    const d = evaluateClaim(
      {
        category: "hospital_private",
        person_id: "p1",
        bill_amount_cents: lkr(1_000_000),
      },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(500_000));
    assert.equal(d.eligible, true);
  });

  it("pays full LKR 500,000 when bill is over 1,000,000", () => {
    const d = evaluateClaim(
      {
        category: "hospital_private",
        person_id: "p1",
        bill_amount_cents: lkr(2_500_000),
      },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(500_000));
  });

  it("pays 25% when bill is under 1,000,000", () => {
    const d = evaluateClaim(
      {
        category: "hospital_private",
        person_id: "p1",
        bill_amount_cents: lkr(400_000),
      },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(100_000));
  });

  it("caps reimbursement at remaining 500k pool", () => {
    const d = evaluateClaim(
      {
        category: "hospital_private",
        person_id: "p1",
        bill_amount_cents: lkr(2_000_000),
      },
      ctx({
        history: [
          approved({
            category: "hospital_private",
            reimbursable_amount_cents: lkr(450_000),
          }),
        ],
      })
    );
    // Only 50,000 left in the pool
    assert.equal(d.reimbursable_amount_cents, lkr(50_000));
    assert.equal(d.pool_500k_remaining_after_cents, 0);
  });

  it("returns 0 if the pool is fully used", () => {
    const d = evaluateClaim(
      {
        category: "hospital_private",
        person_id: "p1",
        bill_amount_cents: lkr(2_000_000),
      },
      ctx({
        history: [
          approved({
            category: "hospital_private",
            reimbursable_amount_cents: lkr(500_000),
          }),
        ],
      })
    );
    assert.equal(d.reimbursable_amount_cents, 0);
    assert.equal(d.eligible, false);
  });

  it("ignores rejected/reversed history when computing the pool", () => {
    const d = evaluateClaim(
      {
        category: "hospital_private",
        person_id: "p1",
        bill_amount_cents: lkr(400_000),
      },
      ctx({
        history: [
          {
            id: "r1",
            category: "hospital_private",
            status: "rejected",
            person_id: "p1",
            service_date: "2025-01-01",
            reimbursable_amount_cents: lkr(500_000),
          },
        ],
      })
    );
    assert.equal(d.reimbursable_amount_cents, lkr(100_000));
  });
});

// -- Government hospital ------------------------------------------------------

describe("government hospital", () => {
  it("pays LKR 2,500 per day", () => {
    const d = evaluateClaim(
      {
        category: "hospital_government",
        person_id: "p1",
        bill_amount_cents: lkr(20_000),
        days_count: 5,
      },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(12_500));
  });

  it("caps at 25 days", () => {
    const d = evaluateClaim(
      {
        category: "hospital_government",
        person_id: "p1",
        bill_amount_cents: lkr(100_000),
        days_count: 40,
      },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(62_500)); // 25 × 2,500
  });

  it("never reimburses more than the bill", () => {
    const d = evaluateClaim(
      {
        category: "hospital_government",
        person_id: "p1",
        bill_amount_cents: lkr(5_000),
        days_count: 10,
      },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(5_000));
  });

  it("returns 0 if days is missing or 0", () => {
    const d = evaluateClaim(
      {
        category: "hospital_government",
        person_id: "p1",
        bill_amount_cents: lkr(10_000),
        days_count: 0,
      },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, 0);
  });

  it("caps at remaining family pool", () => {
    const d = evaluateClaim(
      {
        category: "hospital_government",
        person_id: "p1",
        bill_amount_cents: lkr(100_000),
        days_count: 25,
      },
      ctx({
        history: [
          approved({
            category: "hospital_private",
            reimbursable_amount_cents: lkr(490_000),
          }),
        ],
      })
    );
    // Only 10,000 left in pool
    assert.equal(d.reimbursable_amount_cents, lkr(10_000));
  });
});

// -- Eye care -----------------------------------------------------------------

describe("eye care", () => {
  it("pays up to LKR 15,000 for the committee member", () => {
    const d = evaluateClaim(
      {
        category: "eye_care",
        person_id: "p1",
        bill_amount_cents: lkr(20_000),
      },
      ctx({ is_member_or_spouse: true })
    );
    assert.equal(d.reimbursable_amount_cents, lkr(15_000));
  });

  it("pays the actual bill if under LKR 15,000", () => {
    const d = evaluateClaim(
      {
        category: "eye_care",
        person_id: "p1",
        bill_amount_cents: lkr(8_000),
      },
      ctx({ is_member_or_spouse: true })
    );
    assert.equal(d.reimbursable_amount_cents, lkr(8_000));
  });

  it("denies if the person is not member or spouse", () => {
    const d = evaluateClaim(
      {
        category: "eye_care",
        person_id: "p1",
        bill_amount_cents: lkr(15_000),
      },
      ctx({ is_member_or_spouse: false })
    );
    assert.equal(d.reimbursable_amount_cents, 0);
    assert.match(d.reason, /committee member and their spouse/);
  });

  it("denies if last eye-care claim was under 3 years ago", () => {
    const d = evaluateClaim(
      {
        category: "eye_care",
        person_id: "p1",
        bill_amount_cents: lkr(15_000),
      },
      ctx({
        is_member_or_spouse: true,
        service_date: "2026-05-11",
        history: [
          approved({
            category: "eye_care",
            person_id: "p1",
            service_date: "2024-06-01",
            reimbursable_amount_cents: lkr(15_000),
          }),
        ],
      })
    );
    assert.equal(d.reimbursable_amount_cents, 0);
    assert.match(d.reason, /every 3 years/);
  });

  it("allows again exactly 3 years after the last claim", () => {
    const d = evaluateClaim(
      {
        category: "eye_care",
        person_id: "p1",
        bill_amount_cents: lkr(12_000),
      },
      ctx({
        is_member_or_spouse: true,
        service_date: "2026-05-11",
        history: [
          approved({
            category: "eye_care",
            person_id: "p1",
            service_date: "2023-05-11",
            reimbursable_amount_cents: lkr(15_000),
          }),
        ],
      })
    );
    assert.equal(d.reimbursable_amount_cents, lkr(12_000));
  });

  it("tracks 3-year cooldown per person, not per family", () => {
    // Spouse claimed last year, but member can still claim
    const d = evaluateClaim(
      {
        category: "eye_care",
        person_id: "p_member",
        bill_amount_cents: lkr(15_000),
      },
      ctx({
        is_member_or_spouse: true,
        history: [
          approved({
            category: "eye_care",
            person_id: "p_spouse",
            service_date: "2025-08-01",
            reimbursable_amount_cents: lkr(15_000),
          }),
        ],
      })
    );
    assert.equal(d.reimbursable_amount_cents, lkr(15_000));
  });
});

// -- Testing (annual renewable pool) ------------------------------------------

describe("testing", () => {
  it("pays 100% for a bill of exactly LKR 10,000", () => {
    const d = evaluateClaim(
      { category: "testing", person_id: "p1", bill_amount_cents: lkr(10_000) },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(10_000));
  });

  it("pays LKR 17,500 maximum on a LKR 25,000 bill", () => {
    const d = evaluateClaim(
      { category: "testing", person_id: "p1", bill_amount_cents: lkr(25_000) },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(17_500));
  });

  it("caps at LKR 17,500 even for very large bills", () => {
    const d = evaluateClaim(
      { category: "testing", person_id: "p1", bill_amount_cents: lkr(500_000) },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(17_500));
  });

  it("pays 100% + 50% on a bill of LKR 15,000", () => {
    // First 10,000 free; next 5,000 at 50% = 2,500 → total 12,500
    const d = evaluateClaim(
      { category: "testing", person_id: "p1", bill_amount_cents: lkr(15_000) },
      ctx()
    );
    assert.equal(d.reimbursable_amount_cents, lkr(12_500));
  });

  it("does NOT draw from the LKR 500,000 family pool", () => {
    const d = evaluateClaim(
      { category: "testing", person_id: "p1", bill_amount_cents: lkr(25_000) },
      ctx({
        history: [
          approved({
            category: "hospital_private",
            reimbursable_amount_cents: lkr(500_000),
          }),
        ],
      })
    );
    assert.equal(d.reimbursable_amount_cents, lkr(17_500));
  });

  it("respects the annual cap across multiple claims in the same year", () => {
    const d = evaluateClaim(
      { category: "testing", person_id: "p1", bill_amount_cents: lkr(25_000) },
      ctx({
        service_date: "2026-08-01",
        history: [
          approved({
            category: "testing",
            person_id: "p1",
            service_date: "2026-02-01",
            reimbursable_amount_cents: lkr(10_000),
          }),
        ],
      })
    );
    // 10k already reimbursed (used free tier). Remaining: coinsurance only,
    // at 50% on up to 15k bill = 7,500.
    assert.equal(d.reimbursable_amount_cents, lkr(7_500));
  });

  it("resets the testing pool at the start of a new calendar year", () => {
    const d = evaluateClaim(
      { category: "testing", person_id: "p1", bill_amount_cents: lkr(25_000) },
      ctx({
        service_date: "2026-01-15",
        history: [
          approved({
            category: "testing",
            person_id: "p1",
            service_date: "2025-12-20",
            reimbursable_amount_cents: lkr(17_500), // maxed out last year
          }),
        ],
      })
    );
    assert.equal(d.reimbursable_amount_cents, lkr(17_500));
  });
});

// -- Pool computation ---------------------------------------------------------

describe("pool computation", () => {
  it("reports the correct remaining pool before and after", () => {
    const d = evaluateClaim(
      {
        category: "hospital_private",
        person_id: "p1",
        bill_amount_cents: lkr(800_000),
      },
      ctx({
        history: [
          approved({
            category: "hospital_government",
            reimbursable_amount_cents: lkr(50_000),
          }),
        ],
      })
    );
    assert.equal(d.pool_500k_remaining_before_cents, lkr(450_000));
    // 25% of 800,000 = 200,000 → remaining 250,000
    assert.equal(d.reimbursable_amount_cents, lkr(200_000));
    assert.equal(d.pool_500k_remaining_after_cents, lkr(250_000));
  });

  it("does not change pool when a testing claim is made", () => {
    const d = evaluateClaim(
      {
        category: "testing",
        person_id: "p1",
        bill_amount_cents: lkr(10_000),
      },
      ctx({
        history: [
          approved({
            category: "hospital_private",
            reimbursable_amount_cents: lkr(100_000),
          }),
        ],
      })
    );
    assert.equal(d.pool_500k_remaining_before_cents, lkr(400_000));
    assert.equal(d.pool_500k_remaining_after_cents, lkr(400_000));
  });
});

// -- Edge cases ---------------------------------------------------------------

describe("edge cases", () => {
  it("rejects zero or negative bill amounts", () => {
    const d = evaluateClaim(
      { category: "testing", person_id: "p1", bill_amount_cents: 0 },
      ctx()
    );
    assert.equal(d.eligible, false);
  });
});
