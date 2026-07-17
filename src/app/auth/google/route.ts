import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildAuthUrl, googleConfigFromEnv } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// GET /auth/google — kick off the Google sign-in flow. A random state value is
// stored in a short-lived httpOnly cookie and must round-trip through Google
// unchanged (CSRF protection for the callback).
export async function GET() {
  const config = googleConfigFromEnv();
  if (!config) redirect("/login?error=sso_unconfigured");

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("contractable_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  redirect(buildAuthUrl(config, state));
}
