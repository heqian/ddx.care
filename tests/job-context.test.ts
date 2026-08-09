import { beforeEach, describe, expect, test } from "bun:test";
import {
  jobContextReducer,
  type JobContexts,
} from "../src/frontend/job-context";
import {
  clearJobCredentials,
  clearSensitiveSessionData,
  getJobCredential,
  JOB_CREDENTIALS_STORAGE_KEY,
  JOB_CREDENTIAL_TTL_MS,
  removeExpiredJobCredentials,
  removeJobCredential,
  storeJobCredential,
} from "../src/frontend/job-credentials";

class MemoryStorage {
  private values = new Map<string, string>();

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  clear() {
    this.values.clear();
  }
}

const storage = new MemoryStorage();
Object.assign(globalThis, { sessionStorage: storage });

beforeEach(() => storage.clear());

describe("jobContextReducer", () => {
  test("keeps state isolated for multiple jobs", () => {
    let state: JobContexts = {};
    state = jobContextReducer(state, {
      type: "register",
      jobId: "job-a",
      token: "token-a",
      expiresAt: 100,
    });
    state = jobContextReducer(state, {
      type: "register",
      jobId: "job-b",
      token: "token-b",
      expiresAt: 200,
    });

    expect(state["job-a"].token).toBe("token-a");
    expect(state["job-b"].token).toBe("token-b");
    expect(state["job-a"].status?.jobId).toBe("job-a");
    expect(state["job-b"].status?.jobId).toBe("job-b");
  });

  test("rejects stale generations, mismatched IDs, and terminal regressions", () => {
    let state = jobContextReducer(
      {},
      {
        type: "register" as const,
        jobId: "job-a",
        token: "token-a",
        expiresAt: 100,
      },
    );
    state = jobContextReducer(state, {
      type: "streamStarted",
      jobId: "job-a",
    });
    state = jobContextReducer(state, {
      type: "statusReceived",
      jobId: "job-a",
      generation: 1,
      status: { jobId: "job-a", status: "completed" },
    });

    const completed = state;
    state = jobContextReducer(state, {
      type: "statusReceived",
      jobId: "job-a",
      generation: 1,
      status: { jobId: "job-a", status: "pending" },
    });
    state = jobContextReducer(state, {
      type: "statusReceived",
      jobId: "job-a",
      generation: 0,
      status: { jobId: "job-a", status: "failed" },
    });
    state = jobContextReducer(state, {
      type: "statusReceived",
      jobId: "job-a",
      generation: 1,
      status: { jobId: "job-b", status: "failed" },
    });

    expect(state).toBe(completed);
    expect(state["job-a"].status?.status).toBe("completed");
  });
});

describe("job credential store", () => {
  test("stores only versioned recovery credentials for multiple jobs", () => {
    storeJobCredential("job-a", "token-a", 1_000);
    storeJobCredential("job-b", "token-b", 2_000);

    expect(getJobCredential("job-a", 3_000)).toEqual({
      status: "available",
      credential: {
        jobId: "job-a",
        token: "token-a",
        expiresAt: 1_000 + JOB_CREDENTIAL_TTL_MS,
      },
    });
    const raw = sessionStorage.getItem(JOB_CREDENTIALS_STORAGE_KEY) ?? "";
    expect(raw).not.toContain("medicalHistory");
    expect(raw).not.toContain("result");
  });

  test("removes cancelled, reset, expired, and malformed credentials", () => {
    storeJobCredential("cancelled", "cancel-token", 1_000);
    removeJobCredential("cancelled");
    expect(getJobCredential("cancelled", 1_001).status).toBe("missing");

    storeJobCredential("expired", "expired-token", 1_000);
    removeExpiredJobCredentials(1_000 + JOB_CREDENTIAL_TTL_MS);
    expect(getJobCredential("expired").status).toBe("missing");

    storeJobCredential("reset", "reset-token", Date.now());
    clearJobCredentials();
    expect(sessionStorage.getItem(JOB_CREDENTIALS_STORAGE_KEY)).toBeNull();

    sessionStorage.setItem(JOB_CREDENTIALS_STORAGE_KEY, "{not-json");
    expect(getJobCredential("anything").status).toBe("missing");
    expect(sessionStorage.getItem(JOB_CREDENTIALS_STORAGE_KEY)).toBeNull();
  });

  test("reports an expired route credential before removing it", () => {
    storeJobCredential("job-a", "token-a", 1_000);

    expect(getJobCredential("job-a", 1_000 + JOB_CREDENTIAL_TTL_MS)).toEqual({
      status: "expired",
    });
    expect(getJobCredential("job-a").status).toBe("missing");
  });

  test("purges credentials and draft data for reset or inactivity", () => {
    storeJobCredential("job-a", "token-a", Date.now());
    sessionStorage.setItem("ddx_draft", "patient data");

    clearSensitiveSessionData();

    expect(sessionStorage.getItem(JOB_CREDENTIALS_STORAGE_KEY)).toBeNull();
    expect(sessionStorage.getItem("ddx_draft")).toBeNull();
  });
});
