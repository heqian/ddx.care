import type { ServerWebSocket } from "bun";
import { progressStore } from "../progress-store";

const PING_INTERVAL_MS = 30000;
const PONG_TIMEOUT_MS = 10000;

export interface WsData {
  jobId: string;
  unsubscribe?: () => void;
  pingTimer?: ReturnType<typeof setInterval>;
  pongTimer?: ReturnType<typeof setTimeout>;
}

interface ProgressEventData {
  type: string;
  jobId: string;
  [key: string]: unknown;
}

export const websocketHandlers = {
  open(ws: ServerWebSocket<WsData>) {
    const jobId = ws.data.jobId;
    const job = progressStore.getJob(jobId);

    if (!job) {
      ws.send(
        JSON.stringify({ type: "failed", jobId, error: "Job not found" }),
      );
      ws.close();
      return;
    }

    for (const event of job.progress) {
      ws.send(JSON.stringify({ type: "progress", jobId, event }));
    }

    if (job.status === "completed") {
      ws.send(JSON.stringify({ type: "completed", jobId, result: job.result }));
      ws.close();
      return;
    } else if (job.status === "failed") {
      ws.send(JSON.stringify({ type: "failed", jobId, error: job.error }));
      ws.close();
      return;
    }

    const unsubscribe = progressStore.subscribe(jobId, (data: unknown) => {
      ws.send(JSON.stringify(data));
      const event = data as ProgressEventData;
      if (event.type === "completed" || event.type === "failed") {
        ws.close();
      }
    });

    ws.data.unsubscribe = unsubscribe;

    // Start heartbeat: ping every 30s, close if no pong within 10s
    ws.data.pingTimer = setInterval(() => {
      if (ws.readyState !== 1) return; // WebSocket.OPEN
      ws.ping();
      ws.data.pongTimer = setTimeout(() => {
        ws.close(1001, "Pong timeout");
      }, PONG_TIMEOUT_MS);
    }, PING_INTERVAL_MS);
  },

  pong(ws: ServerWebSocket<WsData>) {
    if (ws.data.pongTimer) {
      clearTimeout(ws.data.pongTimer);
      ws.data.pongTimer = undefined;
    }
  },

  message() {},

  close(ws: ServerWebSocket<WsData>) {
    ws.data.unsubscribe?.();
    if (ws.data.pingTimer) {
      clearInterval(ws.data.pingTimer);
      ws.data.pingTimer = undefined;
    }
    if (ws.data.pongTimer) {
      clearTimeout(ws.data.pongTimer);
      ws.data.pongTimer = undefined;
    }
  },
};
