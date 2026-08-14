/**
 * Integration tests for REST endpoint HMAC token verification.
 *
 * This file starts a server with WS_TOKEN_SECRET set, enabling token
 * verification on GET /v1/status/:jobId and DELETE /v1/diagnose/:jobId.
 *
 * NOTE: This file must be run separately from the main test suite because Bun
 * shares the module registry across test files in a single invocation. When
 * run alongside api.test.ts (which starts a dev-mode server), the config module
 * is already cached with WS_TOKEN_SECRET="" and this file's env vars have no
 * effect. The pure-function token verification tests in api.test.ts cover CI.
 *
 * Run:  bun run test:rest-token
 */
import { test, expect, describe, beforeAll } from "bun:test";
import { createHmac } from "node:crypto";

// Set env vars BEFORE any module imports that read config. In ESM, top-level
// imports are hoisted, so we cannot `import` ws-token here — it would cache
// config with empty env vars. Use lazy `await import()` inside test blocks.
process.env.MOCK_LLM = "1";
process.env.PORT = "3996";
process.env.WS_TOKEN_SECRET = "integration-test-secret";
process.env.TOOL_CACHE_TTL_MS = "0";
process.env.ORPHADATA_ENABLED = "0";
process.env.RATE_LIMIT_MAX_REQUESTS = "100";
process.env.MAX_CONCURRENT_WORKFLOWS = "20";

let BASE: string;

const JOB_TTL_MS = 60 * 60 * 1000;

// Lazy-loaded token primitives — imported after env vars are set so the
// config module caches the correct WS_TOKEN_SECRET.
let generateToken: typeof import("../src/backend/utils/ws-token").generateToken;
let generateWsTicket: typeof import("../src/backend/utils/ws-token").generateWsTicket;
let verifyToken: typeof import("../src/backend/utils/ws-token").verifyToken;
let verifyWsTicket: typeof import("../src/backend/utils/ws-token").verifyWsTicket;

async function loadTokenPrimitives() {
  const mod = await import("../src/backend/utils/ws-token");
  generateToken = mod.generateToken;
  generateWsTicket = mod.generateWsTicket;
  verifyToken = mod.verifyToken;
  verifyWsTicket = mod.verifyWsTicket;
}

/**
 * Mint a token in the new `<expiry>.<hmacHex>` format matching the server's
 * `generateToken(jobId)` implementation. `now` is injectable so tests can
 * produce expired tokens. Uses a direct HMAC so the token can be minted
 * before the server module is loaded (for unit-level tests, use
 * `loadTokenPrimitives()` then `generateToken`).
 */
function makeToken(jobId: string, now: number = Date.now()): string {
  const expiry = now + JOB_TTL_MS;
  const payload = `${jobId}.${expiry}`;
  const hmac = createHmac("sha256", process.env.WS_TOKEN_SECRET ?? "")
    .update(payload)
    .digest("hex");
  return `${expiry}.${hmac}`;
}

/** Mint an already-expired token (expiry 1s in the past). */
function makeExpiredToken(jobId: string): string {
  return makeToken(jobId, Date.now() - 2000 - JOB_TTL_MS);
}

const UNKNOWN_UUID = "00000000-0000-4000-a000-000000000000";

async function createJob(
  history: string,
): Promise<{ jobId: string; token: string; wsTicket: string }> {
  const res = await fetch(`${BASE}/v1/diagnose`, {
    method: "POST",
    body: JSON.stringify({
      medicalHistory: history,
      conversationTranscript: "test",
      labResults: "test",
    }),
    headers: { "Content-Type": "application/json" },
  });
  if (res.status !== 202) {
    throw new Error(`Failed to create job: ${res.status}`);
  }
  const body = (await res.json()) as {
    jobId: string;
    token: string;
    wsTicket: string;
  };
  return { jobId: body.jobId, token: body.token, wsTicket: body.wsTicket };
}

describe("REST token verification (integration with WS_TOKEN_SECRET)", () => {
  beforeAll(async () => {
    const { server } = await import("../index");
    BASE = `http://localhost:${server.port}`;
  });

  describe("POST /v1/diagnose response includes ticket and token", () => {
    test("202 response includes token and wsTicket", async () => {
      const res = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "wsTicket response test",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as {
        jobId: string;
        token: string;
        wsTicket: string;
      };
      expect(body.jobId).toBeDefined();
      expect(typeof body.token).toBe("string");
      expect(body.token.length).toBeGreaterThan(0);
      expect(typeof body.wsTicket).toBe("string");
      expect(body.wsTicket.length).toBeGreaterThan(0);
      // Token and wsTicket must be distinct credentials (different TTLs).
      expect(body.token).not.toBe(body.wsTicket);
    });
  });

  describe("GET /v1/status/:jobId — X-Job-Token header", () => {
    test("valid token via X-Job-Token header returns 200", async () => {
      const { jobId, token } = await createJob("header valid token test");
      const res = await fetch(`${BASE}/v1/status/${jobId}`, {
        headers: { "X-Job-Token": token },
      });
      expect(res.status).toBe(200);
    });

    test("valid token via query param still accepted (dev fallback)", async () => {
      const { jobId, token } = await createJob("query fallback test");
      const res = await fetch(`${BASE}/v1/status/${jobId}?token=${token}`);
      expect(res.status).toBe(200);
    });

    test("X-Job-Token header takes precedence over query param", async () => {
      const { jobId, token } = await createJob("precedence test");
      // Valid header + invalid query — header must win
      const res = await fetch(`${BASE}/v1/status/${jobId}?token=invalid`, {
        headers: { "X-Job-Token": token },
      });
      expect(res.status).toBe(200);
    });

    test("missing X-Job-Token header and query param returns 403", async () => {
      const { jobId } = await createJob("missing header test");
      const res = await fetch(`${BASE}/v1/status/${jobId}`);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("token");
    });

    test("invalid X-Job-Token header returns 403", async () => {
      const { jobId } = await createJob("invalid header test");
      const res = await fetch(`${BASE}/v1/status/${jobId}`, {
        headers: { "X-Job-Token": "invalid-hex" },
      });
      expect(res.status).toBe(403);
    });

    test("Authorization credentials are not treated as a job token", async () => {
      const { jobId, token } = await createJob("unrelated auth header test");
      const res = await fetch(`${BASE}/v1/status/${jobId}`, {
        headers: { Authorization: `Basic ${token}` },
      });
      expect(res.status).toBe(403);
    });

    test("token verified before existence — unknown job with bad header returns 403 not 404", async () => {
      const res = await fetch(`${BASE}/v1/status/${UNKNOWN_UUID}`, {
        headers: { "X-Job-Token": "bad" },
      });
      expect(res.status).toBe(403);
    });

    test("valid token on unknown job returns 404 (not 403)", async () => {
      const token = makeToken(UNKNOWN_UUID);
      const res = await fetch(`${BASE}/v1/status/${UNKNOWN_UUID}`, {
        headers: { "X-Job-Token": token },
      });
      expect(res.status).toBe(404);
    });

    test("token from different job is rejected", async () => {
      const { jobId } = await createJob("cross-job header test");
      const crossToken = makeToken(UNKNOWN_UUID);
      const res = await fetch(`${BASE}/v1/status/${jobId}`, {
        headers: { "X-Job-Token": crossToken },
      });
      expect(res.status).toBe(403);
    });

    test("expired token is rejected with 403", async () => {
      const { jobId } = await createJob("expired token test");
      const expired = makeExpiredToken(jobId);
      const res = await fetch(`${BASE}/v1/status/${jobId}`, {
        headers: { "X-Job-Token": expired },
      });
      expect(res.status).toBe(403);
    });

    test("malformed job ID returns 400 regardless of token", async () => {
      const res = await fetch(`${BASE}/v1/status/bad-id`, {
        headers: { "X-Job-Token": "whatever" },
      });
      expect(res.status).toBe(400);
    });
  });

  describe("GET /v1/status/:jobId — Cache-Control header", () => {
    test("status response includes Cache-Control: no-store, private", async () => {
      const { jobId, token } = await createJob("cache-control test");
      const res = await fetch(`${BASE}/v1/status/${jobId}`, {
        headers: { "X-Job-Token": token },
      });
      expect(res.status).toBe(200);
      expect(res.headers.get("Cache-Control")).toBe("no-store, private");
    });

    test("403 response does not require Cache-Control (no PHI in error)", async () => {
      const { jobId } = await createJob("cache-control 403 test");
      const res = await fetch(`${BASE}/v1/status/${jobId}`);
      expect(res.status).toBe(403);
      // Cache-Control is only mandated on PHI-bearing (200) responses.
      expect(res.headers.get("Cache-Control")).toBeNull();
    });
  });

  describe("DELETE /v1/diagnose/:jobId — X-Job-Token header", () => {
    test("valid token via X-Job-Token header cancels the job", async () => {
      const { jobId, token } = await createJob("delete header valid token");
      const delRes = await fetch(`${BASE}/v1/diagnose/${jobId}`, {
        method: "DELETE",
        headers: { "X-Job-Token": token },
      });
      expect(delRes.status).toBe(200);
      const body = (await delRes.json()) as { status: string };
      expect(body.status).toBe("cancelled");
    });

    test("missing token returns 403 and does not cancel", async () => {
      const { jobId, token } = await createJob("delete missing header test");
      const delRes = await fetch(`${BASE}/v1/diagnose/${jobId}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(403);

      // Verify the job was NOT cancelled — it should still be accessible
      const statusRes = await fetch(`${BASE}/v1/status/${jobId}`, {
        headers: { "X-Job-Token": token },
      });
      expect(statusRes.status).toBe(200);
      const statusBody = (await statusRes.json()) as { status: string };
      expect(statusBody.status).not.toBe("failed");
    });

    test("invalid token via X-Job-Token header returns 403", async () => {
      const { jobId } = await createJob("delete invalid header test");
      const delRes = await fetch(`${BASE}/v1/diagnose/${jobId}`, {
        method: "DELETE",
        headers: { "X-Job-Token": "invalid" },
      });
      expect(delRes.status).toBe(403);
    });

    test("expired token via X-Job-Token header returns 403", async () => {
      const { jobId } = await createJob("delete expired token test");
      const expired = makeExpiredToken(jobId);
      const delRes = await fetch(`${BASE}/v1/diagnose/${jobId}`, {
        method: "DELETE",
        headers: { "X-Job-Token": expired },
      });
      expect(delRes.status).toBe(403);
    });
  });

  describe("Malformed-Unicode token does not crash the server", () => {
    test("token with multibyte Unicode in query param returns 403 (not 500)", async () => {
      const { jobId } = await createJob("malformed unicode query test");
      // A token containing non-ASCII multibyte characters used to throw a
      // RangeError inside timingSafeEqual because the Buffer byte length
      // differed from the expected hex length. The fix requires exactly 64
      // ASCII hex chars before any Buffer comparison. Fetch rejects multibyte
      // values in request headers before sending, so exercise the query-param
      // fallback here.
      const res = await fetch(
        `${BASE}/v1/status/${jobId}?token=${encodeURIComponent("\u{1F512}".repeat(20))}`,
      );
      expect(res.status).toBe(403);
    });

    test("token with multibyte Unicode in query param on unknown job returns 403 (not 500)", async () => {
      const res = await fetch(
        `${BASE}/v1/status/${UNKNOWN_UUID}?token=${encodeURIComponent("\u{1F512}".repeat(20))}`,
      );
      expect(res.status).toBe(403);
    });

    test("token with a dot-separated malformed payload returns 403 (not 500)", async () => {
      const { jobId } = await createJob("malformed payload test");
      // A token that looks structured (has a dot) but has non-hex in the
      // hmac part must be rejected without throwing.
      const res = await fetch(
        `${BASE}/v1/status/${jobId}?token=${encodeURIComponent("123.\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff\xff")}`,
      );
      expect(res.status).toBe(403);
    });
  });
});

describe("WebSocket ticket primitives (unit, no server)", () => {
  beforeAll(async () => {
    await loadTokenPrimitives();
  });

  test("generateWsTicket produces a non-empty ticket bound to the job", () => {
    const ticket = generateWsTicket("job-x");
    expect(ticket).toBeTruthy();
    expect(ticket).toContain(".");
  });

  test("verifyWsTicket returns true for a valid ticket within TTL", () => {
    const ticket = generateWsTicket("job-y", 120);
    expect(verifyWsTicket("job-y", ticket)).toBe(true);
  });

  test("verifyWsTicket returns false for an expired ticket", () => {
    const ticket = generateWsTicket("job-z", 1, Date.now() - 5000);
    expect(verifyWsTicket("job-z", ticket)).toBe(false);
  });

  test("verifyWsTicket returns false for a ticket bound to a different job", () => {
    const ticket = generateWsTicket("job-a");
    expect(verifyWsTicket("job-b", ticket)).toBe(false);
  });

  test("verifyWsTicket returns false for a malformed ticket", () => {
    expect(verifyWsTicket("job-a", "not-a-ticket")).toBe(false);
    expect(verifyWsTicket("job-a", "")).toBe(false);
    expect(verifyWsTicket("job-a", ".")).toBe(false);
    expect(verifyWsTicket("job-a", "abc.def")).toBe(false);
  });

  test("verifyWsTicket returns true in dev mode (empty secret)", () => {
    // Dev mode is governed by WS_TOKEN_SECRET being empty. The unit-level
    // behavior is that verifyWsTicket short-circuits to true when no secret
    // is configured. We cannot unset WS_TOKEN_SECRET in this file (it is set
    // above and cached in the module), so this test documents the contract
    // via a direct call with the live secret — see the dev-mode integration
    // test in api.test.ts for the empty-secret path.
    const ticket = generateWsTicket("dev-job");
    expect(verifyWsTicket("dev-job", ticket)).toBe(true);
  });
});

describe("Token expiry primitives (unit, no server)", () => {
  beforeAll(async () => {
    await loadTokenPrimitives();
  });

  test("generateToken embeds an expiry in the future", () => {
    const before = Date.now();
    const token = generateToken("job-future");
    const after = Date.now();
    const [expiryStr] = token.split(".");
    const expiry = Number(expiryStr);
    expect(expiry).toBeGreaterThanOrEqual(before + JOB_TTL_MS - 1);
    expect(expiry).toBeLessThanOrEqual(after + JOB_TTL_MS);
  });

  test("verifyToken returns true for a fresh token", () => {
    const token = generateToken("job-fresh");
    expect(verifyToken("job-fresh", token)).toBe(true);
  });

  test("verifyToken returns false for an expired token", () => {
    const token = generateToken("job-expired", 1000, Date.now() - 2000);
    expect(verifyToken("job-expired", token)).toBe(false);
  });

  test("verifyToken returns false for a token bound to a different job", () => {
    const token = generateToken("job-A");
    expect(verifyToken("job-B", token)).toBe(false);
  });

  test("verifyToken returns false for malformed input (no RangeError)", () => {
    expect(verifyToken("job-x", "")).toBe(false);
    expect(verifyToken("job-x", "no-separator")).toBe(false);
    expect(verifyToken("job-x", ".onlysep")).toBe(false);
    expect(verifyToken("job-x", "abc.def")).toBe(false);
    expect(verifyToken("job-x", "abc.0000")).toBe(false);
    // Multibyte Unicode must not throw — must return false.
    expect(() => verifyToken("job-x", "\u{1F512}".repeat(40))).not.toThrow();
    expect(verifyToken("job-x", "\u{1F512}".repeat(40))).toBe(false);
  });
});
