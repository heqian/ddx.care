import { test, expect, describe, beforeEach } from "bun:test";
import { RateLimiter } from "../src/backend/utils/rate-limiter";

describe("RateLimiter — IP Rate Limiting", () => {
  test("allows requests under the limit", () => {
    const limiter = new RateLimiter({ maxRequests: 3, windowMs: 60_000, maxConcurrent: 5 });

    // First check should be allowed (no previous requests recorded)
    expect(limiter.check("1.2.3.4")).toEqual({ allowed: true });

    // Record 2 requests
    limiter.record("1.2.3.4");
    limiter.record("1.2.3.4");

    // Still under limit (2 < 3)
    expect(limiter.check("1.2.3.4")).toEqual({ allowed: true });
  });

  test("blocks requests at the limit", () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000, maxConcurrent: 5 });

    // Record 2 requests
    limiter.check("1.2.3.4");
    limiter.record("1.2.3.4");
    limiter.check("1.2.3.4");
    limiter.record("1.2.3.4");

    // Third check should be blocked
    const result = limiter.check("1.2.3.4");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(60_000);
    }
  });

  test("retryAfterMs is reasonable", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 10_000, maxConcurrent: 5 });

    limiter.check("ip1");
    limiter.record("ip1");

    const result = limiter.check("ip1");
    expect(result.allowed).toBe(false);
    if (!result.allowed) {
      // retryAfter should be roughly the window time
      expect(result.retryAfterMs).toBeGreaterThan(0);
      expect(result.retryAfterMs).toBeLessThanOrEqual(10_000);
    }
  });

  test("different IPs are tracked independently", () => {
    const limiter = new RateLimiter({ maxRequests: 1, windowMs: 60_000, maxConcurrent: 5 });

    limiter.check("ip-a");
    limiter.record("ip-a");

    // ip-a is now at limit
    expect(limiter.check("ip-a").allowed).toBe(false);

    // ip-b is unaffected
    expect(limiter.check("ip-b")).toEqual({ allowed: true });
  });

  test("unknown IP gets allowed on first check", () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 60_000, maxConcurrent: 5 });
    expect(limiter.check("never-seen")).toEqual({ allowed: true });
  });
});

describe("RateLimiter — Concurrent Workflow Limiting", () => {
  test("canStartWorkflow returns true under limit", () => {
    const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000, maxConcurrent: 3 });
    expect(limiter.canStartWorkflow()).toBe(true);
  });

  test("canStartWorkflow returns false at capacity", () => {
    const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000, maxConcurrent: 2 });

    limiter.startWorkflow();
    limiter.startWorkflow();

    expect(limiter.canStartWorkflow()).toBe(false);
  });

  test("finishWorkflow frees capacity", () => {
    const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000, maxConcurrent: 1 });

    limiter.startWorkflow();
    expect(limiter.canStartWorkflow()).toBe(false);

    limiter.finishWorkflow();
    expect(limiter.canStartWorkflow()).toBe(true);
  });

  test("finishWorkflow does not go below zero", () => {
    const limiter = new RateLimiter({ maxRequests: 100, windowMs: 60_000, maxConcurrent: 5 });

    // Call finish without start — should not go negative
    limiter.finishWorkflow();
    limiter.finishWorkflow();

    // Should still allow starting
    expect(limiter.canStartWorkflow()).toBe(true);

    // Start and check we have correct count
    limiter.startWorkflow();
    expect(limiter.canStartWorkflow()).toBe(true);
  });
});

describe("RateLimiter — Prune", () => {
  test("prune removes expired client entries", async () => {
    const limiter = new RateLimiter({ maxRequests: 5, windowMs: 100, maxConcurrent: 5 });

    limiter.check("stale-ip");
    limiter.record("stale-ip");

    // Wait for the window to expire
    await new Promise((r) => setTimeout(r, 150));

    limiter.prune();

    // After pruning, the IP should be treated as new
    const result = limiter.check("stale-ip");
    expect(result).toEqual({ allowed: true });
  });

  test("prune keeps IPs with recent requests", () => {
    const limiter = new RateLimiter({ maxRequests: 2, windowMs: 60_000, maxConcurrent: 5 });

    limiter.check("active-ip");
    limiter.record("active-ip");
    limiter.record("active-ip");

    limiter.prune();

    // Should still be at limit
    const result = limiter.check("active-ip");
    expect(result.allowed).toBe(false);
  });
});
