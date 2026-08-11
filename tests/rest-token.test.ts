/**
 * REST endpoint HMAC token verification tests.
 *
 * Credentials are minted through production token primitives
 * (createTokenService) — no test-local HMAC implementation, no hardcoded
 * token-format replicas. The composition seam is exercised with an injected
 * token service so no process.env mutation or server singleton is required.
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

const JOB_TTL_MS = 60 * 60 * 1000;
const VALID_UUID = "00000000-0000-4000-a000-000000000000";

function makeRoutes(secret: string) {
  const cfg = buildConfig({
    MOCK_LLM: "1",
    PORT: "0",
    WS_TOKEN_SECRET: secret,
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
  const abortStore = {
    _m: new Map<string, AbortController>(),
    set(id: string, c: AbortController) {
      this._m.set(id, c);
    },
    get(id: string) {
      return this._m.get(id);
    },
    remove(id: string) {
      this._m.delete(id);
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
        // Never resolves — keeps the job pending so cancellation tests can
        // observe the cancelled transition rather than a completed/failed one.
        return { start: () => new Promise(() => {}) };
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
  return {
    routes: createComposedRoutes(deps, {
      upgrade: () => true,
      requestIP: () => ({ address: "127.0.0.1", family: "IPv4", port: 0 }),
    }) as Record<
      string,
      {
        GET?: (req: Request) => Response | Promise<Response>;
        POST?: (req: Request) => Response | Promise<Response>;
        DELETE?: (req: Request) => Response | Promise<Response>;
        OPTIONS?: (req: Request) => Response;
      }
    >,
    tokenService,
    jobStore,
  };
}

function statusRequest(jobId: string, token?: string): Request {
  const req = new Request(`http://x/v1/status/${jobId}`);
  (req as any).params = { jobId };
  if (token) req.headers.set("Authorization", `Bearer ${token}`);
  return req;
}

function deleteRequest(jobId: string, token?: string): Request {
  const req = new Request(`http://x/v1/diagnose/${jobId}`, {
    method: "DELETE",
  });
  (req as any).params = { jobId };
  if (token) req.headers.set("Authorization", `Bearer ${token}`);
  return req;
}

async function createJob(
  routes: any,
  tokenService: any,
): Promise<{ jobId: string; token: string }> {
  const res = (await routes["/v1/diagnose"].POST!(
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
  const body = (await res.json()) as { jobId: string; token: string };
  return { jobId: body.jobId, token: body.token };
}

describe("REST token verification — production token service", () => {
  describe("GET /v1/status/:jobId — Authorization header", () => {
    test("valid token via Authorization header returns 200", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const { jobId, token } = await createJob(routes, tokenService);
      const res = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(jobId, token),
      )) as Response;
      expect(res.status).toBe(200);
    });

    test("valid token via query param still accepted (dev fallback)", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const { jobId, token } = await createJob(routes, tokenService);
      const req = new Request(`http://x/v1/status/${jobId}?token=${token}`);
      (req as any).params = { jobId };
      const res = (await routes["/v1/status/:jobId"].GET!(req)) as Response;
      expect(res.status).toBe(200);
    });

    test("Authorization header takes precedence over query param", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const { jobId, token } = await createJob(routes, tokenService);
      const req = new Request(`http://x/v1/status/${jobId}?token=invalid`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      (req as any).params = { jobId };
      const res = (await routes["/v1/status/:jobId"].GET!(req)) as Response;
      expect(res.status).toBe(200);
    });

    test("missing Authorization header and missing query param returns 403", async () => {
      const { routes } = makeRoutes("rest-token-secret");
      const res = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(VALID_UUID),
      )) as Response;
      expect(res.status).toBe(403);
    });

    test("invalid Authorization header returns 403", async () => {
      const { routes } = makeRoutes("rest-token-secret");
      const res = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(VALID_UUID, "invalid-hex"),
      )) as Response;
      expect(res.status).toBe(403);
    });

    test("malformed Authorization header (not Bearer) returns 403", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const { jobId, token } = await createJob(routes, tokenService);
      const req = new Request(`http://x/v1/status/${jobId}`, {
        headers: { Authorization: `Basic ${token}` },
      });
      (req as any).params = { jobId };
      const res = (await routes["/v1/status/:jobId"].GET!(req)) as Response;
      expect(res.status).toBe(403);
    });

    test("token verified before existence — unknown job with bad header returns 403 not 404", async () => {
      const { routes } = makeRoutes("rest-token-secret");
      const res = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(VALID_UUID, "bad"),
      )) as Response;
      expect(res.status).toBe(403);
    });

    test("valid token on unknown job returns 404 (not 403)", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const token = tokenService.generateToken(VALID_UUID);
      const res = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(VALID_UUID, token),
      )) as Response;
      expect(res.status).toBe(404);
    });

    test("token from different job is rejected", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const { jobId } = await createJob(routes, tokenService);
      const crossToken = tokenService.generateToken(VALID_UUID);
      const res = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(jobId, crossToken),
      )) as Response;
      expect(res.status).toBe(403);
    });

    test("expired token is rejected with 403", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const { jobId } = await createJob(routes, tokenService);
      const expired = tokenService.generateToken(
        jobId,
        1000,
        Date.now() - 2000,
      );
      const res = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(jobId, expired),
      )) as Response;
      expect(res.status).toBe(403);
    });

    test("malformed job ID returns 400 regardless of token", async () => {
      const { routes } = makeRoutes("rest-token-secret");
      const req = new Request("http://x/v1/status/bad-id", {
        headers: { Authorization: "Bearer whatever" },
      });
      (req as any).params = { jobId: "bad-id" };
      const res = (await routes["/v1/status/:jobId"].GET!(req)) as Response;
      expect(res.status).toBe(400);
    });
  });

  describe("GET /v1/status/:jobId — Cache-Control header", () => {
    test("status response includes Cache-Control: no-store, private", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const { jobId, token } = await createJob(routes, tokenService);
      const res = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(jobId, token),
      )) as Response;
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store, private");
    });

    test("403 response does not require Cache-Control (no PHI in error)", async () => {
      const { routes } = makeRoutes("rest-token-secret");
      const res = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(VALID_UUID),
      )) as Response;
      expect(res.status).toBe(403);
      expect(res.headers.get("Cache-Control")).toBeNull();
    });
  });

  describe("DELETE /v1/diagnose/:jobId — Authorization header", () => {
    test("valid token via Authorization header cancels the job", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const { jobId, token } = await createJob(routes, tokenService);
      const res = (await routes["/v1/diagnose/:jobId"].DELETE!(
        deleteRequest(jobId, token),
      )) as Response;
      expect(res.status).toBe(200);
      const body = (await res.json()) as { status: string };
      expect(body.status).toBe("cancelled");
    });

    test("missing token returns 403 and does not cancel", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const { jobId, token } = await createJob(routes, tokenService);
      const delRes = (await routes["/v1/diagnose/:jobId"].DELETE!(
        deleteRequest(jobId),
      )) as Response;
      expect(delRes.status).toBe(403);
      // Verify the job was NOT cancelled — still accessible.
      const statusRes = (await routes["/v1/status/:jobId"].GET!(
        statusRequest(jobId, token),
      )) as Response;
      expect(statusRes.status).toBe(200);
      const body = (await statusRes.json()) as { status: string };
      expect(body.status).not.toBe("failed");
    });

    test("invalid token via Authorization header returns 403", async () => {
      const { routes } = makeRoutes("rest-token-secret");
      const res = (await routes["/v1/diagnose/:jobId"].DELETE!(
        deleteRequest(VALID_UUID, "invalid"),
      )) as Response;
      expect(res.status).toBe(403);
    });

    test("expired token via Authorization header returns 403", async () => {
      const { routes, tokenService } = makeRoutes("rest-token-secret");
      const expired = tokenService.generateToken(
        VALID_UUID,
        1000,
        Date.now() - 2000,
      );
      const res = (await routes["/v1/diagnose/:jobId"].DELETE!(
        deleteRequest(VALID_UUID, expired),
      )) as Response;
      expect(res.status).toBe(403);
    });
  });

  describe("Malformed-Unicode token does not crash the handler", () => {
    test("token with multibyte Unicode in query param returns 403 (not 500)", async () => {
      const { routes } = makeRoutes("rest-token-secret");
      const req = new Request(
        `http://x/v1/status/${VALID_UUID}?token=${encodeURIComponent("\u{1F512}".repeat(20))}`,
      );
      (req as any).params = { jobId: VALID_UUID };
      const res = (await routes["/v1/status/:jobId"].GET!(req)) as Response;
      expect(res.status).toBe(403);
    });

    test("token with a dot-separated malformed payload returns 403 (not 500)", async () => {
      const { routes } = makeRoutes("rest-token-secret");
      const req = new Request(
        `http://x/v1/status/${VALID_UUID}?token=${encodeURIComponent("123.\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff")}`,
      );
      (req as any).params = { jobId: VALID_UUID };
      const res = (await routes["/v1/status/:jobId"].GET!(req)) as Response;
      expect(res.status).toBe(403);
    });
  });
});

describe("Token primitives — production createTokenService", () => {
  test("generateToken embeds an expiry in the future", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    const before = Date.now();
    const token = svc.generateToken("job-future");
    const after = Date.now();
    const [expiryStr] = token.split(".");
    const expiry = Number(expiryStr);
    expect(expiry).toBeGreaterThanOrEqual(before + JOB_TTL_MS - 1);
    expect(expiry).toBeLessThanOrEqual(after + JOB_TTL_MS);
  });

  test("verifyToken returns true for a fresh token", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    const token = svc.generateToken("job-fresh");
    expect(svc.verifyToken("job-fresh", token)).toBe(true);
  });

  test("verifyToken returns false for an expired token", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    const token = svc.generateToken("job-expired", 1000, Date.now() - 2000);
    expect(svc.verifyToken("job-expired", token)).toBe(false);
  });

  test("verifyToken returns false for a token bound to a different job", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    const token = svc.generateToken("job-A");
    expect(svc.verifyToken("job-B", token)).toBe(false);
  });

  test("verifyToken returns false for malformed input (no RangeError)", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    expect(svc.verifyToken("job-x", "")).toBe(false);
    expect(svc.verifyToken("job-x", "no-separator")).toBe(false);
    expect(svc.verifyToken("job-x", ".onlysep")).toBe(false);
    expect(svc.verifyToken("job-x", "abc.def")).toBe(false);
    expect(svc.verifyToken("job-x", "abc.0000")).toBe(false);
    expect(() =>
      svc.verifyToken("job-x", "\u{1F512}".repeat(40)),
    ).not.toThrow();
    expect(svc.verifyToken("job-x", "\u{1F512}".repeat(40))).toBe(false);
  });
});

describe("WebSocket ticket primitives — production createTokenService", () => {
  test("generateWsTicket produces a non-empty ticket bound to the job", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    const ticket = svc.generateWsTicket("job-x");
    expect(ticket).toBeTruthy();
    expect(ticket).toContain(".");
  });

  test("verifyWsTicket returns true for a valid ticket within TTL", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    const ticket = svc.generateWsTicket("job-y", 120);
    expect(svc.verifyWsTicket("job-y", ticket)).toBe(true);
  });

  test("verifyWsTicket returns false for an expired ticket", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    const ticket = svc.generateWsTicket("job-z", 1, Date.now() - 5000);
    expect(svc.verifyWsTicket("job-z", ticket)).toBe(false);
  });

  test("verifyWsTicket returns false for a ticket bound to a different job", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    const ticket = svc.generateWsTicket("job-a");
    expect(svc.verifyWsTicket("job-b", ticket)).toBe(false);
  });

  test("verifyWsTicket returns false for a malformed ticket", () => {
    const svc = createTokenService({
      secret: "unit-secret",
      jobTtlMs: JOB_TTL_MS,
    });
    expect(svc.verifyWsTicket("job-a", "not-a-ticket")).toBe(false);
    expect(svc.verifyWsTicket("job-a", "")).toBe(false);
    expect(svc.verifyWsTicket("job-a", ".")).toBe(false);
    expect(svc.verifyWsTicket("job-a", "abc.def")).toBe(false);
  });
});

describe("Dev mode (empty secret) via production token service", () => {
  test("allows access without token", () => {
    const svc = createTokenService({ secret: "", jobTtlMs: JOB_TTL_MS });
    expect(svc.verifyToken("job-1", "")).toBe(true);
    expect(svc.verifyToken("job-1", "any-token")).toBe(true);
  });

  test("generateToken returns empty string", () => {
    const svc = createTokenService({ secret: "", jobTtlMs: JOB_TTL_MS });
    expect(svc.generateToken("job-1")).toBe("");
  });

  test("unknown job returns 404 not 403 in dev mode", async () => {
    const { routes } = makeRoutes("");
    const res = (await routes["/v1/status/:jobId"].GET!(
      statusRequest(VALID_UUID),
    )) as Response;
    expect(res.status).toBe(404);
  });
});
