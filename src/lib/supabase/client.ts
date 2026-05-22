import "client-only";
import { createBrowserClient } from "@supabase/ssr";

/**
 * Supabase client for use in Client Components (runs in the browser).
 * Uses the PUBLISHABLE key, which is safe to expose to the browser.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!
  );
}
