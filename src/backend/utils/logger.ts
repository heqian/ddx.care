import { AuditLogger } from "./audit-logger";
import {
  AUDIT_LOG_PATH,
  AUDIT_LOG_MAX_SIZE_MB,
  AUDIT_LOG_MAX_FILES,
} from "../config";

type LogLevel = "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  event: string;
  [key: string]: unknown;
}

let auditLogger: AuditLogger | null = null;
if (AUDIT_LOG_PATH) {
  auditLogger = new AuditLogger(
    AUDIT_LOG_PATH,
    AUDIT_LOG_MAX_SIZE_MB,
    AUDIT_LOG_MAX_FILES,
  );
}

export function setAuditLogger(logger: AuditLogger | null): void {
  auditLogger = logger;
}

function formatLog(entry: LogEntry): string {
  if (process.env.LOG_FORMAT === "json") {
    return JSON.stringify(entry);
  }
  const { timestamp, level, event, ...rest } = entry;
  const parts = [timestamp, level.toUpperCase(), event];
  const extras = Object.entries(rest);
  if (extras.length > 0) {
    parts.push(JSON.stringify(Object.fromEntries(extras)));
  }
  return parts.join(" ");
}

function log(
  level: LogLevel,
  event: string,
  data?: Record<string, unknown>,
): void {
  const entry: LogEntry = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...data,
  };
  const message = formatLog(entry);
  switch (level) {
    case "warn":
      console.warn(message);
      break;
    case "error":
      console.error(message);
      break;
    default:
      console.log(message);
  }
  if (auditLogger) {
    auditLogger.write(entry);
  }
}

export const logger = {
  info: (event: string, data?: Record<string, unknown>) =>
    log("info", event, data),
  warn: (event: string, data?: Record<string, unknown>) =>
    log("warn", event, data),
  error: (event: string, data?: Record<string, unknown>) =>
    log("error", event, data),

  request(
    method: string,
    path: string,
    status: number,
    durationMs: number,
    data?: Record<string, unknown>,
  ): void {
    this.info("http_request", { method, path, status, durationMs, ...data });
  },

  workflowStart(jobId: string): void {
    this.info("workflow_start", { jobId });
  },

  workflowComplete(
    jobId: string,
    durationMs: number,
    specialistCount: number,
  ): void {
    this.info("workflow_complete", { jobId, durationMs, specialistCount });
  },

  workflowFail(jobId: string, durationMs: number, error: string): void {
    this.error("workflow_fail", { jobId, durationMs, error });
  },

  specialistCall(
    specialistId: string,
    jobId: string,
    durationMs: number,
    success: boolean,
  ): void {
    this.info("specialist_call", {
      specialistId,
      jobId,
      durationMs,
      success: String(success),
    });
  },
};
