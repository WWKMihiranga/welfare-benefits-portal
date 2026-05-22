import Link from "next/link";
import { redirect } from "next/navigation";
import {
  PieChart,
  Wallet,
  Eye,
  History,
  ArrowRight,
} from "lucide-react";
import { requireUser } from "@/lib/supabase/auth";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

const REPORTS = [
  {
    href: "/reports/usage",
    title: "Usage by category",
    description:
      "How much has been billed and reimbursed across each benefit category, with date-range filtering.",
    icon: PieChart,
  },
  {
    href: "/reports/balances",
    title: "Family balances",
    description:
      "Pool usage and remaining balance per family unit, plus annual testing-pool usage.",
    icon: Wallet,
  },
  {
    href: "/reports/eye-care",
    title: "Eye-care eligibility",
    description:
      "People eligible for eye care now, or who become eligible in the next 90 days.",
    icon: Eye,
  },
  {
    href: "/reports/audit",
    title: "Audit log",
    description:
      "Every sensitive action — claim decisions, member changes — with actor and timestamp.",
    icon: History,
  },
];

export default async function ReportsPage() {
  const { profile } = await requireUser();
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Reports</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-1">
          All reports can be exported as CSV.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {REPORTS.map((r) => {
          const Icon = r.icon;
          return (
            <Link key={r.href} href={r.href}>
              <Card className="hover:border-[var(--color-accent)] transition-colors h-full">
                <div className="flex items-start gap-4">
                  <div className="p-2 rounded-md bg-[var(--color-accent-soft)] text-[var(--color-accent-hover)]">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <CardTitle className="flex items-center gap-2">
                      {r.title}
                      <ArrowRight className="h-4 w-4 text-[var(--color-text-muted)]" />
                    </CardTitle>
                    <CardDescription className="mt-1">
                      {r.description}
                    </CardDescription>
                  </div>
                </div>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
