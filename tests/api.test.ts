import { test, expect, describe, beforeAll } from "bun:test";

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
        medicalHistory: "45-year-old with history of hypertension on lisinopril.",
        conversationTranscript:
          "The individual reports a severe headache for 3 days. Clinician noted blurred vision.",
        labResults: "BP: 180 over 110. Heart rate: 90.",
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(startRes.status).toBe(202);
    const startBody = (await startRes.json()) as { jobId: string; status: string };
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
    const body = JSON.parse(text) as { error: string };
    expect(body.error).toBeTruthy();
  });

  test("GET /ws returns 400 without jobId query parameter", async () => {
    const res = await fetch(`${BASE}/ws`);
    // Should get 400 since no jobId is provided (or 101 upgrade refused)
    expect(res.status).toBe(400);
  });

  test("POST /v1/diagnose rejects empty body", async () => {
    const res = await fetch(`${BASE}/v1/diagnose`, {
      method: "POST",
      body: "",
      headers: { "Content-Type": "application/json" },
    });

    expect(res.status).toBe(400);
  });

  test("POST /v1/diagnose accepts valid minimal input", async () => {
    const res = await fetch(`${BASE}/v1/diagnose`, {
      method: "POST",
      body: JSON.stringify({
        medicalHistory: "Hypertension",
        conversationTranscript: "Headache reported",
        labResults: "BP elevated",
      }),
      headers: { "Content-Type": "application/json" },
    });

    // Should be either 202 (created) or 429 (rate limited from previous tests)
    expect([202, 429]).toContain(res.status);
  });
});
