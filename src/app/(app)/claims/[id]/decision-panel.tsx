"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, X, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { decideClaim, reverseClaim } from "@/lib/actions/claims";
import { formatLKR } from "@/lib/utils/format";

export function ClaimDecisionPanel({
  claimId,
  currentEstimateCents,
  billAmountCents,
  reverseMode = false,
}: {
  claimId: string;
  currentEstimateCents: number;
  billAmountCents: number;
  reverseMode?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [decision, setDecision] = useState<"approve" | "reject" | null>(null);
  const [overrideAmount, setOverrideAmount] = useState("");
  const [useOverride, setUseOverride] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  // Reverse mode
  const [reverseConfirm, setReverseConfirm] = useState(false);
  const [reverseReason, setReverseReason] = useState("");

  function fieldError(name: string) {
    return fieldErrors[name]?.[0];
  }

  function handleDecide() {
    if (!decision) return;
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const overrideRupees =
        decision === "approve" && useOverride && overrideAmount
          ? parseFloat(overrideAmount)
          : undefined;

      const result = await decideClaim({
        claim_id: claimId,
        decision,
        override_amount_rupees: overrideRupees,
        admin_notes: adminNotes,
      });

      if (result.ok) {
        toast.show(
          decision === "approve" ? "Claim approved." : "Claim rejected.",
          decision === "approve" ? "success" : "info"
        );
        router.refresh();
      } else {
        setError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      }
    });
  }

  function handleReverse() {
    setError(null);
    if (reverseReason.trim().length < 5) {
      setError("Please provide a reason of at least 5 characters.");
      return;
    }
    startTransition(async () => {
      const result = await reverseClaim(claimId, reverseReason.trim());
      if (result.ok) {
        toast.show("Claim has been reversed.", "info");
        router.refresh();
      } else {
        setError(result.error);
      }
    });
  }

  if (reverseMode) {
    return (
      <div>
        {!reverseConfirm ? (
          <Button
            variant="danger"
            onClick={() => setReverseConfirm(true)}
            disabled={isPending}
          >
            <RotateCcw className="h-4 w-4" />
            Reverse this claim
          </Button>
        ) : (
          <div className="space-y-3">
            <div>
              <Label htmlFor="reverse_reason">Reason for reversal</Label>
              <textarea
                id="reverse_reason"
                value={reverseReason}
                onChange={(e) => setReverseReason(e.target.value)}
                disabled={isPending}
                rows={3}
                className="w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--color-accent)]"
                placeholder="Explain why this approval is being reversed."
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setReverseConfirm(false)}
                disabled={isPending}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={handleReverse}
                disabled={isPending || reverseReason.trim().length < 5}
              >
                {isPending ? "Reversing…" : "Confirm reversal"}
              </Button>
            </div>
            {error && (
              <p className="text-sm text-[var(--color-danger)]" role="alert">
                {error}
              </p>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Review this claim</CardTitle>
        <CardDescription>
          The reimbursement will be recomputed when you approve to use the
          latest family balance.
        </CardDescription>
      </CardHeader>

      <div className="space-y-4">
        <div className="flex gap-2">
          <Button
            type="button"
            variant={decision === "approve" ? "primary" : "secondary"}
            onClick={() => setDecision("approve")}
            disabled={isPending}
          >
            <Check className="h-4 w-4" />
            Approve
          </Button>
          <Button
            type="button"
            variant={decision === "reject" ? "danger" : "secondary"}
            onClick={() => setDecision("reject")}
            disabled={isPending}
          >
            <X className="h-4 w-4" />
            Reject
          </Button>
        </div>

        {decision === "approve" && (
          <>
            <div className="text-sm">
              <div className="text-[var(--color-text-muted)]">
                Calculated reimbursement
              </div>
              <div className="font-medium">
                {formatLKR(currentEstimateCents)}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input
                  type="checkbox"
                  checked={useOverride}
                  onChange={(e) => setUseOverride(e.target.checked)}
                  disabled={isPending}
                  className="h-4 w-4 accent-[var(--color-accent)]"
                />
                Override the calculated amount
              </label>
            </div>

            {useOverride && (
              <div>
                <Label htmlFor="override_amount">
                  Reimbursement amount (LKR)
                </Label>
                <Input
                  id="override_amount"
                  type="number"
                  min="0"
                  max={billAmountCents / 100}
                  step="0.01"
                  value={overrideAmount}
                  onChange={(e) => setOverrideAmount(e.target.value)}
                  disabled={isPending}
                  placeholder={(currentEstimateCents / 100).toString()}
                />
                <p className="text-xs text-[var(--color-text-muted)] mt-1">
                  Cannot exceed the bill amount of{" "}
                  {formatLKR(billAmountCents)}.
                </p>
              </div>
            )}
          </>
        )}

        {decision && (
          <div>
            <Label htmlFor="admin_notes">
              Notes {decision === "reject" || useOverride ? "" : "(optional)"}
            </Label>
            <textarea
              id="admin_notes"
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              disabled={isPending}
              rows={3}
              maxLength={500}
              className="w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 py-2 text-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--color-accent)]"
              placeholder={
                decision === "reject"
                  ? "Explain why this claim is being rejected."
                  : useOverride
                  ? "Explain why the calculated amount is being overridden."
                  : "Optional comment."
              }
            />
            <FieldError msg={fieldError("admin_notes")} />
          </div>
        )}

        {error && (
          <p
            role="alert"
            className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-md px-3 py-2"
          >
            {error}
          </p>
        )}

        {decision && (
          <div className="flex justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setDecision(null);
                setAdminNotes("");
                setUseOverride(false);
                setOverrideAmount("");
                setError(null);
                setFieldErrors({});
              }}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button
              variant={decision === "approve" ? "primary" : "danger"}
              onClick={handleDecide}
              disabled={isPending}
            >
              {isPending
                ? "Saving…"
                : decision === "approve"
                ? "Approve claim"
                : "Reject claim"}
            </Button>
          </div>
        )}
      </div>
    </Card>
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
