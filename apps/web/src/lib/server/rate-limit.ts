export interface RateLimitResult {
  /** Whether this hit is allowed. */
  ok: boolean;
  /** Seconds until the current window resets (0 when allowed). */
  retryAfterSeconds: number;
}

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Minimal per-instance, in-memory fixed-window rate limiter.
 *
 * It bounds abuse from a single process only: buckets are NOT shared across
 * replicas and reset on restart. Treat it as defense-in-depth on unauthenticated
 * endpoints — the real protection for multi-replica / production deployments is
 * edge/ingress rate limiting (CDN, load balancer, or ingress annotations), which
 * this does not replace.
 */
export class InMemoryRateLimiter {
  readonly #buckets = new Map<string, Bucket>();
  readonly #limit: number;
  readonly #windowMs: number;
  readonly #maxKeys: number;

  constructor(options: { limit: number; windowMs: number; maxKeys?: number }) {
    this.#limit = options.limit;
    this.#windowMs = options.windowMs;
    this.#maxKeys = options.maxKeys ?? 10_000;
  }

  /**
   * Record a hit for `key` and report whether it is within the limit. Blocked
   * hits do NOT extend the window (fixed window). Pass `now` (ms) to make time
   * deterministic in tests.
   */
  check(key: string, now: number = Date.now()): RateLimitResult {
    const bucket = this.#buckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      this.#sweep(now);
      this.#buckets.set(key, { count: 1, resetAt: now + this.#windowMs });
      return { ok: true, retryAfterSeconds: 0 };
    }
    if (bucket.count >= this.#limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)),
      };
    }
    bucket.count += 1;
    return { ok: true, retryAfterSeconds: 0 };
  }

  /** Drop expired buckets once the map grows large, to bound memory. */
  #sweep(now: number): void {
    if (this.#buckets.size < this.#maxKeys) {
      return;
    }
    for (const [key, bucket] of this.#buckets) {
      if (bucket.resetAt <= now) {
        this.#buckets.delete(key);
      }
    }
  }
}

/**
 * Shared limiter for the public, unauthenticated `POST /request-access` form:
 * 5 submissions per 10 minutes per key (checked for both the client IP and the
 * submitted email). Deliberately generous — it stops trivial floods without
 * blocking real prospects; hard abuse control belongs at the edge (see above).
 */
export const requestAccessRateLimiter = new InMemoryRateLimiter({
  limit: 5,
  windowMs: 10 * 60 * 1000,
});
