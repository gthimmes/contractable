import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { createSession } from "@/lib/auth";
import { exchangeCodeForEmail, discoverOidcProvider } from "@/lib/oauth";

export const dynamic = "force-dynamic";

// GET /auth/oidc/callback — complete generic-OIDC sign-in. The provider
// account's email must match an existing user; accounts are never
// auto-created (roles are assigned by an admin).
export async function GET(req: Request) {
  let provider;
  try {
    provider = await discoverOidcProvider();
  } catch {
    redirect("/login?error=sso");
  }
  if (!provider) redirect("/login?error=sso_unconfigured");

  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");

  const store = await cookies();
  const expectedState = store.get("contractable_oauth_state")?.value;
  store.delete("contractable_oauth_state");

  if (!code || !state || !expectedState || state !== expectedState) {
    redirect("/login?error=sso");
  }

  let email: string;
  try {
    email = await exchangeCodeForEmail(provider, code);
  } catch (err) {
    console.error("[sso] OIDC sign-in failed:", err instanceof Error ? err.message : err);
    redirect("/login?error=sso");
  }

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) redirect("/login?error=sso_no_account");

  await createSession(user.id);
  redirect("/");
}
