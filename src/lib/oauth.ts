// SSO via the OAuth 2.0 / OpenID Connect authorization-code flow —
// dependency-free (two fetches and a base64url decode).
//
// Two providers share one flow:
//   - Google: fixed, well-known endpoints (GOOGLE_CLIENT_ID/SECRET).
//   - Generic OIDC (Okta, Azure AD/Entra, Auth0, Keycloak…): endpoints come
//     from the issuer's /.well-known/openid-configuration discovery document
//     (OIDC_ISSUER + OIDC_CLIENT_ID/SECRET, display name via OIDC_NAME).
//
// Sign-in maps the provider account's verified email to an EXISTING
// Contractable user — accounts are never auto-created, because roles here are
// assigned by an admin. A successful SSO sign-in creates the same server-side
// Session a password sign-in does.
//
// On the id_token: we receive it directly from the provider's token endpoint
// over TLS in a confidential-client exchange, so per OIDC Core §3.1.3.7
// signature verification is not required in this flow — but we still check
// iss, aud, and exp, and require a verified email.

export interface OidcProvider {
  /** Display name for the login button, e.g. "Google", "Okta". */
  name: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  authEndpoint: string;
  tokenEndpoint: string;
  /** Acceptable `iss` values for id_token validation. */
  issuers: string[];
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

function baseUrl(env: NodeJS.ProcessEnv): string {
  return (env.APP_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

// --- Google (fixed endpoints) ----------------------------------------------

export function googleConfigFromEnv(
  env: NodeJS.ProcessEnv = process.env
): OidcProvider | null {
  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) return null;
  return {
    name: "Google",
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri:
      env.GOOGLE_REDIRECT_URI ?? `${baseUrl(env)}/auth/google/callback`,
    authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
    tokenEndpoint: "https://oauth2.googleapis.com/token",
    issuers: ["https://accounts.google.com", "accounts.google.com"],
  };
}

// --- Generic OIDC via discovery --------------------------------------------

/** Is a generic OIDC provider configured? (No network — for UI checks.) */
export function oidcEnvConfigured(env: NodeJS.ProcessEnv = process.env): {
  name: string;
} | null {
  if (!env.OIDC_ISSUER || !env.OIDC_CLIENT_ID || !env.OIDC_CLIENT_SECRET) return null;
  return { name: env.OIDC_NAME || "SSO" };
}

export interface DiscoveryDoc {
  issuer?: string;
  authorization_endpoint?: string;
  token_endpoint?: string;
}

/**
 * Validate a discovery document against the configured issuer. Pure — the
 * fetch happens in discoverOidcProvider.
 */
export function parseDiscovery(
  doc: DiscoveryDoc,
  expectedIssuer: string
): { issuer: string; authEndpoint: string; tokenEndpoint: string } {
  const normalized = expectedIssuer.replace(/\/$/, "");
  if (!doc.issuer || doc.issuer.replace(/\/$/, "") !== normalized) {
    throw new Error(
      `OIDC discovery: issuer mismatch (expected ${normalized}, got ${doc.issuer})`
    );
  }
  if (!doc.authorization_endpoint || !doc.token_endpoint) {
    throw new Error("OIDC discovery: missing authorization or token endpoint");
  }
  return {
    issuer: doc.issuer,
    authEndpoint: doc.authorization_endpoint,
    tokenEndpoint: doc.token_endpoint,
  };
}

// Discovery cache: metadata changes rarely; refetch at most hourly.
let discoveryCache: { issuer: string; provider: OidcProvider; at: number } | null = null;
const DISCOVERY_TTL_MS = 60 * 60 * 1000;

/** Resolve the generic provider, fetching discovery metadata (cached 1h). */
export async function discoverOidcProvider(
  env: NodeJS.ProcessEnv = process.env
): Promise<OidcProvider | null> {
  const cfg = oidcEnvConfigured(env);
  if (!cfg) return null;
  const issuer = env.OIDC_ISSUER!.replace(/\/$/, "");

  if (
    discoveryCache &&
    discoveryCache.issuer === issuer &&
    Date.now() - discoveryCache.at < DISCOVERY_TTL_MS
  ) {
    return discoveryCache.provider;
  }

  const res = await fetch(`${issuer}/.well-known/openid-configuration`);
  if (!res.ok) throw new Error(`OIDC discovery failed: HTTP ${res.status}`);
  const parsed = parseDiscovery((await res.json()) as DiscoveryDoc, issuer);

  const provider: OidcProvider = {
    name: cfg.name,
    clientId: env.OIDC_CLIENT_ID!,
    clientSecret: env.OIDC_CLIENT_SECRET!,
    redirectUri: env.OIDC_REDIRECT_URI ?? `${baseUrl(env)}/auth/oidc/callback`,
    authEndpoint: parsed.authEndpoint,
    tokenEndpoint: parsed.tokenEndpoint,
    issuers: [parsed.issuer, parsed.issuer.replace(/\/$/, "")],
  };
  discoveryCache = { issuer, provider, at: Date.now() };
  return provider;
}

// --- Shared flow ------------------------------------------------------------

/** The provider consent-screen URL to redirect the browser to. */
export function buildAuthUrl(provider: OidcProvider, state: string): string {
  const params = new URLSearchParams({
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state,
    prompt: "select_account",
  });
  return `${provider.authEndpoint}?${params}`;
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
export function validateClaims(
  claims: IdTokenClaims,
  clientId: string,
  issuers: string[],
  now = Date.now()
): string {
  if (!claims.iss || !issuers.includes(claims.iss)) {
    throw new Error("id_token: unexpected issuer");
  }
  if (claims.aud !== clientId) throw new Error("id_token: audience mismatch");
  if (typeof claims.exp !== "number" || claims.exp * 1000 < now) {
    throw new Error("id_token: expired");
  }
  // Some enterprise IdPs (e.g. Azure AD) omit email_verified for directory
  // accounts; only explicit `false` is rejected.
  if (!claims.email || claims.email_verified === false) {
    throw new Error("id_token: email missing or unverified");
  }
  return claims.email.toLowerCase();
}

/** Exchange an authorization code for tokens and return the verified email. */
export async function exchangeCodeForEmail(
  provider: OidcProvider,
  code: string
): Promise<string> {
  const res = await fetch(provider.tokenEndpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      redirect_uri: provider.redirectUri,
      grant_type: "authorization_code",
    }),
  });
  if (!res.ok) {
    throw new Error(`Token exchange failed: ${res.status}`);
  }
  const data = (await res.json()) as { id_token?: string };
  if (!data.id_token) throw new Error("Token response missing id_token");
  return validateClaims(decodeIdToken(data.id_token), provider.clientId, provider.issuers);
}
