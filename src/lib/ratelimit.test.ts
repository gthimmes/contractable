import { describe, it, expect } from "vitest";
import { RateLimiter } from "./ratelimit";

const T0 = 1_000_000;

describe("RateLimiter", () => {
  it("allows up to max attempts inside the window", () => {
    const rl = new RateLimiter(3, 1000);
    expect(rl.attempt("k", T0).allowed).toBe(true);
    expect(rl.attempt("k", T0 + 10).allowed).toBe(true);
    expect(rl.attempt("k", T0 + 20).allowed).toBe(true);
    const denied = rl.attempt("k", T0 + 30);
    expect(denied.allowed).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
  });

  it("frees capacity as old attempts slide out of the window", () => {
    const rl = new RateLimiter(2, 1000);
    rl.attempt("k", T0);
    rl.attempt("k", T0 + 100);
    expect(rl.attempt("k", T0 + 200).allowed).toBe(false);
    // First attempt (T0) leaves the window at T0+1000.
    expect(rl.attempt("k", T0 + 1001).allowed).toBe(true);
  });

  it("tracks keys independently", () => {
    const rl = new RateLimiter(1, 1000);
    expect(rl.attempt("a", T0).allowed).toBe(true);
    expect(rl.attempt("b", T0).allowed).toBe(true);
    expect(rl.attempt("a", T0 + 1).allowed).toBe(false);
  });

  it("reset() clears a key immediately", () => {
    const rl = new RateLimiter(1, 60_000);
    rl.attempt("k", T0);
    expect(rl.attempt("k", T0 + 1).allowed).toBe(false);
    rl.reset("k");
    expect(rl.attempt("k", T0 + 2).allowed).toBe(true);
  });

  it("reports an accurate retryAfterMs", () => {
    const rl = new RateLimiter(1, 1000);
    rl.attempt("k", T0);
    expect(rl.attempt("k", T0 + 400).retryAfterMs).toBe(600);
  });
});
