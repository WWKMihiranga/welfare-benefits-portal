"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { Button } from "@/components/ui/button";
import { archiveFamilyUnit } from "@/lib/actions/members";

export function ArchiveMemberButton({
  familyUnitId,
}: {
  familyUnitId: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleArchive() {
    setError(null);
    startTransition(async () => {
      const result = await archiveFamilyUnit(familyUnitId);
      if (result.ok) {
        router.push("/members");
        router.refresh();
      } else {
        setError(result.error);
        setConfirming(false);
      }
    });
  }

  if (!confirming) {
    return (
      <Button
        variant="secondary"
        size="sm"
        onClick={() => setConfirming(true)}
        disabled={isPending}
      >
        <Archive className="h-4 w-4" />
        Archive
      </Button>
    );
  }

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="text-xs text-[var(--color-text-muted)]">
        Archive this member? Their data is preserved.
      </div>
      <div className="flex gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirming(false)}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button
          variant="danger"
          size="sm"
          onClick={handleArchive}
          disabled={isPending}
        >
          {isPending ? "Archiving…" : "Yes, archive"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-[var(--color-danger)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
