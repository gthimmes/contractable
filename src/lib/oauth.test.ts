import { describe, it, expect } from "vitest";
import {
  googleConfigFromEnv,
  oidcEnvConfigured,
  parseDiscovery,
  buildAuthUrl,
  decodeIdToken,
  validateClaims,
  type IdTokenClaims,
  type OidcProvider,
} from "./oauth";

const PROVIDER: OidcProvider = {
  name: "Test",
  clientId: "abc.apps.googleusercontent.com",
  clientSecret: "shh",
  redirectUri: "http://localhost:3000/auth/google/callback",
  authEndpoint: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenEndpoint: "https://oauth2.googleapis.com/token",
  issuers: ["https://accounts.google.com", "accounts.google.com"],
};

function fakeIdToken(claims: IdTokenClaims): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(claims)}.signature`;
}

const GOOD: IdTokenClaims = {
  iss: "https://accounts.google.com",
  aud: PROVIDER.clientId,
  exp: Math.floor(new Date("2026-07-18T12:00:00Z").getTime() / 1000) + 3600,
  email: "Alice@Acme.example",
  email_verified: true,
};
const NOW = new Date("2026-07-18T12:00:00Z").getTime();

describe("googleConfigFromEnv", () => {
  it("is null unless both client id and secret are set", () => {
    expect(googleConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(googleConfigFromEnv({ GOOGLE_CLIENT_ID: "x" } as NodeJS.ProcessEnv)).toBeNull();
  });

  it("derives the redirect URI and fixed Google endpoints", () => {
    const c = googleConfigFromEnv({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "s",
      APP_BASE_URL: "https://contracts.example.com/",
    } as NodeJS.ProcessEnv);
    expect(c?.redirectUri).toBe("https://contracts.example.com/auth/google/callback");
    expect(c?.authEndpoint).toContain("accounts.google.com");
  });
});

describe("oidcEnvConfigured", () => {
  it("requires issuer, client id, and secret", () => {
    expect(oidcEnvConfigured({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      oidcEnvConfigured({ OIDC_ISSUER: "https://x", OIDC_CLIENT_ID: "a" } as NodeJS.ProcessEnv)
    ).toBeNull();
  });

  it("uses OIDC_NAME for display, defaulting to SSO", () => {
    const base = {
      OIDC_ISSUER: "https://okta.example.com",
      OIDC_CLIENT_ID: "a",
      OIDC_CLIENT_SECRET: "b",
    };
    expect(oidcEnvConfigured(base as NodeJS.ProcessEnv)?.name).toBe("SSO");
    expect(
      oidcEnvConfigured({ ...base, OIDC_NAME: "Okta" } as NodeJS.ProcessEnv)?.name
    ).toBe("Okta");
  });
});

describe("parseDiscovery", () => {
  const DOC = {
    issuer: "https://okta.example.com",
    authorization_endpoint: "https://okta.example.com/oauth2/v1/authorize",
    token_endpoint: "https://okta.example.com/oauth2/v1/token",
  };

  it("accepts a matching document (trailing slashes ignored)", () => {
    const p = parseDiscovery(DOC, "https://okta.example.com/");
    expect(p.authEndpoint).toBe(DOC.authorization_endpoint);
    expect(p.tokenEndpoint).toBe(DOC.token_endpoint);
  });

  it("rejects an issuer mismatch (defends against a hostile discovery doc)", () => {
    expect(() => parseDiscovery(DOC, "https://evil.example.com")).toThrow(/issuer mismatch/);
  });

  it("rejects documents missing endpoints", () => {
    expect(() =>
      parseDiscovery({ issuer: "https://okta.example.com" }, "https://okta.example.com")
    ).toThrow(/missing/);
  });
});

describe("buildAuthUrl", () => {
  it("includes the required OAuth parameters and the state", () => {
    const url = new URL(buildAuthUrl(PROVIDER, "state123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(PROVIDER.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(PROVIDER.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.get("state")).toBe("state123");
    // The secret must never appear in a browser-visible URL.
    expect(url.toString()).not.toContain(PROVIDER.clientSecret);
  });
});

describe("decodeIdToken + validateClaims", () => {
  it("accepts a valid token and lowercases the email", () => {
    const claims = decodeIdToken(fakeIdToken(GOOD));
    expect(validateClaims(claims, PROVIDER.clientId, PROVIDER.issuers, NOW)).toBe(
      "alice@acme.example"
    );
  });

  it("accepts a token without email_verified (enterprise IdPs omit it)", () => {
    const { email_verified: _omitted, ...rest } = GOOD;
    expect(validateClaims(rest, PROVIDER.clientId, PROVIDER.issuers, NOW)).toBe(
      "alice@acme.example"
    );
  });

  it("rejects a wrong issuer", () => {
    const claims = { ...GOOD, iss: "https://evil.example" };
    expect(() => validateClaims(claims, PROVIDER.clientId, PROVIDER.issuers, NOW)).toThrow(
      /issuer/
    );
  });

  it("rejects an audience mismatch (token minted for another app)", () => {
    const claims = { ...GOOD, aud: "other-client" };
    expect(() => validateClaims(claims, PROVIDER.clientId, PROVIDER.issuers, NOW)).toThrow(
      /audience/
    );
  });

  it("rejects an expired token", () => {
    const claims = { ...GOOD, exp: Math.floor(NOW / 1000) - 10 };
    expect(() => validateClaims(claims, PROVIDER.clientId, PROVIDER.issuers, NOW)).toThrow(
      /expired/
    );
  });

  it("rejects an explicitly unverified email", () => {
    const claims = { ...GOOD, email_verified: false };
    expect(() => validateClaims(claims, PROVIDER.clientId, PROVIDER.issuers, NOW)).toThrow(
      /unverified/
    );
  });

  it("rejects malformed tokens", () => {
    expect(() => decodeIdToken("not-a-jwt")).toThrow(/Malformed/);
  });
});
