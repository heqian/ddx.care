import { Database, type Statement } from "bun:sqlite";
import { logger } from "./utils/logger";
import * as abortStore from "./utils/abort-controller-store";
import {
  reportOutcomeSchema,
  type ReportOutcome,
} from "../shared/report-outcome";
import type { SpecialistId } from "./agents/manifest";

export type ProgressEventType =
  | "round_start"
  | "cmo_decision"
  | "specialist_start"
  | "tool_call"
  | "tool_result"
  | "specialist_complete"
  | "cmo_final"
  | "general";

export type ToolResultStatus = "success" | "partial" | "failed";
export type ProgressAgentId = SpecialistId | "chiefMedicalOfficer";

export interface ProgressEvent {
  time: string;
  message: string;
  eventType?: ProgressEventType;
  agentId?: ProgressAgentId;
  toolCallId?: string;
  toolName?: string;
  toolArgs?: string | null;
  success?: boolean;
  toolResultStatus?: ToolResultStatus;
  retriable?: boolean;
  durationMs?: number;
  resultSummary?: string | null;
  errorType?: string;
  specialistIds?: SpecialistId[];
}

interface JobRow {
  id: string;
  status: string;
  result: string | null;
  error: string | null;
  createdAt: number;
  progress: string;
}

/**
 * Progress events are stored as a JSON array that gets rewritten on every
 * append (json_insert) — O(n²) over a job's lifetime. Capping the stored
 * history bounds both the rewrite cost and the replay size. Long jobs keep
 * their most recent events; the trim runs only past the threshold.
 */
const MAX_PROGRESS_EVENTS = 1000;
const PROGRESS_TRIM_THRESHOLD = 1200;

export interface JobEntry {
  status: "pending" | "completed" | "failed";
  result?: ReportOutcome;
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
  private scrubStmt!: Statement;
  private cleanupStmt!: Statement;
  private countProgressStmt!: Statement;
  private replaceProgressStmt!: Statement;

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
      CREATE INDEX IF NOT EXISTS idx_jobs_createdAt ON jobs (createdAt);
      CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs (status);
    `);

    this.insertStmt = this.db.prepare(
      `INSERT INTO jobs (id, status, createdAt, progress) VALUES (?, ?, ?, ?)`,
    );
    this.getStmt = this.db.prepare(`SELECT * FROM jobs WHERE id = ?`);
    this.emitStmt = this.db.prepare(
      `UPDATE jobs SET progress = json_insert(progress, '$[#]', json(?)) WHERE id = ?`,
    );
    this.completeStmt = this.db.prepare(
      `UPDATE jobs SET status = ?, result = ? WHERE id = ? AND status = 'pending'`,
    );
    this.failStmt = this.db.prepare(
      `UPDATE jobs SET status = ?, error = ? WHERE id = ? AND status = 'pending'`,
    );
    this.scrubStmt = this.db.prepare(
      `UPDATE jobs SET result = NULL, progress = '[]', error = NULL WHERE status IN ('completed', 'failed') AND createdAt < ?`,
    );
    this.cleanupStmt = this.db.prepare(
      `DELETE FROM jobs WHERE status IN ('completed', 'failed') AND createdAt < ?`,
    );
    this.countProgressStmt = this.db.prepare(
      `SELECT json_array_length(progress) as count FROM jobs WHERE id = ?`,
    );
    this.replaceProgressStmt = this.db.prepare(
      `UPDATE jobs SET progress = ? WHERE id = ?`,
    );
  }

  createJob(jobId: string): void {
    this.insertStmt.run(jobId, "pending", Date.now(), "[]");
  }

  getJob(jobId: string): JobEntry | undefined {
    const row = this.getStmt.get(jobId) as JobRow | null;
    if (!row) return undefined;

    // A corrupt row (e.g. legacy data from an older schema) must not take
    // down GET /v1/status — degrade to an empty-but-present job instead.
    let result: ReportOutcome | undefined;
    if (row.result) {
      try {
        result = reportOutcomeSchema.parse(JSON.parse(row.result));
      } catch (error) {
        logger.warn("job_result_parse_failed", {
          jobId,
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    let progress: ProgressEvent[] = [];
    try {
      const parsed = JSON.parse(row.progress);
      if (Array.isArray(parsed)) progress = parsed as ProgressEvent[];
    } catch {
      logger.warn("job_progress_parse_failed", { jobId });
    }

    return {
      status: row.status as JobEntry["status"],
      result,
      error: row.error || undefined,
      createdAt: row.createdAt,
      progress,
    };
  }

  emitMessage(jobId: string, messageOrEvent: string | ProgressEvent): void {
    const event: ProgressEvent =
      typeof messageOrEvent === "string"
        ? { time: new Date().toISOString(), message: messageOrEvent }
        : messageOrEvent;
    this.emitStmt.run(JSON.stringify(event), jobId);
    this.trimProgressIfLarge(jobId);

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "progress", jobId, event },
      }),
    );
  }

  /** Occasionally trim the stored progress array to its most recent events. */
  private trimProgressIfLarge(jobId: string): void {
    const row = this.countProgressStmt.get(jobId) as
      | { count: number | null }
      | undefined;
    const count = row?.count;
    if (typeof count !== "number" || count <= PROGRESS_TRIM_THRESHOLD) return;

    const job = this.getStmt.get(jobId) as JobRow | null;
    if (!job) return;
    try {
      const events = JSON.parse(job.progress);
      if (!Array.isArray(events) || events.length <= MAX_PROGRESS_EVENTS)
        return;
      const trimmed = events.slice(events.length - MAX_PROGRESS_EVENTS);
      this.replaceProgressStmt.run(JSON.stringify(trimmed), jobId);
    } catch {
      // Leave the array untouched if it cannot be parsed.
    }
  }

  complete(jobId: string, result: ReportOutcome): void {
    const current = this.getStmt.get(jobId) as JobRow | null;
    if (current?.status === "failed") {
      logger.warn("complete_skipped_already_failed", {
        jobId,
        message: `Job ${jobId} was already failed — not overwriting with completed status`,
      });
      return;
    }
    if (current?.status !== "pending") return;
    const validatedResult = reportOutcomeSchema.parse(result);
    const update = this.completeStmt.run(
      "completed",
      JSON.stringify(validatedResult),
      jobId,
    );
    if (update.changes === 0) return;

    this.dispatchEvent(
      new CustomEvent(`progress-${jobId}`, {
        detail: { type: "completed", jobId, result: validatedResult },
      }),
    );
  }

  fail(jobId: string, error: string): void {
    const update = this.failStmt.run("failed", error, jobId);
    if (update.changes === 0) return;

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

  healthCheck(): boolean {
    try {
      this.db.query("SELECT 1").run();
      return true;
    } catch {
      return false;
    }
  }

  cleanupExpired(ttlMs: number): void {
    const cutoff = Date.now() - ttlMs;
    this.scrubStmt.run(cutoff);
    this.cleanupStmt.run(cutoff);
  }

  /**
   * Find pending jobs whose `createdAt` exceeds `timeoutMs`, abort their
   * workflow (if still running) via `abortStore`, and mark them failed with
   * "Diagnosis timed out". Replaces silent TTL deletion for active work so
   * capacity, status, and cancellation remain consistent.
   */
  timeoutPending(timeoutMs: number): void {
    const cutoff = Date.now() - timeoutMs;
    const stmt = this.db.prepare(
      `SELECT id FROM jobs WHERE status = 'pending' AND createdAt < ?`,
    );
    const rows = stmt.all(cutoff) as { id: string }[];
    for (const { id } of rows) {
      const controller = abortStore.get(id);
      if (controller) {
        try {
          controller.abort();
        } catch (error) {
          logger.warn("pending_timeout_abort_failed", {
            jobId: id,
            error: error instanceof Error ? error.message : "Unknown error",
          });
        }
      }
      this.fail(id, "Diagnosis timed out");
      logger.warn("pending_job_timed_out", { jobId: id, timeoutMs });
    }
  }

  markStalePending(): void {
    const stmt = this.db.prepare(
      `UPDATE jobs SET status = 'failed', error = 'Server restarted — job interrupted' WHERE status = 'pending'`,
    );
    stmt.run();
  }
}

export const progressStore = new JobStore();
