import { describe, expect, it } from "vitest";
import { InMemoryRateLimiter } from "$lib/server/rate-limit";

describe("InMemoryRateLimiter", () => {
  it("allows hits up to the limit, then blocks within the window", () => {
    const limiter = new InMemoryRateLimiter({ limit: 3, windowMs: 1000 });
    expect(limiter.check("k", 0).ok).toBe(true);
    expect(limiter.check("k", 0).ok).toBe(true);
    expect(limiter.check("k", 0).ok).toBe(true);

    const blocked = limiter.check("k", 0);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(1);
  });

  it("resets after the window elapses", () => {
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("k", 0).ok).toBe(true);
    expect(limiter.check("k", 500).ok).toBe(false);
    expect(limiter.check("k", 1000).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("a", 0).ok).toBe(true);
    expect(limiter.check("b", 0).ok).toBe(true);
    expect(limiter.check("a", 0).ok).toBe(false);
  });

  it("does not extend the window on blocked hits (fixed window)", () => {
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 1000 });
    expect(limiter.check("k", 0).ok).toBe(true);
    // A blocked hit at 900ms must not push the reset past the original 1000ms.
    expect(limiter.check("k", 900).ok).toBe(false);
    expect(limiter.check("k", 1000).ok).toBe(true);
  });

  it("reports retry-after rounded up to whole seconds (min 1)", () => {
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 2500 });
    expect(limiter.check("k", 0).ok).toBe(true);
    expect(limiter.check("k", 100).retryAfterSeconds).toBe(3);
    expect(limiter.check("k", 2499).retryAfterSeconds).toBe(1);
  });

  it("reclaims expired buckets when at the key cap", () => {
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 1000, maxKeys: 2 });
    expect(limiter.check("a", 0).ok).toBe(true);
    expect(limiter.check("b", 0).ok).toBe(true);
    // At 1500ms both are expired; inserting a new key reclaims them, and the
    // reclaimed keys start fresh windows rather than staying blocked.
    expect(limiter.check("c", 1500).ok).toBe(true);
    expect(limiter.check("a", 1500).ok).toBe(true);
  });

  it("hard-bounds the map at maxKeys by evicting live keys (FIFO) under a flood", () => {
    const limiter = new InMemoryRateLimiter({ limit: 1, windowMs: 10_000, maxKeys: 3 });
    // Fill the cap with live, blocked keys (nothing expired to reclaim).
    for (const key of ["a", "b", "c"]) {
      expect(limiter.check(key, 0).ok).toBe(true);
    }
    expect(limiter.check("a", 0).ok).toBe(false); // "a" is live + blocked
    // A 4th distinct key still succeeds — the oldest-inserted ("a") is evicted
    // to hold the cap, so it restarts fresh instead of remaining blocked.
    expect(limiter.check("d", 0).ok).toBe(true);
    expect(limiter.check("a", 0).ok).toBe(true);
  });
});
