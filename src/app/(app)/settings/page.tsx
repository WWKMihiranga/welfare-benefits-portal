import { requireUser } from "@/lib/supabase/auth";
import { ChangePasswordForm } from "./change-password-form";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Mail, User, Shield } from "lucide-react";

export default async function SettingsPage() {
  const { user, profile } = await requireUser();

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          Your account details and security.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
          <CardDescription>
            Contact your administrator to change these details.
          </CardDescription>
        </CardHeader>
        <dl className="space-y-3 text-sm">
          <div className="flex items-center gap-3">
            <User className="h-4 w-4 text-[var(--color-text-subtle)]" />
            <dt className="text-[var(--color-text-muted)] w-24">Name</dt>
            <dd className="font-medium">{profile.full_name}</dd>
          </div>
          <div className="flex items-center gap-3">
            <Mail className="h-4 w-4 text-[var(--color-text-subtle)]" />
            <dt className="text-[var(--color-text-muted)] w-24">Email</dt>
            <dd className="font-medium">{user.email}</dd>
          </div>
          <div className="flex items-center gap-3">
            <Shield className="h-4 w-4 text-[var(--color-text-subtle)]" />
            <dt className="text-[var(--color-text-muted)] w-24">Role</dt>
            <dd className="font-medium capitalize">{profile.role}</dd>
          </div>
        </dl>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Change password</CardTitle>
          <CardDescription>
            Choose a new password for your account. You&apos;ll stay signed in
            after the change.
          </CardDescription>
        </CardHeader>
        <ChangePasswordForm />
      </Card>
    </div>
  );
}
