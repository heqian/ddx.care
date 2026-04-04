import { test, expect, describe, beforeAll, afterAll } from "bun:test";
import { mastra } from "../src/mastra/index";
import { agentList } from "../src/mastra/agents/index";

// These tests require a running server. Run `bun --hot index.ts` first.
const BASE = process.env.API_BASE ?? "http://localhost:3000";

describe("API Endpoints", () => {
  test("GET /v1/agents returns agent list", async () => {
    const res = await fetch(`${BASE}/v1/agents`);
    expect(res.ok).toBe(true);

    const body = await res.json();
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
    const body = await res.json();
    expect(body.error).toContain("Missing required fields");
  });

  test("GET /v1/status/:jobId returns 404 for unknown job", async () => {
    const res = await fetch(`${BASE}/v1/status/nonexistent-id`);
    expect(res.status).toBe(404);
  });

  test("POST /v1/diagnose creates a job and eventually completes", async () => {
    const startRes = await fetch(`${BASE}/v1/diagnose`, {
      method: "POST",
      body: JSON.stringify({
        medicalHistory: "Patient is a 45-year-old male with a history of hypertension.",
        conversationTranscript: "Patient: I have had a severe headache for 3 days. Doctor: Any vision changes? Patient: Yes, blurred vision.",
        labResults: "BP: 180/110. HR: 90."
      }),
      headers: { "Content-Type": "application/json" },
    });

    expect(startRes.status).toBe(202);
    const startBody = await startRes.json();
    expect(startBody.jobId).toBeDefined();
    expect(startBody.status).toBe("pending");

    const jobId = startBody.jobId;
    let jobStatus = "pending";
    let finalResult: any = null;
    
    // Poll up to 60 times, 5 seconds apart (5 minutes total)
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 5000));
      const statusRes = await fetch(`${BASE}/v1/status/${jobId}`);
      expect(statusRes.status).toBe(200);
      
      const statusBody = await statusRes.json();
      jobStatus = statusBody.status;
      
      if (jobStatus !== "pending") {
        finalResult = statusBody;
        break;
      }
    }

    if (!finalResult) {
      throw new Error("Job timed out or finalResult is null");
    }

    expect(jobStatus).toBe("completed");
    expect(finalResult.result).toBeDefined();
    
    // Check if there was an internal workflow error
    if (finalResult.result.status === "failed") {
      throw new Error(`Workflow failed: ${JSON.stringify(finalResult.result.error)}`);
    }
    
    expect(finalResult.result.status).toBe("success");
  }, 300000); // 5 minutes timeout for this test
});
