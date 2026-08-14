import { test, expect, describe, vi, afterEach } from "bun:test";
import {
  submitDiagnosis,
  getJobStatus,
  getAgents,
  cancelDiagnosis,
} from "../src/frontend/api/client";
import {
  createGenerationFailedReportOutcome,
  type AvailableReportOutcome,
} from "../src/shared/report-outcome";

const availableOutcome: AvailableReportOutcome = {
  status: "available",
  report: {
    chiefComplaint: "Headache",
    patientSummary: "Adult with recurrent headache",
    specialistsConsulted: [],
    diagnoses: [],
    crossSpecialtyObservations: "None",
    recommendedImmediateActions: "Clinical follow-up",
  },
  generatedAt: "2026-01-15T10:30:00.000Z",
  disclaimer: "Research use only",
};
const generationFailedOutcome = createGenerationFailedReportOutcome(
  "REPORT_EMPTY_RESPONSE",
);

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

describe("submitDiagnosis", () => {
  test("sends POST to /v1/diagnose and returns job ID", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: "abc-123", status: "pending" }),
    }) as any;

    const result = await submitDiagnosis({
      medicalHistory: "test history",
      conversationTranscript: "test transcript",
      labResults: "test labs",
    });

    expect(result.jobId).toBe("abc-123");
    expect(result.status).toBe("pending");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("/v1/diagnose");
    expect(fetchCall[1].method).toBe("POST");
    expect(fetchCall[1].headers).toEqual({
      "Content-Type": "application/json",
    });
  });

  test("throws with error message from JSON response on failure", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      text: async () =>
        JSON.stringify({ error: "Validation failed: bad input" }),
    }) as any;

    await expect(
      submitDiagnosis({
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      }),
    ).rejects.toThrow("Validation failed: bad input");
  });

  test("throws with status code when response body is not JSON", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Server Error",
    }) as any;

    await expect(
      submitDiagnosis({
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      }),
    ).rejects.toThrow("Internal Server Error");
  });

  test("throws with status code when response body is empty", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 429,
      text: async () => "",
    }) as any;

    await expect(
      submitDiagnosis({
        medicalHistory: "",
        conversationTranscript: "",
        labResults: "",
      }),
    ).rejects.toThrow("Request failed with status 429");
  });
});

describe("getJobStatus", () => {
  test("fetches status for a job ID", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: "job-1",
        status: "completed",
        progress: [],
        result: availableOutcome,
      }),
    }) as any;

    const result = await getJobStatus("job-1");

    expect(result.jobId).toBe("job-1");
    expect(result.status).toBe("completed");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("/v1/status/job-1");
  });

  test("sends X-Job-Token header when token is provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: "job-1",
        status: "pending",
        progress: [],
      }),
    }) as any;

    await getJobStatus("job-1", "abc123token");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    // Token MUST NOT appear in the URL.
    expect(fetchCall[0]).toBe("/v1/status/job-1");
    expect(fetchCall[0]).not.toContain("token=");
    expect(fetchCall[1].headers["X-Job-Token"]).toBe("abc123token");
  });

  test("does not put the token in the URL even with special characters", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: "job-1",
        status: "pending",
        progress: [],
      }),
    }) as any;

    await getJobStatus("job-1", "token with spaces&special");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("/v1/status/job-1");
    expect(fetchCall[0]).not.toContain("token");
    expect(fetchCall[1].headers["X-Job-Token"]).toBe(
      "token with spaces&special",
    );
  });

  test("does not send X-Job-Token header when token is not provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: "job-1",
        status: "pending",
        progress: [],
      }),
    }) as any;

    await getJobStatus("job-1");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("/v1/status/job-1");
    expect(fetchCall[1].headers["X-Job-Token"] ?? "").toBe("");
  });

  test("forwards an AbortSignal to status requests", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ jobId: "job-1", status: "pending" }),
    }) as any;
    const controller = new AbortController();

    await getJobStatus("job-1", "token", controller.signal);

    expect((globalThis.fetch as any).mock.calls[0][1].signal).toBe(
      controller.signal,
    );
  });

  test.each([
    ["available", availableOutcome],
    ["generation_failed", generationFailedOutcome],
  ] as const)("accepts a completed %s outcome", async (_, outcome) => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: "job-validated",
        status: "completed",
        progress: [],
        result: outcome,
      }),
    }) as any;

    const result = await getJobStatus("job-validated");

    expect(result.result).toEqual(outcome);
  });

  test.each([
    ["malformed", { status: "available", report: {} }],
    ["legacy", availableOutcome.report],
  ] as const)("rejects a %s completed outcome", async (_, outcome) => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        jobId: "job-invalid",
        status: "completed",
        progress: [],
        result: outcome,
      }),
    }) as any;

    await expect(getJobStatus("job-invalid")).rejects.toThrow();
  });

  test("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: async () => JSON.stringify({ error: "Job not found" }),
    }) as any;

    await expect(getJobStatus("nonexistent")).rejects.toThrow("Job not found");
  });
});

describe("getAgents", () => {
  test("fetches agent list", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        agents: [
          { id: "cardiologist", name: "Cardiologist", description: "Heart" },
        ],
      }),
    }) as any;

    const result = await getAgents();

    expect(result.agents).toHaveLength(1);
    expect(result.agents[0].id).toBe("cardiologist");
  });

  test("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Server error",
    }) as any;

    await expect(getAgents()).rejects.toThrow("Server error");
  });
});

describe("cancelDiagnosis", () => {
  test("sends DELETE to /v1/diagnose/:jobId", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "cancelled" }),
    }) as any;

    const result = await cancelDiagnosis("job-1");

    expect(result.status).toBe("cancelled");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("/v1/diagnose/job-1");
    expect(fetchCall[1].method).toBe("DELETE");
  });

  test("sends X-Job-Token header when token is provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "cancelled" }),
    }) as any;

    await cancelDiagnosis("job-1", "secret-token-123");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    // Token MUST NOT appear in the URL.
    expect(fetchCall[0]).toBe("/v1/diagnose/job-1");
    expect(fetchCall[0]).not.toContain("token=");
    expect(fetchCall[1].method).toBe("DELETE");
    expect(fetchCall[1].headers["X-Job-Token"]).toBe("secret-token-123");
  });

  test("does not put the token in the URL even with special characters", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "cancelled" }),
    }) as any;

    await cancelDiagnosis("job-1", "token/special+chars");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("/v1/diagnose/job-1");
    expect(fetchCall[0]).not.toContain("token");
    expect(fetchCall[1].headers["X-Job-Token"]).toBe("token/special+chars");
  });

  test("does not send X-Job-Token header when token is not provided", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status: "cancelled" }),
    }) as any;

    await cancelDiagnosis("job-1");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("/v1/diagnose/job-1");
    expect(fetchCall[1].headers["X-Job-Token"] ?? "").toBe("");
  });

  test("throws on non-OK response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      text: async () => JSON.stringify({ error: "Invalid or missing token" }),
    }) as any;

    await expect(cancelDiagnosis("job-1", "bad")).rejects.toThrow(
      "Invalid or missing token",
    );
  });
});
