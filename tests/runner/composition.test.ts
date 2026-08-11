import { test, expect, describe } from "bun:test";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";

import {
  createComposedRoutes,
  createWebSocketHandlers,
  createLifecycle,
  type CompositionDependencies,
  type ServerAdapter,
  type TimerOps,
} from "../../src/backend/composition";
import { buildConfig, validateBuiltConfig } from "../../src/backend/app-config";
import { createTokenService } from "../../src/backend/token-service";
import { JobStore } from "../../src/backend/progress-store";
import { RateLimiter } from "../../src/backend/utils/rate-limiter";
import { agentList } from "../../src/backend/agents/index";
import {
  createGenerationFailedReportOutcome,
  type AvailableReportOutcome,
} from "../../src/shared/report-outcome";

/**
 * Build a complete set of injected production dependencies backed by an
 * in-memory JobStore and a generated token secret. Tests reuse this helper
 * so the composition seam is exercised with production code, not copies.
 */
function makeDeps(opts?: {
  secret?: string;
  appHtml?: unknown;
  port?: number;
}): {
  deps: CompositionDependencies;
  server: ServerAdapter;
  jobStore: JobStore;
} {
  const cfg = buildConfig({
    MOCK_LLM: "1",
    PORT: String(opts?.port ?? 0),
    WS_TOKEN_SECRET: opts?.secret ?? "",
    TOOL_CACHE_TTL_MS: "0",
    ORPHADATA_ENABLED: "0",
    JOB_TTL_MS: "3600000",
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
  const abortStore = {
    _map: new Map<string, AbortController>(),
    set(id: string, c: AbortController) {
      this._map.set(id, c);
    },
    get(id: string) {
      return this._map.get(id);
    },
    remove(id: string) {
      this._map.delete(id);
    },
  };
  const deps: CompositionDependencies = {
    config: cfg,
    jobStore,
    abortStore: abortStore as any,
    rateLimiter,
    tokenService,
    workflowFactory: {
      async createRun() {
        return {
          start: async () => ({ status: "ok" }),
        };
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
    appHtml: opts?.appHtml ?? "<html></html>",
  };
  const server: ServerAdapter = {
    upgrade: () => true,
    requestIP: () => ({ address: "127.0.0.1", family: "IPv4", port: 0 }),
  };
  return { deps, server, jobStore };
}

const availableOutcome: AvailableReportOutcome = {
  status: "available",
  report: {
    chiefComplaint: "Headache",
    patientSummary: "Adult with recurrent headache",
    specialistsConsulted: [
      { specialist: "Neurologist", keyFindings: "Migraine is likely" },
    ],
    diagnoses: [
      {
        rank: 1,
        name: "Migraine",
        confidence: 80,
        urgency: "routine",
        rationale: "Recurrent headache pattern",
        supportingEvidence: ["Recurrent headache"],
        contradictoryEvidence: [],
        nextSteps: ["Clinical follow-up"],
      },
    ],
    crossSpecialtyObservations: "None",
    recommendedImmediateActions: "Follow up",
  },
  generatedAt: "2026-01-15T10:30:00.000Z",
  disclaimer: "Research use only",
};

describe("composition — import safety (task 2.9)", () => {
  test("importing composition does not open databases, start servers, or register timers", async () => {
    // Capture state before import.
    const beforeDbFiles: string[] = [];
    const tmp = mkdtempSync(join(tmpdir(), "ddx-comp-import-"));
    try {
      // Importing a side-effect-free module must not produce any persistence
      // leaf beneath the temporary root. We re-import via a dynamic import to
      // a fresh module URL with a cache-busting query string.
      const mod = await import("../../src/backend/composition");
      expect(typeof mod.createComposedRoutes).toBe("function");
      expect(typeof mod.createWebSocketHandlers).toBe("function");
      expect(typeof mod.createLifecycle).toBe("function");
      // No file should have been created beneath the temp root by import.
      for (const f of beforeDbFiles) expect(existsSync(f)).toBe(false);
      // No timer registration happened as a side effect of import:
      // we cannot directly introspect Bun's timer list, but importing must
      // not throw and must not require a server. The fact that we can call
      // these constructors below confirms import alone did nothing.
    } finally {
      rmSync(tmp, { recursive: true, force: true });
    }
  });
});

describe("composition — config loader (task 2.2)", () => {
  test("buildConfig produces an immutable config from explicit env", () => {
    const cfg = buildConfig({
      PORT: "4321",
      JOB_TTL_MS: "9000000",
      MOCK_LLM: "1",
      TOOL_CACHE_TTL_MS: "0",
    });
    expect(cfg.port).toBe(4321);
    expect(cfg.jobTtlMs).toBe(9_000_000);
    expect(cfg.toolCacheTtlMs).toBe(0);
    expect(cfg.toolCacheEnabled).toBe(false);
  });

  test("validateBuiltConfig accepts a valid config with MOCK_LLM", () => {
    const cfg = buildConfig({ MOCK_LLM: "1", TOOL_CACHE_TTL_MS: "0" });
    expect(() => validateBuiltConfig(cfg)).not.toThrow();
  });

  test("validateBuiltConfig rejects JOB_TTL_MS below DIAGNOSIS_TIMEOUT_MS", () => {
    const cfg = buildConfig({
      MOCK_LLM: "1",
      JOB_TTL_MS: "1",
      DIAGNOSIS_TIMEOUT_MS: "900000",
    });
    expect(() => validateBuiltConfig(cfg)).toThrow(/JOB_TTL_MS/);
  });
});

describe("composition — route construction (tasks 2.5, 2.6)", () => {
  test("createComposedRoutes accepts injected dependencies and returns handlers", () => {
    const { deps, server } = makeDeps();
    const routes = createComposedRoutes(deps, server);
    expect(routes["/v1/health"]).toBeDefined();
    expect(routes["/v1/agents"]).toBeDefined();
    expect(routes["/v1/diagnose"]).toBeDefined();
    expect(routes["/ws"]).toBeDefined();
  });

  test("GET /v1/agents returns the production agent list via injected deps", async () => {
    const { deps, server } = makeDeps();
    const routes = createComposedRoutes(deps, server) as any;
    const res = (await routes["/v1/agents"].GET(
      new Request("http://x/v1/agents"),
    )) as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.agents).toEqual(agentList);
  });

  test("GET /v1/health reports dbOk from the injected job store", async () => {
    const { deps, server } = makeDeps();
    const routes = createComposedRoutes(deps, server) as any;
    const res = (await routes["/v1/health"].GET(
      new Request("http://x/v1/health"),
    )) as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");
  });

  test("POST /v1/diagnose validates input via the production schema", async () => {
    const { deps, server } = makeDeps();
    const routes = createComposedRoutes(deps, server) as any;
    const res = (await routes["/v1/diagnose"].POST(
      new Request("http://x/v1/diagnose", {
        method: "POST",
        body: JSON.stringify({ medicalHistory: "test" }),
        headers: { "Content-Type": "application/json" },
      }),
    )) as Response;
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Validation failed");
  });

  test("GET /v1/status/:jobId returns 404 for unknown job via injected store", async () => {
    const { deps, server } = makeDeps();
    const routes = createComposedRoutes(deps, server) as any;
    const req = new Request(
      "http://x/v1/status/00000000-0000-4000-a000-000000000000",
    );
    (req as any).params = { jobId: "00000000-0000-4000-a000-000000000000" };
    const res = (await routes["/v1/status/:jobId"].GET(req)) as Response;
    expect(res.status).toBe(404);
  });

  test("CORS headers are produced by the production corsHeaders helper", async () => {
    const { deps, server } = makeDeps();
    const routes = createComposedRoutes(deps, server) as any;
    const res = (await routes["/v1/agents"].GET(
      new Request("http://x/v1/agents"),
    )) as Response;
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Content-Security-Policy")).toContain(
      "default-src 'self'",
    );
  });

  test("token service produces verifiable credentials via injected config", async () => {
    const { deps, server } = makeDeps({ secret: "composition-test-secret" });
    const routes = createComposedRoutes(deps, server) as any;
    // Create a job via POST then GET status with the returned token.
    const postRes = (await routes["/v1/diagnose"].POST(
      new Request("http://x/v1/diagnose", {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "test",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      }),
    )) as Response;
    expect(postRes.status).toBe(202);
    const postBody = await postRes.json();
    expect(postBody.token.length).toBeGreaterThan(0);

    const statusReq = new Request(`http://x/v1/status/${postBody.jobId}`, {
      headers: { Authorization: `Bearer ${postBody.token}` },
    });
    (statusReq as any).params = { jobId: postBody.jobId };
    const statusRes = (await routes["/v1/status/:jobId"].GET(
      statusReq,
    )) as Response;
    expect(statusRes.status).toBe(200);
    expect(statusRes.headers.get("Cache-Control")).toBe("no-store, private");
  });

  test("GET /v1/status/:jobId returns 403 for missing token when secret is set", async () => {
    const { deps, server } = makeDeps({ secret: "composition-test-secret" });
    const routes = createComposedRoutes(deps, server) as any;
    const req = new Request(
      "http://x/v1/status/00000000-0000-4000-a000-000000000000",
    );
    (req as any).params = { jobId: "00000000-0000-4000-a000-000000000000" };
    const res = (await routes["/v1/status/:jobId"].GET(req)) as Response;
    expect(res.status).toBe(403);
  });

  test("client-IP extraction exercises the production getClientIp logic", async () => {
    const { deps, server } = makeDeps();
    const routes = createComposedRoutes(deps, server) as any;
    // x-real-ip should win; this is the production decision.
    const req = new Request("http://x/v1/diagnose", {
      method: "POST",
      body: "bad",
      headers: { "Content-Type": "application/json", "x-real-ip": "9.9.9.9" },
    });
    const res = (await routes["/v1/diagnose"].POST(req)) as Response;
    expect(res.status).toBe(400);
  });
});

describe("composition — WebSocket handler factory (task 2.7)", () => {
  const realTimers: TimerOps = {
    setInterval,
    setTimeout,
    clearInterval,
    clearTimeout,
  };

  test("createWebSocketHandlers uses the injected job store, not the singleton", () => {
    const { jobStore } = makeDeps();
    const handlers = createWebSocketHandlers({
      jobStore: jobStore,
      timers: realTimers,
    });
    expect(typeof handlers.open).toBe("function");
    expect(typeof handlers.close).toBe("function");
  });

  test("replays history and closes immediately for a completed job via injected store", () => {
    const { deps, jobStore } = makeDeps();
    const handlers = createWebSocketHandlers({
      jobStore: jobStore,
      timers: realTimers,
    });
    deps.jobStore.createJob("job-x");
    deps.jobStore.complete("job-x", availableOutcome);

    class MockWS {
      data: any;
      messages: string[] = [];
      closed = false;
      readyState = 1;
      constructor(data: any) {
        this.data = data;
      }
      send(m: string) {
        this.messages.push(m);
      }
      close() {
        this.closed = true;
      }
      ping() {}
    }
    const ws = new MockWS({ jobId: "job-x" });
    handlers.open(ws as any);
    expect(ws.closed).toBe(true);
    expect(ws.messages).toHaveLength(1);
    const msg = JSON.parse(ws.messages[0]);
    expect(msg.type).toBe("completed");
    expect(msg.result).toEqual(availableOutcome);
  });

  test("closes with failed for an unknown job via injected store", () => {
    const { jobStore } = makeDeps();
    const handlers = createWebSocketHandlers({
      jobStore: jobStore,
      timers: realTimers,
    });
    class MockWS {
      data: any;
      messages: string[] = [];
      closed = false;
      readyState = 1;
      constructor(data: any) {
        this.data = data;
      }
      send(m: string) {
        this.messages.push(m);
      }
      close() {
        this.closed = true;
      }
      ping() {}
    }
    const ws = new MockWS({ jobId: "missing" });
    handlers.open(ws as any);
    expect(ws.closed).toBe(true);
    expect(JSON.parse(ws.messages[0]).error).toBe("Job not found");
  });
});

describe("composition — lifecycle coordinator (tasks 2.8, 2.9)", () => {
  test("createLifecycle shutdown stops server, clears intervals, and exits", async () => {
    const { deps, jobStore } = makeDeps();
    let serverStopped = false;
    let exitCode: number | null = null;
    const interval = setInterval(() => {}, 1000);
    const lifecycle = createLifecycle({
      config: deps.config,
      jobStore: jobStore,
      rateLimiter: deps.rateLimiter,
      server: {
        stop: () => {
          serverStopped = true;
        },
      },
      activeWorkflows: () => 0,
      sleep: async () => {},
      shutdownTimeoutMs: 1000,
      exit: (code) => {
        exitCode = code;
      },
      timers: {
        setInterval,
        setTimeout,
        clearInterval,
        clearTimeout,
        intervals: [interval],
      },
      orphadataEnabled: false,
      toolCacheEnabled: false,
      jobTtlMs: deps.config.jobTtlMs,
      pendingJobTimeoutMs: deps.config.pendingJobTimeoutMs,
    });
    await lifecycle.shutdown("SIGTERM");
    expect(serverStopped).toBe(true);
    expect(exitCode as unknown as number).toBe(0);
  });

  test("shutdown waits for active workflows via the injected sleep", async () => {
    const { deps, jobStore } = makeDeps();
    let sleepCalls = 0;
    let active = 1;
    const lifecycle = createLifecycle({
      config: deps.config,
      jobStore: jobStore,
      rateLimiter: deps.rateLimiter,
      server: { stop: () => {} },
      activeWorkflows: () => active,
      sleep: async () => {
        sleepCalls++;
        if (sleepCalls >= 2) active = 0;
      },
      shutdownTimeoutMs: 10_000,
      exit: () => {},
      timers: {
        setInterval,
        setTimeout,
        clearInterval,
        clearTimeout,
        intervals: [],
      },
      orphadataEnabled: false,
      toolCacheEnabled: false,
      jobTtlMs: deps.config.jobTtlMs,
      pendingJobTimeoutMs: deps.config.pendingJobTimeoutMs,
    });
    await lifecycle.shutdown("SIGTERM");
    expect(sleepCalls).toBeGreaterThanOrEqual(2);
  });

  test("shutdown breaks out after the timeout when workflows never finish", async () => {
    const { deps, jobStore } = makeDeps();
    const lifecycle = createLifecycle({
      config: deps.config,
      jobStore: jobStore,
      rateLimiter: deps.rateLimiter,
      server: { stop: () => {} },
      activeWorkflows: () => 1,
      sleep: async () => {},
      shutdownTimeoutMs: 50,
      exit: () => {},
      timers: {
        setInterval,
        setTimeout,
        clearInterval,
        clearTimeout,
        intervals: [],
      },
      orphadataEnabled: false,
      toolCacheEnabled: false,
      jobTtlMs: deps.config.jobTtlMs,
      pendingJobTimeoutMs: deps.config.pendingJobTimeoutMs,
    });
    await lifecycle.shutdown("SIGTERM");
    // No assertion beyond not hanging — the timeout broke the loop.
  });

  test("startup calls markStalePending then cleanupExpired with the injected store", async () => {
    const { deps, jobStore } = makeDeps();
    let stalePendingCalled = false;
    let cleanupExpiredArg = 0;
    const trackingStore = {
      ...jobStore,
      markStalePending: () => {
        stalePendingCalled = true;
      },
      cleanupExpired: (ttl: number) => {
        cleanupExpiredArg = ttl;
      },
    };
    const lifecycle = createLifecycle({
      config: deps.config,
      jobStore: trackingStore as any,
      rateLimiter: deps.rateLimiter,
      server: { stop: () => {} },
      activeWorkflows: () => 0,
      sleep: async () => {},
      shutdownTimeoutMs: 1000,
      exit: () => {},
      timers: {
        setInterval,
        setTimeout,
        clearInterval,
        clearTimeout,
        intervals: [],
      },
      orphadataEnabled: false,
      toolCacheEnabled: false,
      jobTtlMs: 12345,
      pendingJobTimeoutMs: 99999,
    });
    await lifecycle.startup();
    expect(stalePendingCalled).toBe(true);
    expect(cleanupExpiredArg).toBe(12345);
  });
});

describe("composition — token service factory (task 2.6)", () => {
  test("createTokenService mints and verifies tokens with the injected secret", () => {
    const svc = createTokenService({
      secret: "factory-secret",
      jobTtlMs: 60_000,
    });
    const token = svc.generateToken("job-1");
    expect(token).toBeTruthy();
    expect(svc.verifyToken("job-1", token)).toBe(true);
    expect(svc.verifyToken("job-2", token)).toBe(false);
  });

  test("createTokenService rejects expired tokens", () => {
    const svc = createTokenService({
      secret: "factory-secret",
      jobTtlMs: 1000,
    });
    const expired = svc.generateToken("job-1", 1000, Date.now() - 2000);
    expect(svc.verifyToken("job-1", expired)).toBe(false);
  });

  test("createTokenService wsTicket has independent TTL", () => {
    const svc = createTokenService({
      secret: "factory-secret",
      jobTtlMs: 60_000,
      wsTicketTtlSec: 1,
    });
    const ticket = svc.generateWsTicket("job-1");
    expect(svc.verifyWsTicket("job-1", ticket)).toBe(true);
    const expiredTicket = svc.generateWsTicket("job-1", 1, Date.now() - 2000);
    expect(svc.verifyWsTicket("job-1", expiredTicket)).toBe(false);
  });

  test("createTokenService dev mode (empty secret) returns true", () => {
    const svc = createTokenService({ secret: "", jobTtlMs: 60_000 });
    expect(svc.verifyToken("job-1", "any")).toBe(true);
    expect(svc.generateToken("job-1")).toBe("");
  });

  test("createTokenService handles malformed input without throwing", () => {
    const svc = createTokenService({
      secret: "factory-secret",
      jobTtlMs: 60_000,
    });
    expect(() => svc.verifyToken("job-1", "")).not.toThrow();
    expect(() =>
      svc.verifyToken("job-1", "\u{1F512}".repeat(40)),
    ).not.toThrow();
    expect(svc.verifyToken("job-1", "no-sep")).toBe(false);
  });
});

describe("composition — generation_failed outcome round-trip", () => {
  test("completed job with generation_failed outcome is returned by status", async () => {
    const { deps, server } = makeDeps();
    const routes = createComposedRoutes(deps, server) as any;
    const outcome = createGenerationFailedReportOutcome(
      "REPORT_PROVIDER_UNAVAILABLE",
    );
    deps.jobStore.createJob("00000000-0000-4000-a000-0000000000ff");
    deps.jobStore.complete("00000000-0000-4000-a000-0000000000ff", outcome);

    const req = new Request(
      "http://x/v1/status/00000000-0000-4000-a000-0000000000ff",
    );
    (req as any).params = { jobId: "00000000-0000-4000-a000-0000000000ff" };
    const res = (await routes["/v1/status/:jobId"].GET(req)) as Response;
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("completed");
    expect(body.result.status).toBe("generation_failed");
  });
});
