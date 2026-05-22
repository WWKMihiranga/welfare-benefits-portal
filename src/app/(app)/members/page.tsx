import Link from "next/link";
import { redirect } from "next/navigation";
import { Plus, Search } from "lucide-react";
import { requireUser } from "@/lib/supabase/auth";
import { createClient } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { formatDate } from "@/lib/utils/format";

const PAGE_SIZE = 25;

interface PageProps {
  searchParams: Promise<{ q?: string; page?: string }>;
}

export default async function MembersPage({ searchParams }: PageProps) {
  const { profile } = await requireUser();
  if (profile.role !== "admin") {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const query = (params.q ?? "").trim();
  const page = Math.max(1, parseInt(params.page ?? "1", 10) || 1);

  const supabase = await createClient();

  // Build the query against the summary view (RLS already enforces admin-only via inheritance)
  let select = supabase
    .from("v_family_units_summary")
    .select("*", { count: "exact" })
    .is("archived_at", null)
    .order("enrolled_at", { ascending: false });

  if (query) {
    // Postgres ilike for case-insensitive contains
    select = select.ilike("member_name", `%${query}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;
  const { data: rows, count, error } = await select.range(from, to);

  const totalCount = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Member Directory</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-1">
            {totalCount} enrolled member{totalCount === 1 ? "" : "s"}.
          </p>
        </div>
        <Button asChild>
          <Link href="/members/new">
            <Plus className="h-4 w-4" />
            Add Member
          </Link>
        </Button>
      </div>

      <Card className="p-0 overflow-hidden">
        {/* Search */}
        <form
          method="get"
          className="p-4 border-b border-[var(--color-border)] flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-subtle)]" />
            <Input
              name="q"
              placeholder="Search by member name"
              defaultValue={query}
              className="pl-9"
            />
          </div>
          <Button type="submit" variant="secondary">
            Search
          </Button>
          {query && (
            <Button asChild variant="ghost">
              <Link href="/members">Clear</Link>
            </Button>
          )}
        </form>

        {error ? (
          <div className="p-8 text-sm text-[var(--color-danger)]">
            Could not load members: {error.message}
          </div>
        ) : !rows || rows.length === 0 ? (
          <div className="p-12 text-center text-sm text-[var(--color-text-muted)]">
            {query
              ? `No members match "${query}".`
              : "No members enrolled yet. Add the first member to get started."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] text-left text-[var(--color-text-muted)]">
                  <th className="p-4 font-medium">Member</th>
                  <th className="p-4 font-medium">Family size</th>
                  <th className="p-4 font-medium">Enrolled</th>
                  <th className="p-4 font-medium w-px"></th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr
                    key={row.family_unit_id}
                    className="border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-surface-2)]"
                  >
                    <td className="p-4 font-medium">{row.member_name}</td>
                    <td className="p-4 text-[var(--color-text-muted)]">
                      {row.person_count}
                    </td>
                    <td className="p-4 text-[var(--color-text-muted)]">
                      {formatDate(row.enrolled_at)}
                    </td>
                    <td className="p-4">
                      <Link
                        href={`/members/${row.family_unit_id}`}
                        className="text-[var(--color-accent)] hover:underline"
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[var(--color-border)] flex items-center justify-between text-sm">
            <div className="text-[var(--color-text-muted)]">
              Page {page} of {totalPages}
            </div>
            <div className="flex gap-2">
              {page > 1 && (
                <Button asChild variant="secondary" size="sm">
                  <Link
                    href={`/members?${new URLSearchParams({
                      ...(query ? { q: query } : {}),
                      page: String(page - 1),
                    })}`}
                  >
                    Previous
                  </Link>
                </Button>
              )}
              {page < totalPages && (
                <Button asChild variant="secondary" size="sm">
                  <Link
                    href={`/members?${new URLSearchParams({
                      ...(query ? { q: query } : {}),
                      page: String(page + 1),
                    })}`}
                  >
                    Next
                  </Link>
                </Button>
              )}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
