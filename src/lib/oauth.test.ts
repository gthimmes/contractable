import { describe, it, expect } from "vitest";
import {
  googleConfigFromEnv,
  buildAuthUrl,
  decodeIdToken,
  validateClaims,
  type IdTokenClaims,
} from "./oauth";

const CONFIG = {
  clientId: "abc.apps.googleusercontent.com",
  clientSecret: "shh",
  redirectUri: "http://localhost:3000/auth/google/callback",
};

function fakeIdToken(claims: IdTokenClaims): string {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o), "utf8").toString("base64url");
  return `${b64({ alg: "RS256" })}.${b64(claims)}.signature`;
}

const GOOD: IdTokenClaims = {
  iss: "https://accounts.google.com",
  aud: CONFIG.clientId,
  exp: Math.floor(new Date("2026-07-17T12:00:00Z").getTime() / 1000) + 3600,
  email: "Alice@Acme.example",
  email_verified: true,
};
const NOW = new Date("2026-07-17T12:00:00Z").getTime();

describe("googleConfigFromEnv", () => {
  it("is null unless both client id and secret are set", () => {
    expect(googleConfigFromEnv({} as NodeJS.ProcessEnv)).toBeNull();
    expect(
      googleConfigFromEnv({ GOOGLE_CLIENT_ID: "x" } as NodeJS.ProcessEnv)
    ).toBeNull();
  });

  it("derives the redirect URI from the app base URL", () => {
    const c = googleConfigFromEnv({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "s",
      APP_BASE_URL: "https://contracts.example.com/",
    } as NodeJS.ProcessEnv);
    expect(c?.redirectUri).toBe("https://contracts.example.com/auth/google/callback");
  });
});

describe("buildAuthUrl", () => {
  it("includes the required OAuth parameters and the state", () => {
    const url = new URL(buildAuthUrl(CONFIG, "state123"));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(url.searchParams.get("client_id")).toBe(CONFIG.clientId);
    expect(url.searchParams.get("redirect_uri")).toBe(CONFIG.redirectUri);
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toContain("email");
    expect(url.searchParams.get("state")).toBe("state123");
    // The secret must never appear in a browser-visible URL.
    expect(url.toString()).not.toContain(CONFIG.clientSecret);
  });
});

describe("decodeIdToken + validateClaims", () => {
  it("accepts a valid token and lowercases the email", () => {
    const claims = decodeIdToken(fakeIdToken(GOOD));
    expect(validateClaims(claims, CONFIG.clientId, NOW)).toBe("alice@acme.example");
  });

  it("rejects a wrong issuer", () => {
    const claims = { ...GOOD, iss: "https://evil.example" };
    expect(() => validateClaims(claims, CONFIG.clientId, NOW)).toThrow(/issuer/);
  });

  it("rejects an audience mismatch (token minted for another app)", () => {
    const claims = { ...GOOD, aud: "other-client" };
    expect(() => validateClaims(claims, CONFIG.clientId, NOW)).toThrow(/audience/);
  });

  it("rejects an expired token", () => {
    const claims = { ...GOOD, exp: Math.floor(NOW / 1000) - 10 };
    expect(() => validateClaims(claims, CONFIG.clientId, NOW)).toThrow(/expired/);
  });

  it("rejects an unverified email", () => {
    const claims = { ...GOOD, email_verified: false };
    expect(() => validateClaims(claims, CONFIG.clientId, NOW)).toThrow(/unverified/);
  });

  it("rejects malformed tokens", () => {
    expect(() => decodeIdToken("not-a-jwt")).toThrow(/Malformed/);
  });
});
