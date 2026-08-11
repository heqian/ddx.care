import { test, expect, describe } from "bun:test";
import { createWebSocketHandlers } from "../src/backend/composition";
import type { WsData } from "../src/backend/api/websocket";
import { JobStore } from "../src/backend/progress-store";
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
  "REPORT_VALIDATION_FAILED",
);

/**
 * Each test builds a fresh in-memory JobStore and constructs production
 * WebSocket handlers via the composition-seam factory. No singleton imports,
 * no `DELETE FROM jobs` cleanup — the store is garbage-collected per test.
 */
function makeHandlers() {
  const jobStore = new JobStore(":memory:");
  const timers = {
    setInterval,
    setTimeout,
    clearInterval,
    clearTimeout,
  };
  const handlers = createWebSocketHandlers({ jobStore, timers });
  return { handlers, jobStore };
}

// Minimal mock of Bun's ServerWebSocket for unit testing
class MockWebSocket {
  data: WsData;
  messages: string[] = [];
  closed = false;
  closeCode?: number;
  closeReason?: string;
  pingsSent = 0;
  readyState = 1; // WebSocket.OPEN

  constructor(data: WsData) {
    this.data = data;
  }

  send(message: string | Uint8Array) {
    if (typeof message === "string") {
      this.messages.push(message);
    }
  }

  close(code?: number, reason?: string) {
    this.closed = true;
    this.closeCode = code;
    this.closeReason = reason;
    this.readyState = 3; // WebSocket.CLOSED
  }

  ping() {
    this.pingsSent++;
  }
}

describe("WebSocket handler — open", () => {
  test("replays history on connect", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-1");
    jobStore.emitMessage("job-1", "Step 1");
    jobStore.emitMessage("job-1", "Step 2");

    const ws = new MockWebSocket({ jobId: "job-1" });
    handlers.open(ws as any);

    expect(ws.messages).toHaveLength(2);
    const first = JSON.parse(ws.messages[0]);
    expect(first.type).toBe("progress");
    expect(first.event.message).toBe("Step 1");
    const second = JSON.parse(ws.messages[1]);
    expect(second.event.message).toBe("Step 2");
  });

  test("closes immediately if job not found", () => {
    const { handlers } = makeHandlers();
    const ws = new MockWebSocket({ jobId: "missing" });
    handlers.open(ws as any);

    expect(ws.closed).toBe(true);
    expect(ws.messages).toHaveLength(1);
    const msg = JSON.parse(ws.messages[0]);
    expect(msg.type).toBe("failed");
    expect(msg.error).toBe("Job not found");
  });

  test.each([
    ["available", availableOutcome],
    ["generation_failed", generationFailedOutcome],
  ] as const)("sends the exact %s payload for a completed job", (_, outcome) => {
    const { handlers, jobStore } = makeHandlers();
    const jobId = `job-completed-${outcome.status}`;
    jobStore.createJob(jobId);
    jobStore.complete(jobId, outcome);

    const ws = new MockWebSocket({ jobId });
    handlers.open(ws as any);

    expect(ws.closed).toBe(true);
    expect(ws.messages).toHaveLength(1);
    expect(JSON.parse(ws.messages[0])).toEqual({
      type: "completed",
      jobId,
      result: outcome,
    });
  });

  test("closes after sending error for failed job", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-3");
    jobStore.fail("job-3", "Something broke");

    const ws = new MockWebSocket({ jobId: "job-3" });
    handlers.open(ws as any);

    expect(ws.closed).toBe(true);
    expect(ws.messages).toHaveLength(1);
    const msg = JSON.parse(ws.messages[0]);
    expect(msg.type).toBe("failed");
    expect(msg.error).toBe("Something broke");
  });

  test("subscribes to live events for pending job", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-4");

    const ws = new MockWebSocket({ jobId: "job-4" });
    handlers.open(ws as any);

    expect(ws.closed).toBe(false);
    expect(ws.messages).toHaveLength(0);

    jobStore.emitMessage("job-4", "Live update");
    expect(ws.messages).toHaveLength(1);
    const msg = JSON.parse(ws.messages[0]);
    expect(msg.type).toBe("progress");
    expect(msg.event.message).toBe("Live update");
  });

  test("closes socket when completion event arrives", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-5");

    const ws = new MockWebSocket({ jobId: "job-5" });
    handlers.open(ws as any);

    jobStore.complete("job-5", availableOutcome);
    expect(ws.closed).toBe(true);
    expect(JSON.parse(ws.messages[0])).toEqual({
      type: "completed",
      jobId: "job-5",
      result: availableOutcome,
    });
  });

  test("closes socket when failure event arrives", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-6");

    const ws = new MockWebSocket({ jobId: "job-6" });
    handlers.open(ws as any);

    jobStore.fail("job-6", "timeout");
    expect(ws.closed).toBe(true);
  });
});

describe("WebSocket handler — close", () => {
  test("unsubscribes and clears timers on close", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-7");

    const ws = new MockWebSocket({ jobId: "job-7" });
    handlers.open(ws as any);

    // Emit while open
    jobStore.emitMessage("job-7", "Before close");
    expect(ws.messages).toHaveLength(1);

    handlers.close(ws as any);

    // After close, events should not be received
    jobStore.emitMessage("job-7", "After close");
    expect(ws.messages).toHaveLength(1);
  });
});

describe("WebSocket handler — heartbeat", () => {
  test("starts ping timer on open for pending jobs", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-8");

    const ws = new MockWebSocket({ jobId: "job-8" });
    handlers.open(ws as any);

    expect(ws.data.pingTimer).toBeDefined();
  });

  test("does not start ping timer when job is already completed", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-9");
    jobStore.complete("job-9", generationFailedOutcome);

    const ws = new MockWebSocket({ jobId: "job-9" });
    handlers.open(ws as any);

    expect(ws.data.pingTimer).toBeUndefined();
  });

  test("clears ping and pong timers on close", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-10");

    const ws = new MockWebSocket({ jobId: "job-10" });
    handlers.open(ws as any);

    expect(ws.data.pingTimer).toBeDefined();
    handlers.close(ws as any);
    expect(ws.data.pingTimer).toBeUndefined();
    expect(ws.data.pongTimer).toBeUndefined();
  });

  test("pong clears the pong timeout", () => {
    const { handlers, jobStore } = makeHandlers();
    jobStore.createJob("job-11");

    const ws = new MockWebSocket({ jobId: "job-11" });
    handlers.open(ws as any);

    // Manually set a pong timer to simulate an in-flight ping
    ws.data.pongTimer = setTimeout(() => {}, 10000);
    expect(ws.data.pongTimer).toBeDefined();

    handlers.pong(ws as any);
    expect(ws.data.pongTimer).toBeUndefined();
  });
});

describe("WebSocket handler — injected store isolation", () => {
  test("two handler instances use independent stores with no singleton mutation", () => {
    const a = makeHandlers();
    const b = makeHandlers();
    a.jobStore.createJob("iso-a");
    b.jobStore.createJob("iso-b");

    const wsA = new MockWebSocket({ jobId: "iso-a" });
    const wsB = new MockWebSocket({ jobId: "iso-b" });
    a.handlers.open(wsA as any);
    b.handlers.open(wsB as any);

    // Cross-job access must fail — the stores are independent.
    const wsAcross = new MockWebSocket({ jobId: "iso-a" });
    b.handlers.open(wsAcross as any);
    expect(wsAcross.closed).toBe(true);
    expect(JSON.parse(wsAcross.messages[0]).error).toBe("Job not found");
  });
});
