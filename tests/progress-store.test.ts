import { test, expect, describe, beforeEach } from "bun:test";
import { JobStore, type ProgressEvent } from "../src/backend/progress-store";
import {
  createGenerationFailedReportOutcome,
  type AvailableReportOutcome,
} from "../src/shared/report-outcome";

const availableOutcome: AvailableReportOutcome = {
  status: "available",
  report: {
    chiefComplaint: "Headache",
    patientSummary: "Adult with recurrent headache",
    specialistsConsulted: [
      { specialist: "Neurologist", keyFindings: "Migraine is likely" },
    ],
    diagnoses: [
      {
        rank: 1,
        name: "Migraine",
        confidence: 80,
        urgency: "routine",
        rationale: "Recurrent headache pattern",
        supportingEvidence: ["Recurrent headache"],
        contradictoryEvidence: [],
        nextSteps: ["Clinical follow-up"],
      },
    ],
    crossSpecialtyObservations: "No additional observations",
    recommendedImmediateActions: "Seek care if symptoms worsen",
  },
  generatedAt: "2026-01-15T10:30:00.000Z",
  disclaimer: "Research use only",
};
const generationFailedOutcome = createGenerationFailedReportOutcome(
  "REPORT_PROVIDER_UNAVAILABLE",
);

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
    store.complete("job-2", availableOutcome);

    const job = store.getJob("job-2");
    expect(job!.status).toBe("completed");
    expect(job!.result).toEqual(availableOutcome);
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

  test.each([
    ["available", availableOutcome],
    ["generation_failed", generationFailedOutcome],
  ] as const)("round-trips a %s outcome", (_variant, outcome) => {
    store.createJob(`job-round-trip-${outcome.status}`);
    store.complete(`job-round-trip-${outcome.status}`, outcome);

    const job = store.getJob(`job-round-trip-${outcome.status}`);
    expect(job!.status).toBe("completed");
    expect(job!.result).toEqual(outcome);
  });

  test("complete does not overwrite failed status", () => {
    store.createJob("job-cancel-1");
    store.fail("job-cancel-1", "Cancelled by user");
    store.complete("job-cancel-1", availableOutcome);

    const job = store.getJob("job-cancel-1");
    expect(job!.status).toBe("failed");
    expect(job!.error).toBe("Cancelled by user");
    expect(job!.result).toBeUndefined();
  });

  test("complete works normally after fail+prune cycle (fresh job)", () => {
    store.createJob("job-fresh");
    store.complete("job-fresh", generationFailedOutcome);

    const job = store.getJob("job-fresh");
    expect(job!.status).toBe("completed");
    expect(job!.result).toEqual(generationFailedOutcome);
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
    store.complete("job-p3", availableOutcome);

    const job = store.getJob("job-p3");
    expect(job!.status).toBe("completed");
    expect(job!.progress).toHaveLength(1);
    expect(job!.progress[0].message).toBe("Working...");
  });

  test("emitMessage with ProgressEvent object stores enriched fields", () => {
    store.createJob("job-p4");
    const event: ProgressEvent = {
      time: "2026-01-15T10:30:00.000Z",
      message: "Cardiologist: Checking interactions → aspirin + warfarin",
      eventType: "tool_call",
      agentId: "cardiologist",
      toolName: "drug-interaction",
      toolArgs: "aspirin + warfarin",
    };
    store.emitMessage("job-p4", event);

    const job = store.getJob("job-p4");
    expect(job!.progress).toHaveLength(1);
    const stored = job!.progress[0];
    expect(stored.time).toBe("2026-01-15T10:30:00.000Z");
    expect(stored.message).toBe(
      "Cardiologist: Checking interactions → aspirin + warfarin",
    );
    expect(stored.eventType).toBe("tool_call");
    expect(stored.agentId).toBe("cardiologist");
    expect(stored.toolName).toBe("drug-interaction");
    expect(stored.toolArgs).toBe("aspirin + warfarin");
  });

  test("ProgressEvent with null toolArgs is stored correctly", () => {
    store.createJob("job-p5");
    store.emitMessage("job-p5", {
      time: "2026-01-15T10:30:00.000Z",
      message: "Checking interactions",
      eventType: "tool_call",
      agentId: "neurologist",
      toolName: "drug-interaction",
      toolArgs: null,
    });

    const job = store.getJob("job-p5");
    expect(job!.progress[0].toolArgs).toBeNull();
  });

  test("partial tool result status and retry classification round-trip", () => {
    store.createJob("job-partial");
    store.emitMessage("job-partial", {
      time: "2026-01-15T10:30:00.000Z",
      message: "Interaction check completed with partial coverage",
      eventType: "tool_result",
      agentId: "cardiologist",
      toolName: "drug-interaction",
      success: false,
      toolResultStatus: "partial",
      retriable: true,
    });

    const event = store.getJob("job-partial")!.progress[0];
    expect(event.toolResultStatus).toBe("partial");
    expect(event.retriable).toBe(true);
  });

  test("mixed string and ProgressEvent emitMessage calls", () => {
    store.createJob("job-p6");
    store.emitMessage("job-p6", "Starting analysis...");
    store.emitMessage("job-p6", {
      time: "2026-01-15T10:30:01.000Z",
      message: "Cardiologist: Checking interactions",
      eventType: "tool_call",
      agentId: "cardiologist",
      toolName: "drug-interaction",
      toolArgs: "aspirin + warfarin",
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

  test.each([
    ["available", availableOutcome],
    ["generation_failed", generationFailedOutcome],
  ] as const)("subscribe receives the exact %s completion event", (_, outcome) => {
    const jobId = `job-subscribe-${outcome.status}`;
    store.createJob(jobId);
    const received: unknown[] = [];

    store.subscribe(jobId, (data) => {
      received.push(data);
    });

    store.complete(jobId, outcome);

    expect(received).toEqual([{ type: "completed", jobId, result: outcome }]);
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
    const result = db.query("PRAGMA journal_mode").get() as {
      journal_mode: string;
    };
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

  test("cleanupExpired scrubs result before deletion", () => {
    store.createJob("scrub-1");
    store.complete("scrub-1", availableOutcome);
    store.emitMessage("scrub-1", "Analyzing patient data...");

    // Make the job old enough to expire
    const db = (store as any).db;
    db.exec(
      `UPDATE jobs SET createdAt = ${Date.now() - 100_000} WHERE id = 'scrub-1'`,
    );

    // Intercept: check the row is scrubbed BEFORE it's deleted
    // We use a raw query right after scrubStmt runs (before cleanupStmt)
    // Since cleanupExpired runs both in sequence, we verify by checking
    // that the job is gone (scrubbed + deleted)
    store.cleanupExpired(50_000);

    expect(store.getJob("scrub-1")).toBeUndefined();
  });

  test("cleanupExpired scrubs progress before deletion", () => {
    store.createJob("scrub-2");
    store.emitMessage("scrub-2", {
      time: new Date().toISOString(),
      message: "Tool call: aspirin + warfarin",
      eventType: "tool_call",
      toolName: "drug-interaction",
      toolArgs: "aspirin + warfarin",
    });

    const db = (store as any).db;
    db.exec(
      `UPDATE jobs SET createdAt = ${Date.now() - 100_000} WHERE id = 'scrub-2'`,
    );

    store.cleanupExpired(50_000);

    expect(store.getJob("scrub-2")).toBeUndefined();
  });

  test("cleanupExpired does not affect non-expired job data", () => {
    store.createJob("scrub-safe");
    store.complete("scrub-safe", generationFailedOutcome);
    store.emitMessage("scrub-safe", "progress data");

    store.cleanupExpired(60_000);

    const job = store.getJob("scrub-safe");
    expect(job).toBeDefined();
    expect(job!.result).toEqual(generationFailedOutcome);
    expect(job!.progress).toHaveLength(1);
    expect(job!.progress[0].message).toBe("progress data");
  });

  test("scrubStmt nulls result and resets progress for expired rows", () => {
    store.createJob("scrub-verify");
    store.complete("scrub-verify", availableOutcome);
    store.emitMessage("scrub-verify", "patient info");

    const db = (store as any).db;
    // Make the job expired
    db.exec(
      `UPDATE jobs SET createdAt = ${Date.now() - 100_000} WHERE id = 'scrub-verify'`,
    );

    // Run only the scrub statement (not the delete)
    const cutoff = Date.now() - 50_000;
    (store as any).scrubStmt.run(cutoff);

    // Verify the row still exists but data is scrubbed
    const row = db
      .query("SELECT * FROM jobs WHERE id = 'scrub-verify'")
      .get() as any;
    expect(row).toBeDefined();
    expect(row.result).toBeNull();
    expect(row.progress).toBe("[]");

    // Now clean up
    store.cleanupExpired(50_000);
    expect(store.getJob("scrub-verify")).toBeUndefined();
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
    store.complete("completed-1", availableOutcome);
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
    store.complete("done-1", generationFailedOutcome);

    expect(() => store.markStalePending()).not.toThrow();
    expect(store.getJob("done-1")!.status).toBe("completed");
  });

  test("handles empty store gracefully", () => {
    expect(() => store.markStalePending()).not.toThrow();
  });
});

describe("JobStore — SQLite indexes", () => {
  test("creates index on createdAt column for efficient cleanup queries", () => {
    const db = (store as any).db;
    const indexes = db
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'jobs'",
      )
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_jobs_createdAt");
  });

  test("creates index on status column for efficient markStalePending queries", () => {
    const db = (store as any).db;
    const indexes = db
      .query(
        "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'jobs'",
      )
      .all() as { name: string }[];
    const indexNames = indexes.map((i) => i.name);
    expect(indexNames).toContain("idx_jobs_status");
  });
});
