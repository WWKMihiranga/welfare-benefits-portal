"use client";

import { useState, useTransition } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";

export function ChangePasswordForm() {
  const toast = useToast();
  const [isPending, startTransition] = useTransition();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

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

    const v = validate();
    if (v) {
      setError(v);
      return;
    }

    startTransition(async () => {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      toast.show("Your password has been updated.", "success");
      setPassword("");
      setConfirm("");
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <Label htmlFor="new_password">New password</Label>
        <Input
          id="new_password"
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
        <Label htmlFor="new_confirm">Confirm new password</Label>
        <Input
          id="new_confirm"
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

      <Button type="submit" disabled={isPending}>
        {isPending ? "Saving…" : "Update password"}
      </Button>
    </form>
  );
}
