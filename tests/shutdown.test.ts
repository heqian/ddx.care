import { test, expect, describe } from "bun:test";
import { RateLimiter } from "../src/backend/utils/rate-limiter";

describe("RateLimiter — activeWorkflows tracking", () => {
  test("activeWorkflows is 0 initially", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    expect(limiter.activeWorkflows).toBe(0);
  });

  test("activeWorkflows increments on startWorkflow", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.startWorkflow();
    expect(limiter.activeWorkflows).toBe(1);
    limiter.startWorkflow();
    expect(limiter.activeWorkflows).toBe(2);
  });

  test("activeWorkflows decrements on finishWorkflow", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.startWorkflow();
    limiter.startWorkflow();
    limiter.finishWorkflow();
    expect(limiter.activeWorkflows).toBe(1);
    limiter.finishWorkflow();
    expect(limiter.activeWorkflows).toBe(0);
  });

  test("activeWorkflows does not go below zero", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.finishWorkflow();
    expect(limiter.activeWorkflows).toBe(0);
  });
});

describe("RateLimiter — canStartWorkflow", () => {
  test("allows workflows up to maxConcurrent", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 2,
    });
    expect(limiter.canStartWorkflow()).toBe(true);
    limiter.startWorkflow();
    expect(limiter.canStartWorkflow()).toBe(true);
    limiter.startWorkflow();
    expect(limiter.canStartWorkflow()).toBe(false);
  });

  test("allows new workflow after one finishes", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 1,
    });
    limiter.startWorkflow();
    expect(limiter.canStartWorkflow()).toBe(false);
    limiter.finishWorkflow();
    expect(limiter.canStartWorkflow()).toBe(true);
  });
});

describe("Shutdown wait-loop pattern", () => {
  test("resolves immediately when no active workflows", async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    const timeout = 5_000;
    const start = Date.now();

    // Simulate the shutdown wait loop from index.ts
    while (limiter.activeWorkflows > 0) {
      if (Date.now() - start > timeout) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(Date.now() - start).toBeLessThan(500);
    expect(limiter.activeWorkflows).toBe(0);
  });

  test("waits for workflow to finish before proceeding", async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.startWorkflow();

    const timeout = 5_000;
    const start = Date.now();

    // Simulate an async workflow finishing after 200ms
    setTimeout(() => limiter.finishWorkflow(), 200);

    while (limiter.activeWorkflows > 0) {
      if (Date.now() - start > timeout) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(limiter.activeWorkflows).toBe(0);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(timeout);
  });

  test("times out when workflows never finish", async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.startWorkflow();

    const timeout = 500; // Short timeout for test speed
    const start = Date.now();

    while (limiter.activeWorkflows > 0) {
      if (Date.now() - start > timeout) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    // Should have broken out due to timeout, workflow still active
    expect(limiter.activeWorkflows).toBe(1);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(timeout - 50);
  });

  test("clearInterval prevents timer from firing after shutdown", () => {
    let callCount = 0;
    const timer = setInterval(() => {
      callCount++;
    }, 10);

    // Clear immediately
    clearInterval(timer);

    // Wait a bit and verify it never fired
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(callCount).toBe(0);
        resolve();
      }, 100);
    });
  });

  test("multiple concurrent workflows tracked correctly", async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.startWorkflow();
    limiter.startWorkflow();
    limiter.startWorkflow();

    expect(limiter.activeWorkflows).toBe(3);

    // Finish one at a time
    setTimeout(() => limiter.finishWorkflow(), 100);
    setTimeout(() => limiter.finishWorkflow(), 200);
    setTimeout(() => limiter.finishWorkflow(), 300);

    const timeout = 5_000;
    const start = Date.now();

    while (limiter.activeWorkflows > 0) {
      if (Date.now() - start > timeout) break;
      await new Promise((r) => setTimeout(r, 50));
    }

    expect(limiter.activeWorkflows).toBe(0);
  });
});
