import type { ServerWebSocket } from "bun";
import { Database } from "bun:sqlite";

export interface ProgressEvent {
  time: string;
  message: string;
}

interface JobRow {
  id: string;
  status: string;
  result: string | null;
  error: string | null;
  createdAt: number;
  progress: string;
}

export interface JobEntry {
  status: "pending" | "completed" | "failed";
  result?: unknown;
  error?: string;
  createdAt: number;
  progress: ProgressEvent[];
}

export class JobStore extends EventTarget {
  private db: Database;

  constructor(dbPath = "jobs.sqlite") {
    super();
    this.db = new Database(dbPath, { create: true });
    this.init();
  }

  private init() {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS jobs (
        id TEXT PRIMARY KEY,
        status TEXT NOT NULL,
        result TEXT,
        error TEXT,
        createdAt INTEGER NOT NULL,
        progress TEXT NOT NULL
      );
    `);
  }

  createJob(jobId: string): void {
    const stmt = this.db.prepare(
      `INSERT INTO jobs (id, status, createdAt, progress) VALUES (?, ?, ?, ?)`
    );
    stmt.run(jobId, "pending", Date.now(), "[]");
  }

  getJob(jobId: string): JobEntry | undefined {
    const stmt = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`);
    const row = stmt.get(jobId) as JobRow | null;
    if (!row) return undefined;

    return {
      status: row.status as JobEntry["status"],
      result: row.result ? JSON.parse(row.result) : undefined,
      error: row.error || undefined,
      createdAt: row.createdAt,
      progress: JSON.parse(row.progress),
    };
  }

  emitMessage(jobId: string, message: string): void {
    const job = this.getJob(jobId);
    if (!job) return;

    const event = { time: new Date().toISOString(), message };
    job.progress.push(event);

    const stmt = this.db.prepare(`UPDATE jobs SET progress = ? WHERE id = ?`);
    stmt.run(JSON.stringify(job.progress), jobId);

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "progress", jobId, event },
      })
    );
  }

  complete(jobId: string, result: unknown): void {
    const job = this.getJob(jobId);
    if (!job) return;

    const stmt = this.db.prepare(
      `UPDATE jobs SET status = ?, result = ? WHERE id = ?`
    );
    stmt.run("completed", JSON.stringify(result), jobId);

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "completed", jobId, result },
      })
    );
  }

  fail(jobId: string, error: string): void {
    const job = this.getJob(jobId);
    if (!job) return;

    const stmt = this.db.prepare(
      `UPDATE jobs SET status = ?, error = ? WHERE id = ?`
    );
    stmt.run("failed", error, jobId);

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
    const cutoff = Date.now() - ttlMs;
    const stmt = this.db.prepare(`DELETE FROM jobs WHERE createdAt < ?`);
    stmt.run(cutoff);
  }
}

export const progressStore = new JobStore();
