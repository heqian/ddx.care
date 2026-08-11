import { test, expect, describe } from "bun:test";
import { createLifecycle } from "../src/backend/composition";
import { buildConfig } from "../src/backend/app-config";
import { JobStore } from "../src/backend/progress-store";
import { RateLimiter } from "../src/backend/utils/rate-limiter";

/**
 * Shutdown tests invoke the production lifecycle coordinator with injected
 * stores, fake clock/sleep/server/timers/exit dependencies — never
 * reproducing the wait loop locally.
 */
function makeLifecycle(opts: {
  activeWorkflows: () => number;
  sleep: (ms: number) => Promise<void>;
  intervals?: Array<ReturnType<typeof setInterval>>;
  shutdownTimeoutMs?: number;
}) {
  const cfg = buildConfig({
    MOCK_LLM: "1",
    PORT: "0",
    TOOL_CACHE_TTL_MS: "0",
    ORPHADATA_ENABLED: "0",
  });
  const jobStore = new JobStore(":memory:");
  const rateLimiter = new RateLimiter({
    maxRequests: 10,
    windowMs: 60_000,
    maxConcurrent: 3,
  });
  let serverStopped = false;
  let exitCode: number | null = null;
  const intervals = opts.intervals ?? [];
  const lifecycle = createLifecycle({
    config: cfg,
    jobStore,
    rateLimiter,
    server: {
      stop: () => {
        serverStopped = true;
      },
    },
    activeWorkflows: opts.activeWorkflows,
    sleep: opts.sleep,
    shutdownTimeoutMs: opts.shutdownTimeoutMs ?? 30_000,
    exit: (code) => {
      exitCode = code;
    },
    timers: {
      setInterval,
      setTimeout,
      clearInterval,
      clearTimeout,
      intervals,
    },
    orphadataEnabled: false,
    toolCacheEnabled: false,
    jobTtlMs: cfg.jobTtlMs,
    pendingJobTimeoutMs: cfg.pendingJobTimeoutMs,
  });
  return {
    lifecycle,
    isServerStopped: () => serverStopped,
    getExitCode: () => exitCode,
  };
}

describe("RateLimiter — activeWorkflows tracking (unchanged)", () => {
  test("activeWorkflows is 0 initially", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    expect(limiter.activeWorkflows).toBe(0);
  });

  test("activeWorkflows increments when jobs reserve capacity", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.tryStartWorkflow("job-1");
    expect(limiter.activeWorkflows).toBe(1);
    limiter.tryStartWorkflow("job-2");
    expect(limiter.activeWorkflows).toBe(2);
  });

  test("activeWorkflows decrements on finishWorkflow", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.tryStartWorkflow("job-1");
    limiter.tryStartWorkflow("job-2");
    limiter.finishWorkflow("job-1");
    expect(limiter.activeWorkflows).toBe(1);
    limiter.finishWorkflow("job-2");
    expect(limiter.activeWorkflows).toBe(0);
  });

  test("activeWorkflows does not go below zero", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.finishWorkflow("unknown-job");
    expect(limiter.activeWorkflows).toBe(0);
  });
});

describe("RateLimiter — tryStartWorkflow (unchanged)", () => {
  test("allows workflows up to maxConcurrent", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 2,
    });
    expect(limiter.tryStartWorkflow("job-1")).toBe(true);
    expect(limiter.tryStartWorkflow("job-2")).toBe(true);
    expect(limiter.tryStartWorkflow("job-3")).toBe(false);
  });

  test("allows new workflow after one finishes", () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 1,
    });
    expect(limiter.tryStartWorkflow("job-1")).toBe(true);
    expect(limiter.tryStartWorkflow("job-2")).toBe(false);
    limiter.finishWorkflow("job-1");
    expect(limiter.tryStartWorkflow("job-2")).toBe(true);
  });
});

describe("Production lifecycle shutdown — via createLifecycle", () => {
  test("resolves immediately when no active workflows", async () => {
    let sleepCalls = 0;
    const { lifecycle, isServerStopped, getExitCode } = makeLifecycle({
      activeWorkflows: () => 0,
      sleep: async () => {
        sleepCalls++;
      },
    });
    await lifecycle.shutdown("SIGTERM");
    expect(isServerStopped()).toBe(true);
    expect(getExitCode()).toBe(0);
    expect(sleepCalls).toBe(0);
  });

  test("waits for workflow to finish before proceeding", async () => {
    let active = 1;
    let sleepCalls = 0;
    const { lifecycle } = makeLifecycle({
      activeWorkflows: () => active,
      sleep: async () => {
        sleepCalls++;
        if (sleepCalls >= 2) active = 0;
      },
    });
    await lifecycle.shutdown("SIGTERM");
    expect(sleepCalls).toBeGreaterThanOrEqual(2);
  });

  test("times out when workflows never finish", async () => {
    const start = Date.now();
    const { lifecycle, getExitCode } = makeLifecycle({
      activeWorkflows: () => 1,
      sleep: async () => {},
      shutdownTimeoutMs: 50,
    });
    await lifecycle.shutdown("SIGTERM");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeGreaterThanOrEqual(40);
    expect(getExitCode()).toBe(0);
  });

  test("clears registered intervals on shutdown", async () => {
    let intervalCalls = 0;
    const interval = setInterval(() => {
      intervalCalls++;
    }, 5);
    const { lifecycle } = makeLifecycle({
      activeWorkflows: () => 0,
      sleep: async () => {},
      intervals: [interval],
    });
    // Wait briefly so the interval could fire if not cleared.
    await new Promise((r) => setTimeout(r, 20));
    await lifecycle.shutdown("SIGTERM");
    const callsBefore = intervalCalls;
    await new Promise((r) => setTimeout(r, 20));
    expect(intervalCalls).toBe(callsBefore);
  });

  test("multiple concurrent workflows tracked correctly via rate limiter", async () => {
    const limiter = new RateLimiter({
      maxRequests: 5,
      windowMs: 60_000,
      maxConcurrent: 3,
    });
    limiter.tryStartWorkflow("job-1");
    limiter.tryStartWorkflow("job-2");
    limiter.tryStartWorkflow("job-3");
    expect(limiter.activeWorkflows).toBe(3);

    let active = 3;
    const { lifecycle } = makeLifecycle({
      activeWorkflows: () => active,
      sleep: async () => {
        // simulate one finishing per sleep
        active = Math.max(0, active - 1);
      },
    });
    await lifecycle.shutdown("SIGTERM");
    expect(active).toBe(0);
  });
});
