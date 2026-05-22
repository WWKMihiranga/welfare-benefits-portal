import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";

/**
 * Supabase client for use in Server Components, Server Actions, and Route Handlers.
 * Reads/writes auth cookies through Next's cookie API.
 *
 * In Next.js 16, cookies() is async.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Called from a Server Component — cookies can only be set from
            // a Server Action or Route Handler. The proxy.ts will refresh
            // the session so this is safe to ignore here.
          }
        },
      },
    }
  );
}
