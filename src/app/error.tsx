"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production, send this to your error monitoring service.
    console.error(error);
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg)]">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold">Something went wrong</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          The page couldn&apos;t be loaded. Please try again, or contact your
          administrator if the problem continues.
        </p>
        {error.digest && (
          <p className="text-xs text-[var(--color-text-subtle)] mt-3 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-6 flex gap-3 justify-center">
          <Button variant="secondary" onClick={reset}>
            Try again
          </Button>
          <Button asChild>
            <a href="/dashboard">Back to dashboard</a>
          </Button>
        </div>
      </div>
    </div>
  );
}
