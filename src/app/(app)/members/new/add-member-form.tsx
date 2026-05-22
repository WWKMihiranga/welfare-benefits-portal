"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2, Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/toast";
import { inviteMember } from "@/lib/actions/members";

// Local form-state shape — mirrors the schema but kept loose (strings) for inputs
interface ChildEntry {
  key: string; // for React list keys
  full_name: string;
  date_of_birth: string;
  nic: string;
}

function newChildEntry(): ChildEntry {
  return {
    key: crypto.randomUUID(),
    full_name: "",
    date_of_birth: "",
    nic: "",
  };
}

export function AddMemberForm() {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [memberFullName, setMemberFullName] = useState("");
  const [memberEmail, setMemberEmail] = useState("");
  const [memberNic, setMemberNic] = useState("");
  const [memberDob, setMemberDob] = useState("");

  const [hasSpouse, setHasSpouse] = useState(false);
  const [spouseFullName, setSpouseFullName] = useState("");
  const [spouseNic, setSpouseNic] = useState("");
  const [spouseDob, setSpouseDob] = useState("");

  const [children, setChildren] = useState<ChildEntry[]>([]);

  const [topError, setTopError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string[]>>({});

  function fieldError(name: string): string | undefined {
    return fieldErrors[name]?.[0];
  }

  function addChild() {
    setChildren((cs) => [...cs, newChildEntry()]);
  }

  function removeChild(key: string) {
    setChildren((cs) => cs.filter((c) => c.key !== key));
  }

  function updateChild(key: string, patch: Partial<ChildEntry>) {
    setChildren((cs) => cs.map((c) => (c.key === key ? { ...c, ...patch } : c)));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setTopError(null);
    setFieldErrors({});

    const payload = {
      member_full_name: memberFullName,
      member_email: memberEmail,
      member_nic: memberNic,
      member_date_of_birth: memberDob,
      has_spouse: hasSpouse,
      spouse_full_name: hasSpouse ? spouseFullName : "",
      spouse_nic: hasSpouse ? spouseNic : "",
      spouse_date_of_birth: hasSpouse ? spouseDob : "",
      children: children.map((c) => ({
        full_name: c.full_name,
        date_of_birth: c.date_of_birth,
        nic: c.nic,
      })),
    };

    startTransition(async () => {
      const result = await inviteMember(payload);
      if (result.ok) {
        toast.show(
          `Invitation sent to ${memberEmail}. They'll receive an email to set their password.`,
          "success"
        );
        // Navigate immediately — the toast persists across the navigation
        router.push("/members");
      } else {
        setTopError(result.error);
        if (result.fieldErrors) setFieldErrors(result.fieldErrors);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ---- Committee member ---- */}
      <Card>
        <CardHeader>
          <CardTitle>Committee member</CardTitle>
          <CardDescription>
            The primary member. They will receive the email invitation.
          </CardDescription>
        </CardHeader>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="member_full_name">Full name</Label>
            <Input
              id="member_full_name"
              value={memberFullName}
              onChange={(e) => setMemberFullName(e.target.value)}
              disabled={isPending}
              required
              autoComplete="off"
            />
            <FieldError msg={fieldError("member_full_name")} />
          </div>
          <div>
            <Label htmlFor="member_email">Email</Label>
            <Input
              id="member_email"
              type="email"
              value={memberEmail}
              onChange={(e) => setMemberEmail(e.target.value)}
              disabled={isPending}
              required
              autoComplete="off"
            />
            <FieldError msg={fieldError("member_email")} />
          </div>
          <div>
            <Label htmlFor="member_nic">NIC (optional)</Label>
            <Input
              id="member_nic"
              value={memberNic}
              onChange={(e) => setMemberNic(e.target.value)}
              disabled={isPending}
              placeholder="200012345678 or 901234567V"
            />
            <FieldError msg={fieldError("member_nic")} />
          </div>
          <div>
            <Label htmlFor="member_dob">Date of birth (optional)</Label>
            <Input
              id="member_dob"
              type="date"
              value={memberDob}
              onChange={(e) => setMemberDob(e.target.value)}
              disabled={isPending}
            />
            <FieldError msg={fieldError("member_date_of_birth")} />
          </div>
        </div>
      </Card>

      {/* ---- Spouse ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Spouse</CardTitle>
              <CardDescription>
                Add the member&apos;s life partner, if applicable.
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-sm text-[var(--color-text-muted)]">
              <input
                type="checkbox"
                checked={hasSpouse}
                onChange={(e) => setHasSpouse(e.target.checked)}
                disabled={isPending}
                className="h-4 w-4 accent-[var(--color-accent)]"
              />
              Member has a spouse
            </label>
          </div>
        </CardHeader>

        {hasSpouse && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <Label htmlFor="spouse_full_name">Full name</Label>
              <Input
                id="spouse_full_name"
                value={spouseFullName}
                onChange={(e) => setSpouseFullName(e.target.value)}
                disabled={isPending}
                required={hasSpouse}
              />
              <FieldError msg={fieldError("spouse_full_name")} />
            </div>
            <div>
              <Label htmlFor="spouse_nic">NIC (optional)</Label>
              <Input
                id="spouse_nic"
                value={spouseNic}
                onChange={(e) => setSpouseNic(e.target.value)}
                disabled={isPending}
              />
              <FieldError msg={fieldError("spouse_nic")} />
            </div>
            <div>
              <Label htmlFor="spouse_dob">Date of birth (optional)</Label>
              <Input
                id="spouse_dob"
                type="date"
                value={spouseDob}
                onChange={(e) => setSpouseDob(e.target.value)}
                disabled={isPending}
              />
              <FieldError msg={fieldError("spouse_date_of_birth")} />
            </div>
          </div>
        )}
      </Card>

      {/* ---- Children ---- */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Children</CardTitle>
              <CardDescription>
                Add as many as needed.
              </CardDescription>
            </div>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={addChild}
              disabled={isPending || children.length >= 20}
            >
              <Plus className="h-4 w-4" />
              Add child
            </Button>
          </div>
        </CardHeader>

        {children.length === 0 ? (
          <div className="text-sm text-[var(--color-text-subtle)] py-4 text-center">
            No children added.
          </div>
        ) : (
          <div className="space-y-4">
            {children.map((child, idx) => (
              <div
                key={child.key}
                className="border border-[var(--color-border)] rounded-md p-4"
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm font-medium">Child {idx + 1}</div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => removeChild(child.key)}
                    disabled={isPending}
                    aria-label={`Remove child ${idx + 1}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div>
                    <Label htmlFor={`child_name_${child.key}`}>Full name</Label>
                    <Input
                      id={`child_name_${child.key}`}
                      value={child.full_name}
                      onChange={(e) =>
                        updateChild(child.key, { full_name: e.target.value })
                      }
                      disabled={isPending}
                      required
                    />
                    <FieldError msg={fieldError(`children.${idx}.full_name`)} />
                  </div>
                  <div>
                    <Label htmlFor={`child_dob_${child.key}`}>Date of birth</Label>
                    <Input
                      id={`child_dob_${child.key}`}
                      type="date"
                      value={child.date_of_birth}
                      onChange={(e) =>
                        updateChild(child.key, { date_of_birth: e.target.value })
                      }
                      disabled={isPending}
                    />
                    <FieldError msg={fieldError(`children.${idx}.date_of_birth`)} />
                  </div>
                  <div>
                    <Label htmlFor={`child_nic_${child.key}`}>NIC (optional)</Label>
                    <Input
                      id={`child_nic_${child.key}`}
                      value={child.nic}
                      onChange={(e) =>
                        updateChild(child.key, { nic: e.target.value })
                      }
                      disabled={isPending}
                    />
                    <FieldError msg={fieldError(`children.${idx}.nic`)} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* ---- Feedback + submit ---- */}
      {topError && (
        <div
          role="alert"
          className="text-sm text-[var(--color-danger)] bg-[var(--color-danger-soft)] rounded-md px-4 py-3"
        >
          {topError}
        </div>
      )}

      <div className="flex items-center justify-end gap-3">
        <Button
          type="button"
          variant="secondary"
          onClick={() => router.push("/members")}
          disabled={isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={isPending}>
          <Send className="h-4 w-4" />
          {isPending ? "Sending invitation…" : "Send invitation"}
        </Button>
      </div>
    </form>
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
