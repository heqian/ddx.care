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
});
