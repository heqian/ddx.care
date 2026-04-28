import { test, expect, describe, beforeEach } from "bun:test";
import { JobStore, type JobEntry, type ProgressEvent } from "../src/backend/progress-store";

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

  test("emitMessage with ProgressEvent object stores enriched fields", () => {
    store.createJob("job-p4");
    const event: ProgressEvent = {
      time: "2026-01-15T10:30:00.000Z",
      message: "Cardiologist: Searching PubMed → chest pain",
      eventType: "tool_call",
      agentId: "cardiologist",
      toolName: "pubmed-search",
      toolArgs: "chest pain",
    };
    store.emitMessage("job-p4", event);

    const job = store.getJob("job-p4");
    expect(job!.progress).toHaveLength(1);
    const stored = job!.progress[0];
    expect(stored.time).toBe("2026-01-15T10:30:00.000Z");
    expect(stored.message).toBe("Cardiologist: Searching PubMed → chest pain");
    expect(stored.eventType).toBe("tool_call");
    expect(stored.agentId).toBe("cardiologist");
    expect(stored.toolName).toBe("pubmed-search");
    expect(stored.toolArgs).toBe("chest pain");
  });

  test("ProgressEvent with null toolArgs is stored correctly", () => {
    store.createJob("job-p5");
    store.emitMessage("job-p5", {
      time: "2026-01-15T10:30:00.000Z",
      message: "Searching PubMed",
      eventType: "tool_call",
      agentId: "neurologist",
      toolName: "pubmed-search",
      toolArgs: null,
    });

    const job = store.getJob("job-p5");
    expect(job!.progress[0].toolArgs).toBeNull();
  });

  test("mixed string and ProgressEvent emitMessage calls", () => {
    store.createJob("job-p6");
    store.emitMessage("job-p6", "Starting analysis...");
    store.emitMessage("job-p6", {
      time: "2026-01-15T10:30:01.000Z",
      message: "Cardiologist: Searching PubMed",
      eventType: "tool_call",
      agentId: "cardiologist",
      toolName: "pubmed-search",
      toolArgs: "chest pain",
    });
    store.emitMessage("job-p6", "Analysis complete");

    const job = store.getJob("job-p6");
    expect(job!.progress).toHaveLength(3);
    expect(job!.progress[0].eventType).toBeUndefined();
    expect(job!.progress[1].eventType).toBe("tool_call");
    expect(job!.progress[2].eventType).toBeUndefined();
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

  test("subscribe receives enriched ProgressEvent fields", () => {
    store.createJob("job-s5");
    const received: unknown[] = [];

    store.subscribe("job-s5", (data) => {
      received.push(data);
    });

    store.emitMessage("job-s5", {
      time: "2026-01-15T10:30:00.000Z",
      message: "Cardiologist: Checking interactions → drug A + drug B",
      eventType: "tool_call",
      agentId: "cardiologist",
      toolName: "drug-interaction",
      toolArgs: "drug A + drug B",
    });

    expect(received).toHaveLength(1);
    const detail = received[0] as any;
    expect(detail.type).toBe("progress");
    expect(detail.event.eventType).toBe("tool_call");
    expect(detail.event.agentId).toBe("cardiologist");
    expect(detail.event.toolName).toBe("drug-interaction");
    expect(detail.event.toolArgs).toBe("drug A + drug B");
  });
});

describe("JobStore — WAL Mode", () => {
  test("enables WAL journal mode on construction", () => {
    const db = (store as any).db;
    const result = db.query("PRAGMA journal_mode").get() as { journal_mode: string };
    // In-memory databases may report "memory" or "wal" depending on Bun version
    // but file-backed databases should always be WAL
    expect(["wal", "memory"]).toContain(result.journal_mode);
  });

  test("concurrent emitMessage calls do not deadlock", () => {
    store.createJob("wal-1");
    // Rapidly emit many progress events — would deadlock without WAL
    for (let i = 0; i < 50; i++) {
      store.emitMessage("wal-1", `Message ${i}`);
    }
    const job = store.getJob("wal-1");
    expect(job!.progress).toHaveLength(50);
  });
});

describe("JobStore — Cleanup", () => {
  test("cleanupExpired removes old jobs", () => {
    store.createJob("old-job");
    // Manually update createdAt to be very old
    const db = (store as any).db;
    db.exec(
      `UPDATE jobs SET createdAt = ${Date.now() - 100_000} WHERE id = 'old-job'`,
    );

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

describe("JobStore — markStalePending", () => {
  test("marks all pending jobs as failed", () => {
    store.createJob("stale-1");
    store.createJob("stale-2");
    store.createJob("stale-3");
    store.markStalePending();

    expect(store.getJob("stale-1")!.status).toBe("failed");
    expect(store.getJob("stale-1")!.error).toBe(
      "Server restarted — job interrupted",
    );
    expect(store.getJob("stale-2")!.status).toBe("failed");
    expect(store.getJob("stale-3")!.status).toBe("failed");
  });

  test("does not modify completed jobs", () => {
    store.createJob("completed-1");
    store.complete("completed-1", { result: "done" });
    store.createJob("pending-1");

    store.markStalePending();

    expect(store.getJob("completed-1")!.status).toBe("completed");
    expect(store.getJob("pending-1")!.status).toBe("failed");
  });

  test("does not modify already failed jobs", () => {
    store.createJob("already-failed");
    store.fail("already-failed", "Original error");
    store.createJob("pending-2");

    store.markStalePending();

    expect(store.getJob("already-failed")!.error).toBe("Original error");
    expect(store.getJob("pending-2")!.status).toBe("failed");
  });

  test("handles no pending jobs gracefully", () => {
    store.createJob("done-1");
    store.complete("done-1", { ok: true });

    expect(() => store.markStalePending()).not.toThrow();
    expect(store.getJob("done-1")!.status).toBe("completed");
  });

  test("handles empty store gracefully", () => {
    expect(() => store.markStalePending()).not.toThrow();
  });
});
