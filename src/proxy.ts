import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

/**
 * Next.js 16 renamed middleware.ts → proxy.ts. This runs on every request
 * (per the matcher below). Two responsibilities:
 *   1. Refresh the Supabase auth token if it's expired.
 *   2. Redirect unauthenticated users away from protected routes.
 *
 * SECURITY: we use `getClaims()` which verifies the JWT locally (or via Auth
 * server for symmetric keys). Do NOT trust `getSession()` for authorization —
 * its cookie can be spoofed.
 */

const PUBLIC_PATHS = [
  "/login",
  "/forgot-password",
  "/auth/callback",
  "/auth/confirm",
  "/auth/set-password",
];

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Verify the user — this validates the JWT, not just reads the cookie.
  const { data } = await supabase.auth.getClaims();
  const isAuthed = !!data?.claims;

  const path = request.nextUrl.pathname;
  const isPublic = PUBLIC_PATHS.some((p) => path.startsWith(p));

  // Not logged in + trying to access a protected page → redirect to login
  if (!isAuthed && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.searchParams.set("next", path);
    return NextResponse.redirect(url);
  }

  // Logged in + on the login page → send them to the dashboard
  if (isAuthed && path === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    url.search = "";
    return NextResponse.redirect(url);
  }

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico, robots.txt
     * - Files with an extension (e.g. .png, .jpg)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|.*\\..*).*)",
  ],
};
