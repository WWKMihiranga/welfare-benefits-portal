"use client";

import { useState, useEffect, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Send, AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatLKR } from "@/lib/utils/format";
import { previewEligibility, submitClaim } from "@/lib/actions/claims";
import type { ClaimCategory } from "@/lib/eligibility/types";

interface PersonOption {
  id: string;
  full_name: string;
  relationship: "member" | "spouse" | "child";
  is_committee_member: boolean;
}

const CATEGORY_OPTIONS: Array<{
  value: ClaimCategory;
  label: string;
  description: string;
}> = [
  {
    value: "hospital_private",
    label: "Hospital — Private",
    description:
      "Private hospital bill. 25% reimbursement, or full LKR 500,000 if bill ≥ LKR 1,000,000.",
  },
  {
    value: "hospital_government",
    label: "Hospital — Government",
    description: "LKR 2,500 per admission day, up to 25 days.",
  },
  {
    value: "eye_care",
    label: "Eye scans & spectacles",
    description:
      "Up to LKR 15,000 per person, every 3 years. Member and spouse only.",
  },
  {
    value: "testing",
    label: "Medical testing",
    description:
      "Annual: first LKR 10,000 reimbursed in full, next LKR 15,000 at 50%.",
  },
];

export function SubmitClaimForm({ persons }: { persons: PersonOption[] }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [personId, setPersonId] = useState(persons[0]?.id ?? "");
  const [category, setCategory] = useState<ClaimCategory>("hospital_private");
  const [serviceDate, setServiceDate] = useState("");
  const [billAmount, setBillAmount] = useState("");
  const [daysCount, setDaysCount] = useState("");
  const [notes, setNotes] = useState("");

  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  const [preview, setPreview] = useState<{
    reimbursable_amount_cents: number;
    reason: string;
    pool_500k_remaining_after_cents: number;
    eligible: boolean;
  } | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  function fieldError(name: string) {
    return fieldErrors[name]?.[0];
  }

  // Derive preview eligibility whenever the inputs settle. Debounce 500ms.
  const previewKey = useMemo(
    () =>
      JSON.stringify({
        personId,
        category,
        serviceDate,
        billAmount,
        daysCount: category === "hospital_government" ? daysCount : "",
      }),
    [personId, category, serviceDate, billAmount, daysCount]
  );

  useEffect(() => {
    const bill = parseFloat(billAmount);
    const days = parseInt(daysCount, 10);

    // Only request a preview when the inputs are minimally valid
    if (!personId || !serviceDate || !isFinite(bill) || bill <= 0) {
      setPreview(null);
      return;
    }
    if (category === "hospital_government" && (!isFinite(days) || days < 1)) {
      setPreview(null);
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);

    const timer = setTimeout(async () => {
      const result = await previewEligibility({
        person_id: personId,
        category,
        service_date: serviceDate,
        bill_amount_rupees: bill,
        days_count: category === "hospital_government" ? days : undefined,
      });
      if (cancelled) return;
      if (result.ok) {
        setPreview({
          reimbursable_amount_cents: result.data.reimbursable_amount_cents,
          reason: result.data.reason,
          pool_500k_remaining_after_cents:
            result.data.pool_500k_remaining_after_cents,
          eligible: result.data.eligible,
        });
      } else {
        setPreview(null);
      }
      setPreviewLoading(false);
    }, 500);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      setPreviewLoading(false);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewKey]);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTopError(null);
    setFieldErrors({});

    const bill = parseFloat(billAmount);
    const days = parseInt(daysCount, 10);

    startTransition(async () => {
      const result = await submitClaim({
        person_id: personId,
        category,
        service_date: serviceDate,
        bill_amount_rupees: bill,
        days_count: category === "hospital_government" ? days : undefined,
        member_notes: notes,
      });

      if (result.ok) {
        router.push(`/claims/${result.data.claim_id}`);
      } else {
        setTopError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      }
    });
  }

  const currentCategoryDescription = CATEGORY_OPTIONS.find(
    (c) => c.value === category
  )?.description;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Claim details</CardTitle>
          <CardDescription>
            All claims are reviewed by an administrator before payment.
          </CardDescription>
        </CardHeader>

        <div className="space-y-4">
          {/* Person */}
          <div>
            <Label htmlFor="person_id">Person</Label>
            <select
              id="person_id"
              value={personId}
              onChange={(e) => setPersonId(e.target.value)}
              disabled={isPending}
              required
              className="h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--color-accent)]"
            >
              {persons.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.full_name}
                  {p.is_committee_member
                    ? " (Committee member)"
                    : p.relationship === "spouse"
                    ? " (Spouse)"
                    : " (Child)"}
                </option>
              ))}
            </select>
            <FieldError msg={fieldError("person_id")} />
          </div>

          {/* Category */}
          <div>
            <Label htmlFor="category">Claim type</Label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as ClaimCategory)}
              disabled={isPending}
              required
              className="h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--color-accent)]"
            >
              {CATEGORY_OPTIONS.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            {currentCategoryDescription && (
              <p className="text-xs text-[var(--color-text-muted)] mt-1.5 flex items-start gap-1.5">
                <Info className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                {currentCategoryDescription}
              </p>
            )}
          </div>

          {/* Service date + Bill amount */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="service_date">Service date</Label>
              <Input
                id="service_date"
                type="date"
                value={serviceDate}
                onChange={(e) => setServiceDate(e.target.value)}
                disabled={isPending}
                required
                max={new Date().toISOString().slice(0, 10)}
              />
              <FieldError msg={fieldError("service_date")} />
            </div>
            <div>
              <Label htmlFor="bill_amount">Bill amount (LKR)</Label>
              <Input
                id="bill_amount"
                type="number"
                min="0"
                step="0.01"
                value={billAmount}
                onChange={(e) => setBillAmount(e.target.value)}
                disabled={isPending}
                required
                placeholder="e.g. 25000"
              />
              <FieldError msg={fieldError("bill_amount_rupees")} />
            </div>
          </div>

          {/* Days count (only for government hospital) */}
          {category === "hospital_government" && (
            <div>
              <Label htmlFor="days_count">Number of admission days</Label>
              <Input
                id="days_count"
                type="number"
                min="1"
                max="365"
                value={daysCount}
                onChange={(e) => setDaysCount(e.target.value)}
                disabled={isPending}
                required
                placeholder="e.g. 5"
              />
              <FieldError msg={fieldError("days_count")} />
            </div>
          )}

          {/* Notes */}
          <div>
            <Label htmlFor="notes">Notes (optional)</Label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              disabled={isPending}
              maxLength={500}
              rows={3}
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--color-accent)]"
              placeholder="Anything the administrator should know."
            />
          </div>
        </div>
      </Card>

      {/* Eligibility preview */}
      <Card
        className={
          preview && !preview.eligible
            ? "border-[var(--color-warning)]"
            : preview
            ? "border-[var(--color-accent)]"
            : undefined
        }
      >
        <CardHeader>
          <CardTitle>Estimated reimbursement</CardTitle>
          <CardDescription>
            This is the final amount, subject to administrator approval.
          </CardDescription>
        </CardHeader>

        {previewLoading ? (
          <p className="text-sm text-[var(--color-text-muted)]">Calculating…</p>
        ) : !preview ? (
          <p className="text-sm text-[var(--color-text-subtle)]">
            Fill in the details above to see your estimate.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="text-3xl font-semibold">
              {formatLKR(preview.reimbursable_amount_cents)}
            </div>
            <p
              className={`text-sm flex items-start gap-2 ${
                preview.eligible
                  ? "text-[var(--color-text-muted)]"
                  : "text-[var(--color-warning)]"
              }`}
            >
              {!preview.eligible && (
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              )}
              {preview.reason}
            </p>
            {category !== "testing" && (
              <p className="text-xs text-[var(--color-text-subtle)] pt-2 border-t border-[var(--color-border)]">
                Family pool balance after this claim:{" "}
                {formatLKR(preview.pool_500k_remaining_after_cents)}
              </p>
            )}
          </div>
        )}
      </Card>

      {topError && (
        <div
          role="alert"
          className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-md px-4 py-3"
        >
          {topError}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/claims")}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending || !preview}>
          <Send className="h-4 w-4" />
          {isPending ? "Submitting…" : "Submit claim"}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ msg }: { msg?: string }) {
  if (!msg) return null;
  return (
    <p className="text-xs text-[var(--color-danger)] mt-1" role="alert">
      {msg}
    </p>
  );
}
