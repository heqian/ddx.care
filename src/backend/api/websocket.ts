import type { ServerWebSocket } from "bun";
import { progressStore } from "../progress-store";

export interface WsData {
  jobId: string;
  unsubscribe?: () => void;
}

export const websocketHandlers = {
  open(ws: ServerWebSocket<WsData>) {
    const jobId = ws.data.jobId;
    const job = progressStore.getJob(jobId);

    if (!job) {
      ws.send(JSON.stringify({ type: "failed", jobId, error: "Job not found" }));
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
      if ((data as any).type === "completed" || (data as any).type === "failed") {
        ws.close();
      }
    });

    ws.data.unsubscribe = unsubscribe;
  },

  message() {},

  close(ws: ServerWebSocket<WsData>) {
    ws.data.unsubscribe?.();
  },
};
