import { randomBytes } from "crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { buildAuthUrl, discoverOidcProvider } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// GET /auth/oidc — kick off sign-in with the generic OIDC provider (Okta,
// Azure AD, Auth0…). Endpoints come from issuer discovery; the state cookie
// CSRF-protects the callback.
export async function GET() {
  let provider;
  try {
    provider = await discoverOidcProvider();
  } catch (err) {
    console.error("[sso] OIDC discovery failed:", err instanceof Error ? err.message : err);
    redirect("/login?error=sso");
  }
  if (!provider) redirect("/login?error=sso_unconfigured");

  const state = randomBytes(16).toString("hex");
  const store = await cookies();
  store.set("contractable_oauth_state", state, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });
  redirect(buildAuthUrl(provider, state));
}
