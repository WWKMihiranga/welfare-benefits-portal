"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function ForgotPasswordPage() {
  const [isPending, startTransition] = useTransition();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      const supabase = createClient();
      const appUrl =
        process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
        window.location.origin;

      const { error: resetError } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          // After clicking the email link, user goes through /auth/confirm,
          // which detects type=recovery and sends them to /auth/set-password.
          redirectTo: `${appUrl}/auth/confirm`,
        }
      );

      if (resetError) {
        // We deliberately don't surface "email not found" to avoid
        // user enumeration. Just show success.
        console.error("Reset password error:", resetError);
      }

      setSent(true);
    });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg)]">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Reset your password
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Enter your email and we&apos;ll send you a reset link.
          </p>
        </div>

        {sent ? (
          <div className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-6 space-y-4 text-center">
            <p className="text-sm text-[var(--color-text)]">
              If an account exists for <strong>{email}</strong>, a reset link
              is on its way. Check your inbox (and spam folder).
            </p>
            <Button asChild variant="secondary" className="w-full">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-6 space-y-4"
          >
            <div>
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isPending}
              />
            </div>
            {error && (
              <div
                role="alert"
                className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-md px-3 py-2"
              >
                {error}
              </div>
            )}
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? "Sending…" : "Send reset link"}
            </Button>
            <div className="text-center">
              <Link
                href="/login"
                className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
              >
                Back to sign in
              </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
