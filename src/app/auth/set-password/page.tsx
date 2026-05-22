import { SetPasswordPageClient } from "./set-password-form";

/**
 * Server component shell. The actual logic lives in the client component
 * because we may need to read the URL fragment (#access_token=…) which
 * the server can't see — that's how the legacy Supabase email template
 * delivers tokens.
 *
 * We don't enforce auth here: if there's no session and no fragment, the
 * client component will redirect to /login.
 */
export default function SetPasswordPage() {
  return <SetPasswordPageClient />;
}
