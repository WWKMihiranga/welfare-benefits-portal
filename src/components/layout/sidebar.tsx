"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  UserPlus,
  Users,
  FilePlus2,
  FileText,
  BarChart3,
  Settings,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  // Restrict by role. Undefined = visible to all authenticated users.
  roles?: Array<"admin" | "member">;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/members/new", label: "Add Member", icon: UserPlus, roles: ["admin"] },
  { href: "/members", label: "Member Directory", icon: Users, roles: ["admin"] },
  { href: "/claims/new", label: "Submit Claim", icon: FilePlus2 },
  { href: "/claims", label: "Claims History", icon: FileText },
  { href: "/reports", label: "Reports", icon: BarChart3, roles: ["admin"] },
  { href: "/settings", label: "Settings", icon: Settings },
];

export function Sidebar({ role }: { role: "admin" | "member" }) {
  const pathname = usePathname();

  const items = NAV_ITEMS.filter(
    (item) => !item.roles || item.roles.includes(role)
  );

  return (
    <aside className="w-60 shrink-0 border-r border-[var(--color-border)] bg-[var(--color-surface)] h-screen sticky top-0">
      <div className="h-16 flex items-center px-6 border-b border-[var(--color-border)]">
        <span className="font-semibold text-[var(--color-text)]">
          Welfare Portal
        </span>
      </div>
      <nav className="p-3 space-y-0.5">
        {items.map((item) => {
          const Icon = item.icon;
          const active =
            pathname === item.href ||
            (item.href !== "/dashboard" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-all duration-200",
                active
                  ? "bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)] font-medium"
                  : "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)] hover:text-[var(--color-text)]"
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
