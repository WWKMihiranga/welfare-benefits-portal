"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ERROR_MESSAGES: Record<string, string> = {
  invalid_link:
    "That link is missing information. Please request a new password reset.",
  verify_failed:
    "That link has expired or has already been used. Please request a new password reset.",
  session_expired:
    "Your session has expired. Please sign in again.",
  no_profile:
    "Your account is not fully set up. Please contact your administrator.",
};

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next") ?? "/dashboard";
  const urlError = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(
    urlError ? ERROR_MESSAGES[urlError] ?? null : null
  );
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    if (error) {
      setError("That email or password didn't match. Please try again.");
      setLoading(false);
      return;
    }

    router.push(nextPath);
    router.refresh();
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg)]">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Welfare Portal
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Sign in to continue
          </p>
        </div>

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
              disabled={loading}
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
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

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in…" : "Sign in"}
          </Button>

          <div className="text-center">
            <a
              href="/forgot-password"
              className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
            >
              Forgot your password?
            </a>
          </div>
        </form>

        <p className="text-xs text-[var(--color-text-subtle)] text-center mt-6">
          Don&apos;t have an account? Contact your administrator.
        </p>
      </div>
    </div>
  );
}
