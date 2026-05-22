import { redirect } from "next/navigation";

// The proxy.ts handles the auth check for us. If we get here, the user is
// authenticated, so send them to the dashboard.
export default function RootPage() {
  redirect("/dashboard");
}
