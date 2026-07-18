// Sliding-window rate limiter for authentication endpoints.
//
// In-memory and per-process, which is the right tradeoff for this MVP's
// single-node deployment: it protects against online password guessing and
// reset-email flooding with zero infrastructure. In a multi-node deployment,
// back this interface with Redis or a DB table instead.

interface Bucket {
  /** Timestamps (ms) of attempts inside the current window. */
  attempts: number[];
}

export interface RateLimitResult {
  allowed: boolean;
  /** When not allowed: how long until the oldest attempt leaves the window. */
  retryAfterMs: number;
}

export class RateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly max: number,
    private readonly windowMs: number
  ) {}

  /** Record an attempt for `key` and report whether it is allowed. */
  attempt(key: string, now = Date.now()): RateLimitResult {
    const cutoff = now - this.windowMs;
    let bucket = this.buckets.get(key);
    if (!bucket) {
      bucket = { attempts: [] };
      this.buckets.set(key, bucket);
    }
    bucket.attempts = bucket.attempts.filter((t) => t > cutoff);

    if (bucket.attempts.length >= this.max) {
      return { allowed: false, retryAfterMs: bucket.attempts[0] + this.windowMs - now };
    }
    bucket.attempts.push(now);

    // Opportunistic global prune so abandoned keys don't accumulate forever.
    if (this.buckets.size > 10_000) {
      for (const [k, b] of this.buckets) {
        if (b.attempts.every((t) => t <= cutoff)) this.buckets.delete(k);
      }
    }
    return { allowed: true, retryAfterMs: 0 };
  }

  /** Clear a key (e.g. after a successful login). */
  reset(key: string): void {
    this.buckets.delete(key);
  }
}

// Login: 10 attempts per 15 minutes per email. Generous enough for typos,
// tight enough to make online guessing useless against scrypt hashes.
export const loginLimiter = new RateLimiter(10, 15 * 60 * 1000);

// Reset requests: 3 per hour per email — each one sends a message.
export const resetRequestLimiter = new RateLimiter(3, 60 * 60 * 1000);
