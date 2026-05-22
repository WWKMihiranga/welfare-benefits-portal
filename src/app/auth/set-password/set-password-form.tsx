"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SessionState =
  | { kind: "loading" }
  | { kind: "ready"; email: string }
  | { kind: "no_session" };

export function SetPasswordPageClient() {
  const router = useRouter();
  const supabase = createClient();
  const [state, setState] = useState<SessionState>({ kind: "loading" });
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Establish a session — three sources are possible:
  //   1. A normal cookie session (from /auth/confirm having called verifyOtp)
  //   2. A URL hash from the legacy email template: #access_token=...&refresh_token=...
  //   3. Nothing → redirect to login
  useEffect(() => {
    let cancelled = false;

    (async () => {
      // Try the URL fragment first — if Supabase sent us legacy-style
      // tokens, set them as the session so updateUser() works.
      if (typeof window !== "undefined" && window.location.hash) {
        const hash = window.location.hash.startsWith("#")
          ? window.location.hash.slice(1)
          : window.location.hash;
        const params = new URLSearchParams(hash);
        const access_token = params.get("access_token");
        const refresh_token = params.get("refresh_token");

        if (access_token && refresh_token) {
          const { error: setErr } = await supabase.auth.setSession({
            access_token,
            refresh_token,
          });
          if (!setErr) {
            // Clear the fragment so it's not visible / not re-processed
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search
            );
          }
        }
      }

      if (cancelled) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (cancelled) return;

      if (user) {
        setState({ kind: "ready", email: user.email ?? "" });
      } else {
        setState({ kind: "no_session" });
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // If we determined there's no session, send to login (give the effect a tick)
  useEffect(() => {
    if (state.kind === "no_session") {
      router.replace("/login?error=session_expired");
    }
  }, [state.kind, router]);

  function validate(): string | null {
    if (password.length < 12) return "Password must be at least 12 characters.";
    if (!/[a-z]/.test(password) || !/[A-Z]/.test(password))
      return "Use at least one uppercase and one lowercase letter.";
    if (!/[0-9]/.test(password)) return "Include at least one digit.";
    if (password !== confirm) return "Passwords do not match.";
    return null;
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validation = validate();
    if (validation) {
      setError(validation);
      return;
    }

    startTransition(async () => {
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      router.push("/dashboard");
      router.refresh();
    });
  }

  if (state.kind === "loading" || state.kind === "no_session") {
    return (
      <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg)]">
        <div className="text-sm text-[var(--color-text-muted)]">Loading…</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-[var(--color-bg)]">
      <div className="w-full max-w-sm animate-fade-in">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)] mb-4">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold text-[var(--color-text)]">
            Set your password
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            Choose a password to finish setting up your account.
          </p>
        </div>

        <form
          onSubmit={handleSubmit}
          className="bg-[var(--color-surface)] rounded-lg border border-[var(--color-border)] p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] bg-[var(--color-surface-2)] rounded-md px-3 py-2">
            <Mail className="h-4 w-4" />
            <span>{state.email}</span>
          </div>

          <div>
            <Label htmlFor="password">New password</Label>
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isPending}
            />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              At least 12 characters, with uppercase, lowercase, and a digit.
            </p>
          </div>
          <div>
            <Label htmlFor="confirm">Confirm password</Label>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              required
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
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
            {isPending ? "Saving…" : "Save password"}
          </Button>
        </form>
      </div>
    </div>
  );
}
