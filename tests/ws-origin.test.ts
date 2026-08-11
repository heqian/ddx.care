/**
 * WebSocket origin validation tests.
 *
 * These tests exercise the production /ws route handler via the composition
 * seam with injected trusted/allowed origins and token service. No local
 * origin allowlist or token algorithm is implemented here — all behavior is
 * produced by production code.
 */
import { test, expect, describe } from "bun:test";
import {
  createComposedRoutes,
  type CompositionDependencies,
} from "../src/backend/composition";
import { buildConfig } from "../src/backend/app-config";
import { createTokenService } from "../src/backend/token-service";
import { JobStore } from "../src/backend/progress-store";
import { RateLimiter } from "../src/backend/utils/rate-limiter";
import { agentList } from "../src/backend/agents/index";

function makeRoutes(opts?: {
  trustedOrigins?: string;
  allowedOrigins?: string;
  secret?: string;
}) {
  const cfg = buildConfig({
    MOCK_LLM: "1",
    PORT: "0",
    TRUSTED_ORIGINS: opts?.trustedOrigins ?? "",
    ALLOWED_ORIGINS: opts?.allowedOrigins ?? "*",
    WS_TOKEN_SECRET: opts?.secret ?? "",
    TOOL_CACHE_TTL_MS: "0",
    ORPHADATA_ENABLED: "0",
    RATE_LIMIT_MAX_REQUESTS: "100",
    MAX_CONCURRENT_WORKFLOWS: "20",
  });
  const jobStore = new JobStore(":memory:");
  const rateLimiter = new RateLimiter({
    maxRequests: cfg.rateLimitMaxRequests,
    windowMs: cfg.rateLimitWindowMs,
    maxConcurrent: cfg.maxConcurrentWorkflows,
  });
  const tokenService = createTokenService({
    secret: cfg.wsTokenSecret,
    jobTtlMs: cfg.jobTtlMs,
  });
  const deps: CompositionDependencies = {
    config: cfg,
    jobStore,
    abortStore: {
      set() {},
      get() {
        return undefined;
      },
      remove() {},
    } as any,
    rateLimiter,
    tokenService,
    workflowFactory: {
      async createRun() {
        return { start: async () => ({ status: "ok" }) };
      },
    },
    cacheStatus: {
      enabled: false,
      getStats: () => ({ entries: 0, hits: 0, misses: 0 }),
    },
    logger: {
      info() {},
      warn() {},
      error() {},
      request() {},
      workflowStart() {},
      workflowComplete() {},
      workflowFail() {},
    },
    clock: { now: () => Date.now() },
    idSource: { newJobId: () => crypto.randomUUID() },
    agentList: () => agentList,
    appHtml: "<html></html>",
  };
  // The server adapter always refuses upgrade so we can observe the 500
  // path; origin validation happens before upgrade.
  return createComposedRoutes(deps, {
    upgrade: () => false,
  }) as Record<string, { GET?: (req: Request) => Response | undefined }>;
}

describe("WebSocket origin validation — production /ws handler", () => {
  describe("wildcard mode (ALLOWED_ORIGINS='*')", () => {
    test("allows any origin", async () => {
      const routes = makeRoutes({ allowedOrigins: "*" });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://evil.example.com" },
        }),
      ) as Response;
      // Not 403 — wildcard allows everything (upgrade then fails with 500).
      expect(res.status).not.toBe(403);
    });

    test("rejects request with no Origin header", () => {
      const routes = makeRoutes({ allowedOrigins: "*" });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", { headers: {} }),
      ) as Response;
      expect(res.status).toBe(403);
    });
  });

  describe("restricted mode (explicit allowed list)", () => {
    const ORIGINS = "https://app.ddx.care,https://staging.ddx.care";

    test("rejects request with no origin", () => {
      const routes = makeRoutes({ allowedOrigins: ORIGINS });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", { headers: {} }),
      ) as Response;
      expect(res.status).toBe(403);
    });

    test("rejects disallowed origin", () => {
      const routes = makeRoutes({ allowedOrigins: ORIGINS });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://evil.example.com" },
        }),
      ) as Response;
      expect(res.status).toBe(403);
    });

    test("allows first listed origin", () => {
      const routes = makeRoutes({ allowedOrigins: ORIGINS });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://app.ddx.care" },
        }),
      ) as Response;
      expect(res.status).not.toBe(403);
    });

    test("allows second listed origin", () => {
      const routes = makeRoutes({ allowedOrigins: ORIGINS });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://staging.ddx.care" },
        }),
      ) as Response;
      expect(res.status).not.toBe(403);
    });

    test("rejects origin that is a substring of allowed", () => {
      const routes = makeRoutes({ allowedOrigins: ORIGINS });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://app.ddx.care.evil.com" },
        }),
      ) as Response;
      expect(res.status).toBe(403);
    });

    test("rejects origin with different scheme", () => {
      const routes = makeRoutes({ allowedOrigins: ORIGINS });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "http://app.ddx.care" },
        }),
      ) as Response;
      expect(res.status).toBe(403);
    });

    test("handles whitespace in origin list", () => {
      const routes = makeRoutes({
        allowedOrigins: "https://a.com , https://b.com",
      });
      let res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://a.com" },
        }),
      ) as Response;
      expect(res.status).not.toBe(403);
      res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://b.com" },
        }),
      ) as Response;
      expect(res.status).not.toBe(403);
    });

    test("is case-sensitive", () => {
      const routes = makeRoutes({ allowedOrigins: "https://App.DDX.Care" });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://app.ddx.care" },
        }),
      ) as Response;
      expect(res.status).toBe(403);
    });

    test("rejects empty origin list", () => {
      const routes = makeRoutes({ allowedOrigins: "" });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://app.ddx.care" },
        }),
      ) as Response;
      expect(res.status).toBe(403);
    });

    test("rejects origin with trailing slash mismatch", () => {
      const routes = makeRoutes({ allowedOrigins: "https://app.ddx.care" });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://app.ddx.care/" },
        }),
      ) as Response;
      expect(res.status).toBe(403);
    });

    test("rejects origin with port number", () => {
      const routes = makeRoutes({ allowedOrigins: "https://app.ddx.care" });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://app.ddx.care:443" },
        }),
      ) as Response;
      expect(res.status).toBe(403);
    });
  });

  describe("single origin mode", () => {
    test("allows exact match", () => {
      const routes = makeRoutes({ allowedOrigins: "https://app.ddx.care" });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://app.ddx.care" },
        }),
      ) as Response;
      expect(res.status).not.toBe(403);
    });

    test("rejects non-match", () => {
      const routes = makeRoutes({ allowedOrigins: "https://app.ddx.care" });
      const res = routes["/ws"].GET!(
        new Request("http://x/ws?jobId=test", {
          headers: { Origin: "https://other.com" },
        }),
      ) as Response;
      expect(res.status).toBe(403);
    });
  });

  test("returns 400 without jobId query parameter", () => {
    const routes = makeRoutes({ allowedOrigins: "*" });
    const res = routes["/ws"].GET!(new Request("http://x/ws")) as Response;
    expect(res.status).toBe(400);
  });
});

describe("WebSocket origin — TRUSTED_ORIGINS precedence", () => {
  test("TRUSTED_ORIGINS takes precedence over ALLOWED_ORIGINS", () => {
    const routes = makeRoutes({
      trustedOrigins: "https://ddx.care",
      allowedOrigins: "*",
    });
    let res = routes["/ws"].GET!(
      new Request("http://x/ws?jobId=test", {
        headers: { Origin: "https://ddx.care" },
      }),
    ) as Response;
    expect(res.status).not.toBe(403);
    res = routes["/ws"].GET!(
      new Request("http://x/ws?jobId=test", {
        headers: { Origin: "https://evil.com" },
      }),
    ) as Response;
    expect(res.status).toBe(403);
  });

  test("empty TRUSTED_ORIGINS falls back to ALLOWED_ORIGINS wildcard", () => {
    const routes = makeRoutes({
      trustedOrigins: "",
      allowedOrigins: "*",
    });
    const res = routes["/ws"].GET!(
      new Request("http://x/ws?jobId=test", {
        headers: { Origin: "https://anything.com" },
      }),
    ) as Response;
    expect(res.status).not.toBe(403);
  });
});

describe("WebSocket token authentication — production /ws handler", () => {
  test("rejects missing credential when secret is set", () => {
    const routes = makeRoutes({
      allowedOrigins: "*",
      secret: "ws-origin-secret",
    });
    const res = routes["/ws"].GET!(
      new Request("http://x/ws?jobId=test", {
        headers: { Origin: "http://localhost" },
      }),
    ) as Response;
    expect(res.status).toBe(403);
  });

  test("accepts a valid ticket via production token service", () => {
    const secret = "ws-origin-secret";
    const cfg = buildConfig({
      MOCK_LLM: "1",
      PORT: "0",
      ALLOWED_ORIGINS: "*",
      WS_TOKEN_SECRET: secret,
      TOOL_CACHE_TTL_MS: "0",
      ORPHADATA_ENABLED: "0",
      RATE_LIMIT_MAX_REQUESTS: "100",
      MAX_CONCURRENT_WORKFLOWS: "20",
    });
    const tokenService = createTokenService({
      secret: cfg.wsTokenSecret,
      jobTtlMs: cfg.jobTtlMs,
    });
    const jobStore = new JobStore(":memory:");
    const rateLimiter = new RateLimiter({
      maxRequests: cfg.rateLimitMaxRequests,
      windowMs: cfg.rateLimitWindowMs,
      maxConcurrent: cfg.maxConcurrentWorkflows,
    });
    const deps: CompositionDependencies = {
      config: cfg,
      jobStore,
      abortStore: {
        set() {},
        get() {
          return undefined;
        },
        remove() {},
      } as any,
      rateLimiter,
      tokenService,
      workflowFactory: {
        async createRun() {
          return { start: async () => ({ status: "ok" }) };
        },
      },
      cacheStatus: {
        enabled: false,
        getStats: () => ({ entries: 0, hits: 0, misses: 0 }),
      },
      logger: {
        info() {},
        warn() {},
        error() {},
        request() {},
        workflowStart() {},
        workflowComplete() {},
        workflowFail() {},
      },
      clock: { now: () => Date.now() },
      idSource: { newJobId: () => crypto.randomUUID() },
      agentList: () => agentList,
      appHtml: "<html></html>",
    };
    const routes = createComposedRoutes(deps, {
      upgrade: () => false,
    }) as any;
    const ticket = tokenService.generateWsTicket("job-1");
    const res = routes["/ws"].GET(
      new Request(`http://x/ws?jobId=job-1&ticket=${ticket}`, {
        headers: { Origin: "http://localhost" },
      }),
    ) as Response;
    // Ticket valid — upgrade then fails with 500 (not 403).
    expect(res.status).not.toBe(403);
  });

  test("rejects an invalid ticket", () => {
    const routes = makeRoutes({
      allowedOrigins: "*",
      secret: "ws-origin-secret",
    });
    const res = routes["/ws"].GET!(
      new Request("http://x/ws?jobId=job-1&ticket=invalid", {
        headers: { Origin: "http://localhost" },
      }),
    ) as Response;
    expect(res.status).toBe(403);
  });

  test("rejects a ticket bound to a different job", () => {
    const secret = "ws-origin-secret";
    const cfg = buildConfig({
      MOCK_LLM: "1",
      PORT: "0",
      ALLOWED_ORIGINS: "*",
      WS_TOKEN_SECRET: secret,
      TOOL_CACHE_TTL_MS: "0",
      ORPHADATA_ENABLED: "0",
      RATE_LIMIT_MAX_REQUESTS: "100",
      MAX_CONCURRENT_WORKFLOWS: "20",
    });
    const tokenService = createTokenService({
      secret: cfg.wsTokenSecret,
      jobTtlMs: cfg.jobTtlMs,
    });
    const jobStore = new JobStore(":memory:");
    const rateLimiter = new RateLimiter({
      maxRequests: cfg.rateLimitMaxRequests,
      windowMs: cfg.rateLimitWindowMs,
      maxConcurrent: cfg.maxConcurrentWorkflows,
    });
    const deps: CompositionDependencies = {
      config: cfg,
      jobStore,
      abortStore: {
        set() {},
        get() {
          return undefined;
        },
        remove() {},
      } as any,
      rateLimiter,
      tokenService,
      workflowFactory: {
        async createRun() {
          return { start: async () => ({ status: "ok" }) };
        },
      },
      cacheStatus: {
        enabled: false,
        getStats: () => ({ entries: 0, hits: 0, misses: 0 }),
      },
      logger: {
        info() {},
        warn() {},
        error() {},
        request() {},
        workflowStart() {},
        workflowComplete() {},
        workflowFail() {},
      },
      clock: { now: () => Date.now() },
      idSource: { newJobId: () => crypto.randomUUID() },
      agentList: () => agentList,
      appHtml: "<html></html>",
    };
    const routes = createComposedRoutes(deps, {
      upgrade: () => false,
    }) as any;
    const ticket = tokenService.generateWsTicket("job-A");
    const res = routes["/ws"].GET(
      new Request(`http://x/ws?jobId=job-B&ticket=${ticket}`, {
        headers: { Origin: "http://localhost" },
      }),
    ) as Response;
    expect(res.status).toBe(403);
  });
});
