// Google SSO via the OAuth 2.0 / OpenID Connect authorization-code flow —
// dependency-free (two fetches and a base64url decode).
//
// Activation is env-gated: set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET and
// the login page shows "Sign in with Google". Sign-in maps the Google
// account's verified email to an EXISTING Contractable user — accounts are
// never auto-created, because roles here are assigned by an admin. The
// session/authorization layers are unchanged: a successful SSO sign-in creates
// the same server-side Session a password sign-in does.
//
// On the id_token: we receive it directly from Google's token endpoint over
// TLS in a confidential-client exchange, so per OIDC Core §3.1.3.7 signature
// verification is not required in this flow — but we still check iss, aud, and
// exp, and require email_verified.

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface IdTokenClaims {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  [key: string]: unknown;
}

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

export function googleConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  appBaseUrl?: string
): GoogleOAuthConfig | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  const base = appBaseUrl ?? env.APP_BASE_URL ?? "http://localhost:3000";
  return {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: env.GOOGLE_REDIRECT_URI ?? `${base.replace(/\/$/, "")}/auth/google/callback`,
  };
}

/** The Google consent-screen URL to redirect the browser to. */
export function buildAuthUrl(config: GoogleOAuthConfig, state: string): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${AUTH_ENDPOINT}?${params}`;
}

/** Decode a JWT's payload (base64url) without verifying the signature. */
export function decodeIdToken(idToken: string): IdTokenClaims {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("Malformed id_token");
  const payload = Buffer.from(parts[1], "base64url").toString("utf8");
  return JSON.parse(payload) as IdTokenClaims;
}

/**
 * Validate the claims we rely on. Returns the verified email or throws.
 * `now` is injectable for tests.
 */
export function validateClaims(claims: IdTokenClaims, clientId: string, now = Date.now()): string {
  if (claims.iss !== "https://accounts.google.com" && claims.iss !== "accounts.google.com") {
    throw new Error("id_token: unexpected issuer");
  }
  if (claims.aud !== clientId) throw new Error("id_token: audience mismatch");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < now) {
    throw new Error("id_token: expired");
  }
  if (!claims.email || claims.email_verified !== true) {
    throw new Error("id_token: email missing or unverified");
  }
  return claims.email.toLowerCase();
}

/** Exchange an authorization code for tokens and return the verified email. */
export async function exchangeCodeForEmail(
  config: GoogleOAuthConfig,
  code: string
): Promise<string> {
  const res = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: config.clientId,
      client_secret: config.clientSecret,
      redirect_uri: config.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Google token response missing id_token");
  return validateClaims(decodeIdToken(data.id_token), config.clientId);
}
