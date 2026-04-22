import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { progressStore } from "../src/backend/progress-store";
import { websocketHandlers, type WsData } from "../src/backend/api/websocket";

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

beforeEach(() => {
  // Clear the singleton database before each test
  const db = (progressStore as any).db;
  db.exec("DELETE FROM jobs");
});

afterEach(() => {
  // Clean up any remaining jobs
  const db = (progressStore as any).db;
  db.exec("DELETE FROM jobs");
});

describe("WebSocket handler — open", () => {
  test("replays history on connect", () => {
    progressStore.createJob("job-1");
    progressStore.emitMessage("job-1", "Step 1");
    progressStore.emitMessage("job-1", "Step 2");

    const ws = new MockWebSocket({ jobId: "job-1" });
    websocketHandlers.open(ws as any);

    expect(ws.messages).toHaveLength(2);
    const first = JSON.parse(ws.messages[0]);
    expect(first.type).toBe("progress");
    expect(first.event.message).toBe("Step 1");
    const second = JSON.parse(ws.messages[1]);
    expect(second.event.message).toBe("Step 2");
  });

  test("closes immediately if job not found", () => {
    const ws = new MockWebSocket({ jobId: "missing" });
    websocketHandlers.open(ws as any);

    expect(ws.closed).toBe(true);
    expect(ws.messages).toHaveLength(1);
    const msg = JSON.parse(ws.messages[0]);
    expect(msg.type).toBe("failed");
    expect(msg.error).toBe("Job not found");
  });

  test("closes after sending result for completed job", () => {
    progressStore.createJob("job-2");
    progressStore.complete("job-2", { done: true });

    const ws = new MockWebSocket({ jobId: "job-2" });
    websocketHandlers.open(ws as any);

    expect(ws.closed).toBe(true);
    expect(ws.messages).toHaveLength(1);
    const msg = JSON.parse(ws.messages[0]);
    expect(msg.type).toBe("completed");
  });

  test("closes after sending error for failed job", () => {
    progressStore.createJob("job-3");
    progressStore.fail("job-3", "Something broke");

    const ws = new MockWebSocket({ jobId: "job-3" });
    websocketHandlers.open(ws as any);

    expect(ws.closed).toBe(true);
    expect(ws.messages).toHaveLength(1);
    const msg = JSON.parse(ws.messages[0]);
    expect(msg.type).toBe("failed");
    expect(msg.error).toBe("Something broke");
  });

  test("subscribes to live events for pending job", () => {
    progressStore.createJob("job-4");

    const ws = new MockWebSocket({ jobId: "job-4" });
    websocketHandlers.open(ws as any);

    expect(ws.closed).toBe(false);
    expect(ws.messages).toHaveLength(0);

    progressStore.emitMessage("job-4", "Live update");
    expect(ws.messages).toHaveLength(1);
    const msg = JSON.parse(ws.messages[0]);
    expect(msg.type).toBe("progress");
    expect(msg.event.message).toBe("Live update");
  });

  test("closes socket when completion event arrives", () => {
    progressStore.createJob("job-5");

    const ws = new MockWebSocket({ jobId: "job-5" });
    websocketHandlers.open(ws as any);

    progressStore.complete("job-5", { result: "ok" });
    expect(ws.closed).toBe(true);
  });

  test("closes socket when failure event arrives", () => {
    progressStore.createJob("job-6");

    const ws = new MockWebSocket({ jobId: "job-6" });
    websocketHandlers.open(ws as any);

    progressStore.fail("job-6", "timeout");
    expect(ws.closed).toBe(true);
  });
});

describe("WebSocket handler — close", () => {
  test("unsubscribes and clears timers on close", () => {
    progressStore.createJob("job-7");

    const ws = new MockWebSocket({ jobId: "job-7" });
    websocketHandlers.open(ws as any);

    // Emit while open
    progressStore.emitMessage("job-7", "Before close");
    expect(ws.messages).toHaveLength(1);

    websocketHandlers.close(ws as any);

    // After close, events should not be received
    progressStore.emitMessage("job-7", "After close");
    expect(ws.messages).toHaveLength(1);
  });
});

describe("WebSocket handler — heartbeat", () => {
  test("starts ping timer on open for pending jobs", () => {
    progressStore.createJob("job-8");

    const ws = new MockWebSocket({ jobId: "job-8" });
    websocketHandlers.open(ws as any);

    expect(ws.data.pingTimer).toBeDefined();
  });

  test("does not start ping timer when job is already completed", () => {
    progressStore.createJob("job-9");
    progressStore.complete("job-9", {});

    const ws = new MockWebSocket({ jobId: "job-9" });
    websocketHandlers.open(ws as any);

    expect(ws.data.pingTimer).toBeUndefined();
  });

  test("clears ping and pong timers on close", () => {
    progressStore.createJob("job-10");

    const ws = new MockWebSocket({ jobId: "job-10" });
    websocketHandlers.open(ws as any);

    expect(ws.data.pingTimer).toBeDefined();
    websocketHandlers.close(ws as any);
    expect(ws.data.pingTimer).toBeUndefined();
    expect(ws.data.pongTimer).toBeUndefined();
  });

  test("pong clears the pong timeout", () => {
    progressStore.createJob("job-11");

    const ws = new MockWebSocket({ jobId: "job-11" });
    websocketHandlers.open(ws as any);

    // Manually set a pong timer to simulate an in-flight ping
    ws.data.pongTimer = setTimeout(() => {}, 10000);
    expect(ws.data.pongTimer).toBeDefined();

    websocketHandlers.pong(ws as any);
    expect(ws.data.pongTimer).toBeUndefined();
  });
});
