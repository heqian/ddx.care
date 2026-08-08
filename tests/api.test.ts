import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { createHmac, timingSafeEqual } from "node:crypto";

const _savedMockLlm = process.env.MOCK_LLM;
const _savedPort = process.env.PORT;

// Set mock mode and test port before the server module loads
process.env.MOCK_LLM = "1";
process.env.PORT = "3998";

let BASE: string;

describe("API Endpoints", () => {
  beforeAll(async () => {
    // Dynamic import ensures env vars are set before Bun.serve() runs
    const { server } = await import("../index");
    BASE = `http://localhost:${server.port}`;
  });

  test("GET /v1/agents returns agent list", async () => {
    const res = await fetch(`${BASE}/v1/agents`);
    expect(res.ok).toBe(true);

    const { specialistIds } = await import("../src/backend/agents/manifest");
    const body = (await res.json()) as {
      agents: Array<{ id: string; name: string; description: string }>;
    };
    expect(body.agents).toBeInstanceOf(Array);
    expect(body.agents.map(({ id }) => id)).toEqual(specialistIds);
    expect(body.agents.every(({ id }) => !id.includes("-"))).toBe(true);
    expect(
      body.agents.every(({ name, description }) => name && description),
    ).toBe(true);
  });

  test("GET /v1/health returns ok", async () => {
    const res = await fetch(`${BASE}/v1/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.status).toBe("ok");
    expect(typeof body.uptime).toBe("number");
    expect(typeof body.activeWorkflows).toBe("number");
  });

  test("POST /v1/diagnose rejects invalid JSON", async () => {
    const res = await fetch(`${BASE}/v1/diagnose`, {
      method: "POST",
      body: "not json",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
  });

  test("POST /v1/diagnose rejects missing fields", async () => {
    const res = await fetch(`${BASE}/v1/diagnose`, {
      method: "POST",
      body: JSON.stringify({ medicalHistory: "test" }),
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Validation failed");
  });

  test("GET /v1/status/:jobId returns 404 for unknown job", async () => {
    const res = await fetch(
      `${BASE}/v1/status/00000000-0000-4000-a000-000000000000`,
    );
    expect(res.status).toBe(404);
  });

  test("GET /v1/status/:jobId returns 400 for invalid job ID format", async () => {
    const res = await fetch(`${BASE}/v1/status/nonexistent-id`);
    expect(res.status).toBe(400);
    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Invalid job ID");
  });

  test("POST /v1/diagnose creates a job and completes with mock", async () => {
    const startRes = await fetch(`${BASE}/v1/diagnose`, {
      method: "POST",
      body: JSON.stringify({
        medicalHistory:
          "45-year-old with history of hypertension on lisinopril.",
        conversationTranscript:
          "The individual reports a severe headache for 3 days. Clinician noted blurred vision.",
        labResults: "BP: 180 over 110. Heart rate: 90.",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(startRes.status).toBe(202);
    const startBody = (await startRes.json()) as {
      jobId: string;
      status: string;
    };
    expect(startBody.jobId).toBeDefined();
    expect(startBody.status).toBe("pending");

    const jobId = startBody.jobId;
    let jobStatus = "pending";
    let finalResult: Record<string, unknown> | null = null;

    // Poll up to 30 times, 1 second apart — mock completes in <1 second
    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
      const statusRes = await fetch(`${BASE}/v1/status/${jobId}`);
      expect(statusRes.status).toBe(200);

      const statusBody = (await statusRes.json()) as Record<string, unknown>;
      jobStatus = statusBody.status as string;

      if (jobStatus !== "pending") {
        finalResult = statusBody;
        break;
      }
    }

    if (!finalResult) {
      throw new Error("Job did not complete within 30 seconds");
    }

    expect(jobStatus).toBe("completed");
    expect(finalResult.result).toBeDefined();
    const outcome = finalResult.result as Record<string, unknown>;
    expect(outcome.status).toBe("available");
    expect(outcome.report).toBeDefined();
    expect(outcome.result).toBeUndefined();
  }, 60_000);

  test("POST /v1/diagnose completes with generation_failed when report generation is unavailable", async () => {
    const startRes = await fetch(`${BASE}/v1/diagnose`, {
      method: "POST",
      body: JSON.stringify({
        medicalHistory: "E2E_MOCK_REPORT_FAILURE Hypertension history.",
        conversationTranscript: "Persistent severe headache.",
        labResults: "BP: 180 over 110.",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(startRes.status).toBe(202);
    const { jobId } = (await startRes.json()) as { jobId: string };
    let finalResult: Record<string, unknown> | null = null;

    for (let i = 0; i < 30; i++) {
      await new Promise((resolve) => setTimeout(resolve, 100));
      const statusRes = await fetch(`${BASE}/v1/status/${jobId}`);
      expect(statusRes.status).toBe(200);
      const statusBody = (await statusRes.json()) as Record<string, unknown>;
      if (statusBody.status !== "pending") {
        finalResult = statusBody;
        break;
      }
    }

    if (!finalResult) {
      throw new Error("Job did not complete within 3 seconds");
    }

    expect(finalResult.status).toBe("completed");
    const outcome = finalResult.result as Record<string, unknown>;
    expect(outcome.status).toBe("generation_failed");
    expect(outcome.errorCode).toBe("REPORT_PROVIDER_UNAVAILABLE");
    expect(outcome.retryable).toBe(true);
    expect(outcome.report).toBeUndefined();
    expect(outcome.diagnoses).toBeUndefined();
    expect(outcome.confidence).toBeUndefined();
    expect(outcome.urgency).toBeUndefined();
  }, 10_000);

  test("POST /v1/diagnose returns 413 for oversized payload", async () => {
    // MAX_PAYLOAD_BYTES is 1,000,000 — create a body that exceeds it
    // We need a body whose actual content-length exceeds the limit
    const hugeField = "x".repeat(400_000); // each field = 400k chars
    const body = JSON.stringify({
      medicalHistory: hugeField,
      conversationTranscript: hugeField,
      labResults: hugeField,
    });
    // Total body is ~1.2MB, exceeding MAX_PAYLOAD_BYTES (1MB)
    const req = new Request(`${BASE}/v1/diagnose`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
      },
    });

    const res = await fetch(req);
    // With maxRequestBodySize set in Bun.serve(), oversized bodies
    // are rejected at the HTTP layer with 413.
    expect([400, 413]).toContain(res.status);
  });

  test("POST /v1/diagnose rejects body exceeding maxRequestBodySize even with small content-length header", async () => {
    // Simulate a spoofed Content-Length by creating a body that's larger
    // than the declared content-length. Bun's maxRequestBodySize enforces
    // the actual byte count irrespective of the header.
    const hugeField = "x".repeat(400_000);
    const body = JSON.stringify({
      medicalHistory: hugeField,
      conversationTranscript: hugeField,
      labResults: hugeField,
    });

    // Construct request with deliberately mismatched content-length
    const req = new Request(`${BASE}/v1/diagnose`, {
      method: "POST",
      body,
      headers: {
        "Content-Type": "application/json",
        "Content-Length": "100",
      },
    });

    const res = await fetch(req);
    // Bun enforces actual stream byte count, not just the header
    expect([400, 413]).toContain(res.status);
  });

  test("POST /v1/diagnose returns 400 for oversized field", async () => {
    // Allow time for rate limiter window to recover after prior tests
    await new Promise((resolve) => setTimeout(resolve, 2000));
    // MAX_INPUT_FIELD_LENGTH is 50,000 characters
    const longField = "x".repeat(51_000);
    const res = await fetch(`${BASE}/v1/diagnose`, {
      method: "POST",
      body: JSON.stringify({
        medicalHistory: longField,
        conversationTranscript: "normal",
        labResults: "normal",
      }),
      headers: { "Content-Type": "application/json" },
    });

    // Should be rejected — either 400 (validation) or 413 (payload size)
    expect([400, 413]).toContain(res.status);
    const text = await res.text();
    if (text) {
      try {
        const body = JSON.parse(text) as { error: string };
        expect(body.error).toBeTruthy();
      } catch (_e) {
        // ignore JSON parse error if body is plain text or empty
      }
    }
  });

  describe("CORS headers", () => {
    test("GET /v1/agents includes CORS headers", async () => {
      const res = await fetch(`${BASE}/v1/agents`);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, DELETE, OPTIONS",
      );
      expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
      );
    });

    test("POST /v1/diagnose includes CORS headers on error", async () => {
      const res = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: "bad",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
      );
    });

    test("GET /v1/status/:jobId includes CORS headers on 404", async () => {
      const res = await fetch(
        `${BASE}/v1/status/00000000-0000-4000-a000-000000000001`,
      );
      expect(res.status).toBe(404);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    test("OPTIONS /v1/diagnose returns preflight response", async () => {
      const res = await fetch(`${BASE}/v1/diagnose`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, DELETE, OPTIONS",
      );
      expect(res.headers.get("Access-Control-Allow-Headers")).toBe(
        "Content-Type",
      );
    });

    test("OPTIONS /v1/agents returns preflight response", async () => {
      const res = await fetch(`${BASE}/v1/agents`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    test("OPTIONS /v1/status/test-id returns preflight response", async () => {
      const res = await fetch(`${BASE}/v1/status/test-id`, {
        method: "OPTIONS",
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    test("OPTIONS /v1/unknown returns preflight response via catch-all", async () => {
      const res = await fetch(`${BASE}/v1/unknown-route`, {
        method: "OPTIONS",
      });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });
  });

  describe("WebSocket origin validation", () => {
    test("GET /ws returns 400 without jobId query parameter", async () => {
      const res = await fetch(`${BASE}/ws`);
      expect(res.status).toBe(400);
    });

    test("GET /ws allows connection when ALLOWED_ORIGINS is wildcard", async () => {
      const res = await fetch(`${BASE}/ws?jobId=test-origin`, {
        headers: { Origin: "https://evil.example.com" },
      });
      expect(res.status).not.toBe(403);
    });

    test("GET /ws rejects connection without Origin header even in wildcard mode", async () => {
      const res = await fetch(`${BASE}/ws?jobId=test-origin`, {
        headers: {},
      });
      // Remove Origin header by creating a new request without it
      expect(res.status).toBe(403);
    });
  });

  describe("Content-Security-Policy headers", () => {
    test("GET /v1/agents includes CSP header", async () => {
      const res = await fetch(`${BASE}/v1/agents`);
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toBeTruthy();
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self'");
      expect(csp).toContain("style-src 'self' 'unsafe-inline'");
      expect(csp).toContain("font-src 'self' https://fonts.gstatic.com");
      expect(csp).toContain("img-src 'self' data:");
      expect(csp).toContain("connect-src 'self'");
      expect(csp).toContain("frame-ancestors 'none'");
    });

    test("GET /v1/health includes CSP header", async () => {
      const res = await fetch(`${BASE}/v1/health`);
      expect(res.headers.get("Content-Security-Policy")).toContain(
        "default-src 'self'",
      );
    });

    test("POST /v1/diagnose includes CSP header on error response", async () => {
      const res = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: "bad",
        headers: { "Content-Type": "application/json" },
      });
      expect(res.headers.get("Content-Security-Policy")).toContain(
        "default-src 'self'",
      );
    });

    test("OPTIONS preflight response includes CSP header", async () => {
      const res = await fetch(`${BASE}/v1/diagnose`, { method: "OPTIONS" });
      expect(res.headers.get("Content-Security-Policy")).toContain(
        "default-src 'self'",
      );
    });

    test("GET / serves the bundled HTML page", async () => {
      const res = await fetch(`${BASE}/`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      const body = await res.text();
      expect(body).toContain("<!doctype html>");
      expect(body).toContain('id="root"');
      // Security headers (CSP, X-Frame-Options, X-Content-Type-Options) for
      // HTML responses are applied by the Caddy reverse proxy in production,
      // because Bun's HTMLBundle route values bypass the app's corsHeaders().
    });

    test("GET / SPA fallback serves the bundled HTML page", async () => {
      const res = await fetch(`${BASE}/some/non-existent/spa/path`);
      expect(res.status).toBe(200);
      expect(res.headers.get("Content-Type")).toContain("text/html");
      const body = await res.text();
      expect(body).toContain("<!doctype html>");
    });

    test("CSP includes tightened directives: base-uri, form-action, object-src", async () => {
      const res = await fetch(`${BASE}/v1/agents`);
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toContain("base-uri 'none'");
      expect(csp).toContain("form-action 'self'");
      expect(csp).toContain("object-src 'none'");
    });

    test("CSP connect-src is restricted to 'self' without bare ws/wss schemes", async () => {
      const res = await fetch(`${BASE}/v1/agents`);
      const csp = res.headers.get("Content-Security-Policy");
      expect(csp).toContain("connect-src 'self'");
      const connectSrcMatch = csp?.match(/connect-src ([^;]+)/);
      const connectSrc = connectSrcMatch?.[1] ?? "";
      expect(connectSrc).not.toMatch(/\bws:/);
      expect(connectSrc).not.toMatch(/\bwss:/);
    });

    test("CSP style-src allowlists Google Fonts CSS origin", async () => {
      const res = await fetch(`${BASE}/v1/agents`);
      const csp = res.headers.get("Content-Security-Policy");
      const styleSrcMatch = csp?.match(/style-src ([^;]+)/);
      const styleSrc = styleSrcMatch?.[1] ?? "";
      expect(styleSrc).toContain("https://fonts.googleapis.com");
    });
  });

  describe("Rate limit reservation", () => {
    test("workflow slot is released on invalid JSON body", async () => {
      // Import the rate limiter to reset state for a clean test
      const { rateLimiter } = await import("../src/backend/api/routes");

      // Reset rate limit state for this test
      const savedReset = rateLimiter["hasLoggedReset"];
      rateLimiter["clients"].clear();
      rateLimiter["activeCount"] = 0;
      rateLimiter["hasLoggedReset"] = true;

      const startRes = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });
      expect(startRes.status).toBe(400);

      // The workflow slot should have been released (finishWorkflow called),
      // so the concurrent workflow count should be back to 0.
      expect(rateLimiter.activeWorkflows).toBe(0);

      // Reset hasLoggedReset to avoid double-warning
      rateLimiter["hasLoggedReset"] = savedReset;
    });

    test("returns 429 with Retry-After header when rate limit exceeded", async () => {
      const { rateLimiter } = await import("../src/backend/api/routes");

      // Reset rate limit state for a clean test
      const savedReset = rateLimiter["hasLoggedReset"];
      rateLimiter["clients"].clear();
      rateLimiter["activeCount"] = 0;
      rateLimiter["hasLoggedReset"] = true;

      // Pre-fill the rate limit window to exhaust the per-IP quota
      // Default is 10 requests per 60s window
      const testIp = "::1";
      rateLimiter["clients"].set(testIp, {
        timestamps: Array(10).fill(Date.now()),
      });

      // The next request from the same IP should be rate limited
      const limitedRes = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "test",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });
      expect(limitedRes.status).toBe(429);

      const body = (await limitedRes.json()) as { error: string };
      expect(body.error).toContain("Rate limit");

      const retryAfter = limitedRes.headers.get("Retry-After");
      expect(retryAfter).toBeTruthy();
      expect(Number(retryAfter)).toBeGreaterThan(0);

      // Cleanup: reset rate limiter state for subsequent tests
      rateLimiter["clients"].clear();
      rateLimiter["activeCount"] = 0;
      rateLimiter["hasLoggedReset"] = savedReset;
    });
  });

  describe("Security headers", () => {
    test("GET /v1/agents includes X-Content-Type-Options header", async () => {
      const res = await fetch(`${BASE}/v1/agents`);
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    });

    test("GET /v1/agents includes X-Frame-Options header", async () => {
      const res = await fetch(`${BASE}/v1/agents`);
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    });

    test("OPTIONS preflight includes security headers", async () => {
      const res = await fetch(`${BASE}/v1/diagnose`, { method: "OPTIONS" });
      expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
      expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    });
  });

  describe("TRUSTED_ORIGINS CORS validation", () => {
    function buildCorsHeaders(
      trustedOrigins: string,
      allowedOrigins: string,
      origin: string | null,
    ): Record<string, string> {
      const headers: Record<string, string> = {
        "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      };

      if (trustedOrigins) {
        const allowed = trustedOrigins.split(",").map((o) => o.trim());
        if (origin && allowed.includes(origin)) {
          headers["Access-Control-Allow-Origin"] = origin;
        }
        // Dynamic origin reflection requires Vary: Origin
        headers["Vary"] = "Origin";
      } else {
        headers["Access-Control-Allow-Origin"] = allowedOrigins;
      }

      return headers;
    }

    test("reflects matching origin when TRUSTED_ORIGINS is set", () => {
      const headers = buildCorsHeaders(
        "https://ddx.care",
        "*",
        "https://ddx.care",
      );
      expect(headers["Access-Control-Allow-Origin"]).toBe("https://ddx.care");
    });

    test("does not set ACAO for non-matching origin", () => {
      const headers = buildCorsHeaders(
        "https://ddx.care",
        "*",
        "https://evil.example.com",
      );
      expect(headers["Access-Control-Allow-Origin"]).toBeUndefined();
    });

    test("falls back to ALLOWED_ORIGINS when TRUSTED_ORIGINS is empty", () => {
      const headers = buildCorsHeaders("", "*", "https://anything.com");
      expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    });

    test("includes Vary: Origin when TRUSTED_ORIGINS is set", () => {
      const headers = buildCorsHeaders(
        "https://ddx.care",
        "*",
        "https://ddx.care",
      );
      expect(headers["Vary"]).toBe("Origin");
    });

    test("does not include Vary: Origin when using wildcard ALLOWED_ORIGINS", () => {
      const headers = buildCorsHeaders("", "*", "https://anything.com");
      expect(headers["Vary"]).toBeUndefined();
    });
  });

  describe("Diagnose response includes token", () => {
    test("POST /v1/diagnose response includes token field", async () => {
      const res = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "test token",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });
      expect(res.status).toBe(202);
      const body = (await res.json()) as {
        jobId: string;
        status: string;
        token: string;
      };
      expect(body.jobId).toBeDefined();
      expect(body.status).toBe("pending");
      expect(typeof body.token).toBe("string");
    });
  });

  describe("DELETE /v1/diagnose/:jobId", () => {
    test("returns 404 for unknown job", async () => {
      const res = await fetch(
        `${BASE}/v1/diagnose/00000000-0000-4000-a000-000000000002`,
        {
          method: "DELETE",
        },
      );
      expect(res.status).toBe(404);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Job not found");
    });

    test("returns 400 for invalid job ID format", async () => {
      const res = await fetch(`${BASE}/v1/diagnose/nonexistent-id`, {
        method: "DELETE",
      });
      expect(res.status).toBe(400);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("Invalid job ID");
    });

    test("cancels a pending job and returns 200", async () => {
      const createRes = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "cancel test",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });
      const { jobId } = (await createRes.json()) as { jobId: string };

      const delRes = await fetch(`${BASE}/v1/diagnose/${jobId}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);
      const body = (await delRes.json()) as { status: string };
      expect(body.status).toBe("cancelled");

      const statusRes = await fetch(`${BASE}/v1/status/${jobId}`);
      const statusBody = (await statusRes.json()) as {
        status: string;
        error: string;
      };
      expect(statusBody.status).toBe("failed");
      expect(statusBody.error).toContain("Cancelled by user");
    });

    test("returns already_completed for a completed job", async () => {
      const createRes = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "complete test",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });
      const { jobId } = (await createRes.json()) as { jobId: string };

      for (let i = 0; i < 30; i++) {
        await new Promise((r) => setTimeout(r, 1000));
        const s = await fetch(`${BASE}/v1/status/${jobId}`);
        const sb = (await s.json()) as { status: string };
        if (sb.status === "completed") break;
      }

      const delRes = await fetch(`${BASE}/v1/diagnose/${jobId}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);
      const body = (await delRes.json()) as { status: string };
      expect(body.status).toBe("already_completed");
    }, 60_000);
  });
  describe("Rate limit recording after check", () => {
    // Helper: reset rate limiter state before each test in this block so
    // prior test requests don't pollute the window.
    async function resetRateLimiter() {
      const { rateLimiter } = await import("../src/backend/api/routes");
      const savedReset = rateLimiter["hasLoggedReset"];
      rateLimiter["clients"].clear();
      rateLimiter["activeCount"] = 0;
      rateLimiter["hasLoggedReset"] = true;
      return { rateLimiter, savedReset };
    }

    test("malformed JSON DOES increment rate limit counter", async () => {
      const { rateLimiter, savedReset } = await resetRateLimiter();

      await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: "not json",
        headers: { "Content-Type": "application/json" },
      });

      const testIp = "::1";
      const entry = rateLimiter["clients"].get(testIp);
      // The malformed request SHOULD have called rateLimiter.record()
      // (after check() succeeds) so there should be one timestamp.
      expect(entry?.timestamps?.length ?? 0).toBe(1);

      rateLimiter["clients"].clear();
      rateLimiter["activeCount"] = 0;
      rateLimiter["hasLoggedReset"] = savedReset;
    });

    test("schema-validation failure DOES increment rate limit counter", async () => {
      const { rateLimiter, savedReset } = await resetRateLimiter();

      // Valid JSON but missing required fields — fails Zod validation
      await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({ medicalHistory: "test" }),
        headers: { "Content-Type": "application/json" },
      });

      const testIp = "::1";
      const entry = rateLimiter["clients"].get(testIp);
      expect(entry?.timestamps?.length ?? 0).toBe(1);

      rateLimiter["clients"].clear();
      rateLimiter["activeCount"] = 0;
      rateLimiter["hasLoggedReset"] = savedReset;
    });

    test("valid request DOES increment rate limit counter", async () => {
      const { rateLimiter, savedReset } = await resetRateLimiter();

      await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "rate test",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });

      const testIp = "::1";
      const entry = rateLimiter["clients"].get(testIp);
      expect(entry).toBeDefined();
      expect(entry!.timestamps.length).toBe(1);

      rateLimiter["clients"].clear();
      rateLimiter["activeCount"] = 0;
      rateLimiter["hasLoggedReset"] = savedReset;
    });

    test("rapid invalid payloads trigger 429 (bypass is closed)", async () => {
      const { rateLimiter, savedReset } = await resetRateLimiter();

      // Default RATE_LIMIT_MAX_REQUESTS is 10. Send 10 malformed requests
      // (each should consume a rate-limit slot), then the 11th should 429.
      const testIp = "::1";

      // Send 10 malformed requests — all should be 400 but consume slots
      for (let i = 0; i < 10; i++) {
        const res = await fetch(`${BASE}/v1/diagnose`, {
          method: "POST",
          body: "not json",
          headers: { "Content-Type": "application/json" },
        });
        expect(res.status).toBe(400);
      }

      // Verify all 10 were recorded
      const entry = rateLimiter["clients"].get(testIp);
      expect(entry?.timestamps?.length ?? 0).toBe(10);

      // 11th request should be rate-limited (429)
      const limitedRes = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "test",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });
      expect(limitedRes.status).toBe(429);

      rateLimiter["clients"].clear();
      rateLimiter["activeCount"] = 0;
      rateLimiter["hasLoggedReset"] = savedReset;
    });
  });

  describe("REST endpoint token verification logic", () => {
    const TEST_SECRET = "test-secret-key-for-rest-endpoints";

    function generateToken(jobId: string, secret: string): string {
      if (!secret) return "";
      return createHmac("sha256", secret).update(jobId).digest("hex");
    }

    function isTokenValid(
      secret: string,
      jobId: string,
      token: string | null,
    ): boolean {
      if (!secret) return true;
      if (!token) return false;
      const expected = generateToken(jobId, secret);
      if (!expected || expected.length !== token.length) return false;
      return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
    }

    /**
     * Mirrors the decision tree in routes.ts verifyJobToken + handler logic:
     * 1. JOB_ID_RE format check → 400
     * 2. Token verification → 403
     * 3. Job existence → 404
     * 4. Success → 200
     */
    function getResponseStatus(
      jobIdValid: boolean,
      secret: string,
      jobId: string,
      token: string | null,
      jobExists: boolean,
    ): number {
      if (!jobIdValid) return 400;
      if (!isTokenValid(secret, jobId, token)) return 403;
      if (!jobExists) return 404;
      return 200;
    }

    const VALID_UUID = "00000000-0000-4000-a000-000000000000";

    describe("GET /v1/status/:jobId token verification", () => {
      test("valid token returns 200", () => {
        const token = generateToken(VALID_UUID, TEST_SECRET);
        expect(
          getResponseStatus(true, TEST_SECRET, VALID_UUID, token, true),
        ).toBe(200);
      });

      test("missing token returns 403", () => {
        expect(
          getResponseStatus(true, TEST_SECRET, VALID_UUID, null, true),
        ).toBe(403);
      });

      test("invalid token returns 403", () => {
        expect(
          getResponseStatus(true, TEST_SECRET, VALID_UUID, "invalid", true),
        ).toBe(403);
      });

      test("token verified before existence — unknown job returns 403 not 404", () => {
        expect(
          getResponseStatus(true, TEST_SECRET, VALID_UUID, "invalid", false),
        ).toBe(403);
      });

      test("token from different jobId is rejected", () => {
        const otherToken = generateToken(
          "11111111-1111-4111-a111-111111111111",
          TEST_SECRET,
        );
        expect(
          getResponseStatus(true, TEST_SECRET, VALID_UUID, otherToken, true),
        ).toBe(403);
      });
    });

    describe("DELETE /v1/diagnose/:jobId token verification", () => {
      test("valid token allows cancellation (proceeds to 200)", () => {
        const token = generateToken(VALID_UUID, TEST_SECRET);
        expect(
          getResponseStatus(true, TEST_SECRET, VALID_UUID, token, true),
        ).toBe(200);
      });

      test("missing token returns 403", () => {
        expect(
          getResponseStatus(true, TEST_SECRET, VALID_UUID, null, true),
        ).toBe(403);
      });

      test("invalid token returns 403", () => {
        expect(
          getResponseStatus(true, TEST_SECRET, VALID_UUID, "bad-token", true),
        ).toBe(403);
      });
    });

    describe("Dev mode (empty WS_TOKEN_SECRET)", () => {
      test("allows access without token", () => {
        expect(getResponseStatus(true, "", VALID_UUID, null, true)).toBe(200);
      });

      test("allows access with any token", () => {
        expect(getResponseStatus(true, "", VALID_UUID, "anything", true)).toBe(
          200,
        );
      });

      test("unknown job returns 404 not 403", () => {
        expect(getResponseStatus(true, "", VALID_UUID, null, false)).toBe(404);
      });
    });

    describe("Format check takes precedence", () => {
      test("malformed job ID returns 400 regardless of token or secret", () => {
        expect(getResponseStatus(false, TEST_SECRET, "bad", null, false)).toBe(
          400,
        );
        expect(
          getResponseStatus(false, TEST_SECRET, "bad", "valid", false),
        ).toBe(400);
        expect(getResponseStatus(false, "", "bad", null, false)).toBe(400);
      });
    });
  });

  describe("Dev mode REST endpoints (no WS_TOKEN_SECRET)", () => {
    test("GET /v1/status/:jobId works without token param", async () => {
      const createRes = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "dev mode status test",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });
      const { jobId } = (await createRes.json()) as { jobId: string };

      const statusRes = await fetch(`${BASE}/v1/status/${jobId}`);
      expect(statusRes.status).toBe(200);
    });

    test("GET /v1/status/:jobId ignores token param in dev mode", async () => {
      const res = await fetch(
        `${BASE}/v1/status/00000000-0000-4000-a000-000000000000?token=anything`,
      );
      // 404 (not found), NOT 403 — token is not checked in dev mode
      expect(res.status).toBe(404);
    });

    test("DELETE /v1/diagnose/:jobId works without token in dev mode", async () => {
      const createRes = await fetch(`${BASE}/v1/diagnose`, {
        method: "POST",
        body: JSON.stringify({
          medicalHistory: "dev mode delete test",
          conversationTranscript: "test",
          labResults: "test",
        }),
        headers: { "Content-Type": "application/json" },
      });
      const { jobId } = (await createRes.json()) as { jobId: string };

      const delRes = await fetch(`${BASE}/v1/diagnose/${jobId}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(200);
      const body = (await delRes.json()) as { status: string };
      expect(body.status).toBe("cancelled");
    });
  });

  afterAll(() => {
    if (_savedMockLlm !== undefined) {
      process.env.MOCK_LLM = _savedMockLlm;
    } else {
      delete process.env.MOCK_LLM;
    }
    if (_savedPort !== undefined) {
      process.env.PORT = _savedPort;
    } else {
      delete process.env.PORT;
    }
  });
});
