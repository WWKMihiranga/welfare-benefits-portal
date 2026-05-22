import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg)]">
      <div className="text-center max-w-sm">
        <p className="text-sm text-[var(--color-text-subtle)] uppercase tracking-wide">
          404
        </p>
        <h1 className="text-2xl font-semibold mt-2">Page not found</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-2">
          The page you&apos;re looking for doesn&apos;t exist, or you may not
          have access to it.
        </p>
        <Button asChild className="mt-6">
          <Link href="/dashboard">Back to dashboard</Link>
        </Button>
      </div>
    </div>
  );
}
