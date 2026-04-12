import { test, expect, describe, beforeEach } from "bun:test";
import { JobStore, type JobEntry } from "../src/backend/progress-store";

let store: JobStore;

beforeEach(() => {
  // Use in-memory SQLite so tests are isolated and fast
  store = new JobStore(":memory:");
});

describe("JobStore — Job Lifecycle", () => {
  test("createJob stores a pending job", () => {
    store.createJob("job-1");
    const job = store.getJob("job-1");

    expect(job).toBeDefined();
    expect(job!.status).toBe("pending");
    expect(job!.progress).toEqual([]);
    expect(job!.result).toBeUndefined();
    expect(job!.error).toBeUndefined();
    expect(job!.createdAt).toBeGreaterThan(0);
  });

  test("getJob returns undefined for nonexistent job", () => {
    expect(store.getJob("nope")).toBeUndefined();
  });

  test("complete sets status and result", () => {
    store.createJob("job-2");
    const result = { report: { diagnoses: [] } };
    store.complete("job-2", result);

    const job = store.getJob("job-2");
    expect(job!.status).toBe("completed");
    expect(job!.result).toEqual(result);
    expect(job!.error).toBeUndefined();
  });

  test("fail sets status and error", () => {
    store.createJob("job-3");
    store.fail("job-3", "Something broke");

    const job = store.getJob("job-3");
    expect(job!.status).toBe("failed");
    expect(job!.error).toBe("Something broke");
    expect(job!.result).toBeUndefined();
  });

  test("complete with complex nested result", () => {
    store.createJob("job-4");
    const result = {
      report: {
        chiefComplaint: "Headache",
        diagnoses: [
          { name: "Migraine", confidence: 80, nested: { deep: true } },
        ],
      },
    };
    store.complete("job-4", result);

    const job = store.getJob("job-4");
    expect(job!.result).toEqual(result);
  });
});

describe("JobStore — Progress Events", () => {
  test("emitMessage appends a progress event", () => {
    store.createJob("job-p1");
    store.emitMessage("job-p1", "Starting analysis...");

    const job = store.getJob("job-p1");
    expect(job!.progress).toHaveLength(1);
    expect(job!.progress[0].message).toBe("Starting analysis...");
    expect(job!.progress[0].time).toBeTruthy();
    // Verify ISO timestamp
    expect(new Date(job!.progress[0].time).getTime()).not.toBeNaN();
  });

  test("multiple emitMessage calls append in order", () => {
    store.createJob("job-p2");
    store.emitMessage("job-p2", "Step 1");
    store.emitMessage("job-p2", "Step 2");
    store.emitMessage("job-p2", "Step 3");

    const job = store.getJob("job-p2");
    expect(job!.progress).toHaveLength(3);
    expect(job!.progress[0].message).toBe("Step 1");
    expect(job!.progress[1].message).toBe("Step 2");
    expect(job!.progress[2].message).toBe("Step 3");
  });

  test("progress persists after complete", () => {
    store.createJob("job-p3");
    store.emitMessage("job-p3", "Working...");
    store.complete("job-p3", { done: true });

    const job = store.getJob("job-p3");
    expect(job!.status).toBe("completed");
    expect(job!.progress).toHaveLength(1);
    expect(job!.progress[0].message).toBe("Working...");
  });
});

describe("JobStore — Pub/Sub", () => {
  test("subscribe receives progress events", () => {
    store.createJob("job-s1");
    const received: unknown[] = [];

    store.subscribe("job-s1", (data) => {
      received.push(data);
    });

    store.emitMessage("job-s1", "Hello");

    expect(received).toHaveLength(1);
    expect((received[0] as any).type).toBe("progress");
    expect((received[0] as any).jobId).toBe("job-s1");
    expect((received[0] as any).event.message).toBe("Hello");
  });

  test("subscribe receives completion events", () => {
    store.createJob("job-s2");
    const received: unknown[] = [];

    store.subscribe("job-s2", (data) => {
      received.push(data);
    });

    store.complete("job-s2", { result: "done" });

    expect(received).toHaveLength(1);
    expect((received[0] as any).type).toBe("completed");
    expect((received[0] as any).result).toEqual({ result: "done" });
  });

  test("subscribe receives failure events", () => {
    store.createJob("job-s3");
    const received: unknown[] = [];

    store.subscribe("job-s3", (data) => {
      received.push(data);
    });

    store.fail("job-s3", "timeout");

    expect(received).toHaveLength(1);
    expect((received[0] as any).type).toBe("failed");
    expect((received[0] as any).error).toBe("timeout");
  });

  test("unsubscribe stops event delivery", () => {
    store.createJob("job-s4");
    const received: unknown[] = [];

    const unsub = store.subscribe("job-s4", (data) => {
      received.push(data);
    });

    store.emitMessage("job-s4", "Before unsub");
    unsub();
    store.emitMessage("job-s4", "After unsub");

    expect(received).toHaveLength(1);
    expect((received[0] as any).event.message).toBe("Before unsub");
  });

  test("events for one job do not leak to another", () => {
    store.createJob("job-A");
    store.createJob("job-B");
    const receivedA: unknown[] = [];
    const receivedB: unknown[] = [];

    store.subscribe("job-A", (data) => receivedA.push(data));
    store.subscribe("job-B", (data) => receivedB.push(data));

    store.emitMessage("job-A", "Only for A");

    expect(receivedA).toHaveLength(1);
    expect(receivedB).toHaveLength(0);
  });
});

describe("JobStore — Cleanup", () => {
  test("cleanupExpired removes old jobs", () => {
    store.createJob("old-job");
    // Manually update createdAt to be very old
    const db = (store as any).db;
    db.exec(`UPDATE jobs SET createdAt = ${Date.now() - 100_000} WHERE id = 'old-job'`);

    store.createJob("new-job");

    store.cleanupExpired(50_000); // TTL = 50 seconds

    expect(store.getJob("old-job")).toBeUndefined();
    expect(store.getJob("new-job")).toBeDefined();
  });

  test("cleanupExpired keeps recent jobs", () => {
    store.createJob("recent");
    store.cleanupExpired(60_000);

    expect(store.getJob("recent")).toBeDefined();
  });
});
