"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

export function Topbar({
  email,
  fullName,
  role,
}: {
  email: string;
  fullName: string;
  role: "admin" | "member";
}) {
  const router = useRouter();
  const supabase = createClient();

  async function handleSignOut() {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <header className="h-16 border-b border-[var(--color-border)] bg-[var(--color-surface)] flex items-center justify-end px-6 gap-4">
      <div className="text-right">
        <div className="text-sm font-medium text-[var(--color-text)]">
          {fullName}
        </div>
        <div className="text-xs text-[var(--color-text-muted)]">
          {email} · <span className="capitalize">{role}</span>
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={handleSignOut}>
        <LogOut className="h-4 w-4" />
        Sign out
      </Button>
    </header>
  );
}
