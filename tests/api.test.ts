import { test, expect, describe, beforeAll, afterAll } from "bun:test";

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

    const body = (await res.json()) as { agents: unknown[] };
    expect(body.agents).toBeInstanceOf(Array);
    expect(body.agents.length).toBeGreaterThan(0);
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
    const res = await fetch(`${BASE}/v1/status/nonexistent-id`);
    expect(res.status).toBe(404);
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
  }, 60_000);

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
    // Should get 413 (payload too large) or 400 (validation failure for field length)
    // Since individual fields are 400k > MAX_INPUT_FIELD_LENGTH (50k), it will hit the
    // zod validation first with 400 if content-length check doesn't fire.
    // The key is that the request is rejected, not accepted.
    expect([400, 413]).toContain(res.status);
  });

  test("POST /v1/diagnose returns 400 for oversized field", async () => {
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
        "GET, POST, OPTIONS",
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
      const res = await fetch(`${BASE}/v1/status/nonexistent-cors-test`);
      expect(res.status).toBe(404);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    });

    test("OPTIONS /v1/diagnose returns preflight response", async () => {
      const res = await fetch(`${BASE}/v1/diagnose`, { method: "OPTIONS" });
      expect(res.status).toBe(204);
      expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
      expect(res.headers.get("Access-Control-Allow-Methods")).toBe(
        "GET, POST, OPTIONS",
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
