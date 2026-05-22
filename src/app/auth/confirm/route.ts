import { type EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Handles the link clicked in confirmation/invite/recovery emails.
 *
 * Supabase email templates MUST point here using the token-hash format:
 *   {SITE_URL}/auth/confirm?token_hash={{ .TokenHash }}&type={...}
 *
 * If a template still uses the default {{ .ConfirmationURL }}, the link
 * goes to Supabase's /auth/v1/verify first, which consumes the token and
 * then redirects to our redirect_to URL. By the time we'd try to verify
 * it again, the token is spent. The user sees: link → login → "fail".
 *
 * If you see /login?error=verify_failed after clicking an email link, the
 * fix is to update the email template in the Supabase dashboard. See
 * docs/EMAIL_TEMPLATES.md.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const requestedNext = searchParams.get("next");

  // Case A — the legacy template fired and Supabase already verified the
  // token, so we land here with NO token_hash. If the user has a fresh
  // session from that flow, treat it as a successful recovery/invite.
  if (!token_hash || !type) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user) {
      // We can't tell type without the param. Recovery is by far the more
      // common case for landing here without params, so route to
      // set-password.
      return NextResponse.redirect(
        new URL("/auth/set-password", request.url)
      );
    }
    return NextResponse.redirect(
      new URL("/login?error=invalid_link", request.url)
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash });

  if (error) {
    // Log details server-side so an admin tailing logs can see why.
    console.error("[auth/confirm] verifyOtp failed", {
      type,
      message: error.message,
    });
    // Include the type in the error so the login page can show a useful hint.
    return NextResponse.redirect(
      new URL(
        `/login?error=verify_failed&link_type=${encodeURIComponent(type)}`,
        request.url
      )
    );
  }

  // For invites and password recovery, force the user through set-password.
  if (type === "invite" || type === "recovery") {
    return NextResponse.redirect(new URL("/auth/set-password", request.url));
  }

  return NextResponse.redirect(
    new URL(requestedNext ?? "/dashboard", request.url)
  );
}
