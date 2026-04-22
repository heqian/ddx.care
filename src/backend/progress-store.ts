import { Database, type Statement } from "bun:sqlite";

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
  private insertStmt!: Statement;
  private getStmt!: Statement;
  private emitStmt!: Statement;
  private completeStmt!: Statement;
  private failStmt!: Statement;
  private cleanupStmt!: Statement;

  constructor(dbPath = process.env.DB_PATH || "jobs.sqlite") {
    super();
    this.db = new Database(dbPath, { create: true });
    this.db.exec("PRAGMA journal_mode=WAL;");
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

    this.insertStmt = this.db.prepare(
      `INSERT INTO jobs (id, status, createdAt, progress) VALUES (?, ?, ?, ?)`,
    );
    this.getStmt = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`);
    this.emitStmt = this.db.prepare(
      `UPDATE jobs SET progress = json_insert(progress, '$[#]', json(?)) WHERE id = ?`,
    );
    this.completeStmt = this.db.prepare(
      `UPDATE jobs SET status = ?, result = ? WHERE id = ?`,
    );
    this.failStmt = this.db.prepare(
      `UPDATE jobs SET status = ?, error = ? WHERE id = ?`,
    );
    this.cleanupStmt = this.db.prepare(`DELETE FROM jobs WHERE createdAt < ?`);
  }

  createJob(jobId: string): void {
    this.insertStmt.run(jobId, "pending", Date.now(), "[]");
  }

  getJob(jobId: string): JobEntry | undefined {
    const row = this.getStmt.get(jobId) as JobRow | null;
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
    const event = { time: new Date().toISOString(), message };
    this.emitStmt.run(JSON.stringify(event), jobId);

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "progress", jobId, event },
      }),
    );
  }

  complete(jobId: string, result: unknown): void {
    this.completeStmt.run("completed", JSON.stringify(result), jobId);

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "completed", jobId, result },
      }),
    );
  }

  fail(jobId: string, error: string): void {
    this.failStmt.run("failed", error, jobId);

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "failed", jobId, error },
      }),
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
    this.cleanupStmt.run(cutoff);
  }
}

export const progressStore = new JobStore();
