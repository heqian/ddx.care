import { test, expect, describe, vi, afterEach } from "bun:test";
import {
  submitDiagnosis,
  getJobStatus,
  getAgents,
  cancelDiagnosis,
} from "../src/frontend/api/client";

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
      }),
    }) as any;

    const result = await getJobStatus("job-1");

    expect(result.jobId).toBe("job-1");
    expect(result.status).toBe("completed");

    const fetchCall = (globalThis.fetch as any).mock.calls[0];
    expect(fetchCall[0]).toBe("/v1/status/job-1");
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