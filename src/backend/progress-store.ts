import type { ServerWebSocket } from "bun";

export interface ProgressEvent {
  time: string;
  message: string;
}

export interface JobEntry {
  status: "pending" | "completed" | "failed";
  result?: unknown;
  error?: string;
  createdAt: number;
  progress: ProgressEvent[];
}

class ProgressStore extends EventTarget {
  private jobs = new Map<string, JobEntry>();
  
  createJob(jobId: string): void {
    this.jobs.set(jobId, {
      status: "pending",
      createdAt: Date.now(),
      progress: [],
    });
  }

  getJob(jobId: string): JobEntry | undefined {
    return this.jobs.get(jobId);
  }

  emitMessage(jobId: string, message: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    const event = { time: new Date().toISOString(), message };
    job.progress.push(event);

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "progress", jobId, event },
      })
    );
  }

  complete(jobId: string, result: unknown): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "completed";
    job.result = result;

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "completed", jobId, result },
      })
    );
  }

  fail(jobId: string, error: string): void {
    const job = this.jobs.get(jobId);
    if (!job) return;

    job.status = "failed";
    job.error = error;

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "failed", jobId, error },
      })
    );
  }

  subscribe(jobId: string, cb: (data: unknown) => void): () => void {
    const handler = (e: Event) => {
      if (e instanceof CustomEvent) {
        cb(e.detail);
      }
    };
    const eventName = `progress-${jobId}`;
    this.addEventListener(eventName, handler);
    return () => {
      this.removeEventListener(eventName, handler);
    };
  }

  cleanupExpired(ttlMs: number): void {
    const now = Date.now();
    for (const [id, entry] of this.jobs) {
      if (now - entry.createdAt > ttlMs) {
        this.jobs.delete(id);
      }
    }
  }
}

export const progressStore = new ProgressStore();
