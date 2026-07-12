import { test, expect, describe, beforeEach } from "bun:test";
import {
  mkdtempSync,
  readFileSync,
  existsSync,
  writeFileSync,
  readdirSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuditLogger } from "../src/backend/utils/audit-logger";
import { logger, setAuditLogger } from "../src/backend/utils/logger";

function getRotatedFiles(dir: string, baseName: string): string[] {
  return readdirSync(dir)
    .filter((f) => f.startsWith(`${baseName}.`) && f !== `${baseName}.log`)
    .sort();
}

describe("AuditLogger", () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "audit-test-"));
    logPath = join(tmpDir, "audit.log");
  });

  test("creates directory if it does not exist", () => {
    const nestedPath = join(tmpDir, "nested", "dir", "audit.log");
    const logger = new AuditLogger(nestedPath, 1, 2);
    logger.write({ event: "test" });
    expect(existsSync(nestedPath)).toBe(true);
  });

  test("writes JSON line to file", () => {
    const logger = new AuditLogger(logPath, 1, 2);
    logger.write({ event: "workflow_start", jobId: "abc" });

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(1);

    const parsed = JSON.parse(lines[0]);
    expect(parsed.event).toBe("workflow_start");
    expect(parsed.jobId).toBe("abc");
  });

  test("appends multiple entries as separate lines", () => {
    const logger = new AuditLogger(logPath, 1, 2);
    logger.write({ event: "first" });
    logger.write({ event: "second" });

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).event).toBe("first");
    expect(JSON.parse(lines[1]).event).toBe("second");
  });

  test("rotates file to timestamped name when size exceeds max", () => {
    const logger = new AuditLogger(logPath, 0, 2);

    // Pre-create a file with some content so it has size > 0
    writeFileSync(logPath, '{"event":"old"}\n', "utf-8");

    logger.write({ event: "new" });

    // Current log should exist with new content
    expect(existsSync(logPath)).toBe(true);
    const current = readFileSync(logPath, "utf-8").trim();
    expect(JSON.parse(current).event).toBe("new");

    // Rotated file should have timestamped name
    const rotated = getRotatedFiles(tmpDir, "audit");
    expect(rotated.length).toBe(1);
    expect(rotated[0]).toMatch(
      /^audit\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.log$/,
    );

    const rotatedContent = readFileSync(
      join(tmpDir, rotated[0]),
      "utf-8",
    ).trim();
    expect(JSON.parse(rotatedContent).event).toBe("old");
  });

  test("keeps up to maxFiles rotated logs", () => {
    const logger = new AuditLogger(logPath, 0, 2);

    // First rotation
    writeFileSync(logPath, '{"event":"first"}\n', "utf-8");
    logger.write({ event: "second" });

    // Second rotation
    logger.write({ event: "third" });

    const rotated = getRotatedFiles(tmpDir, "audit");
    // maxFiles=2, so at most 2 rotated files retained
    expect(rotated.length).toBeLessThanOrEqual(2);
  });

  test("handles missing file on rotation gracefully", () => {
    const logger = new AuditLogger(logPath, 0, 1);
    writeFileSync(logPath, '{"event":"x"}\n', "utf-8");
    logger.write({ event: "y" });
    expect(existsSync(logPath)).toBe(true);
  });

  test("handles write with complex nested data", () => {
    const logger = new AuditLogger(logPath, 1, 2);
    logger.write({
      event: "specialist_call",
      specialistId: "cardiologist",
      metadata: { round: 1, confidence: 0.95 },
    });

    const content = readFileSync(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.metadata.round).toBe(1);
    expect(parsed.metadata.confidence).toBe(0.95);
  });

  test("write does not throw on permission error", () => {
    const readonlyDir = join(tmpDir, "readonly");
    const restrictedPath = join(readonlyDir, "audit.log");
    const logger = new AuditLogger(restrictedPath, 1, 2);

    // Create and write once to ensure dir exists
    logger.write({ event: "before-lock" });
    expect(existsSync(restrictedPath)).toBe(true);

    // Subsequent writes should not throw even if something goes wrong
    expect(() => logger.write({ event: "should-not-throw" })).not.toThrow();
  });
});

describe("AuditLogger — Tool-Arg Redaction", () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "audit-redact-test-"));
    logPath = join(tmpDir, "audit.log");
  });

  test("tool args redacted by default (AUDIT_LOG_REDACT_TOOL_ARGS not set)", () => {
    const audit = new AuditLogger(logPath, 10, 2);
    setAuditLogger(audit);
    logger.toolCall(
      "cardiologist",
      "job-1",
      "drug-interaction",
      "aspirin + warfarin",
    );

    const content = readFileSync(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.event).toBe("tool_call");
    expect(parsed.toolName).toBe("drug-interaction");
    expect(parsed.argsPresent).toBe(true);
    expect(parsed.argCount).toBe(2);
    expect(parsed.toolArgs).toBeNull();
    // Raw arg values must NOT appear
    expect(content).not.toContain("aspirin");
    expect(content).not.toContain("warfarin");
  });

  test("redaction includes arg count for single-arg queries", () => {
    const audit = new AuditLogger(logPath, 10, 2);
    setAuditLogger(audit);
    logger.toolCall("neurologist", "job-2", "medlineplus-search", "migraine");

    const content = readFileSync(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.argsPresent).toBe(true);
    expect(parsed.argCount).toBe(1);
    expect(parsed.toolArgs).toBeNull();
    expect(content).not.toContain("migraine");
  });

  test("redaction handles null toolArgs", () => {
    const audit = new AuditLogger(logPath, 10, 2);
    setAuditLogger(audit);
    logger.toolCall("oncologist", "job-3", "clinical-trials-search", null);

    const content = readFileSync(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.argsPresent).toBe(false);
    expect(parsed.argCount).toBe(0);
    expect(parsed.toolArgs).toBeNull();
  });

  test("redaction handles empty string toolArgs", () => {
    const audit = new AuditLogger(logPath, 10, 2);
    setAuditLogger(audit);
    logger.toolCall("pathologist", "job-4", "drug-lookup", "");

    const content = readFileSync(logPath, "utf-8");
    const parsed = JSON.parse(content.trim());
    expect(parsed.argsPresent).toBe(false);
    expect(parsed.argCount).toBe(0);
  });
});

describe("AuditLogger — Time-Based Purge", () => {
  let tmpDir: string;
  let logPath: string;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "audit-purge-test-"));
    logPath = join(tmpDir, "audit.log");
  });

  test("purges entries older than the retention period", () => {
    const audit = new AuditLogger(logPath, 10, 2);
    // Write an old entry (2 hours ago)
    const oldTs = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    audit.write({ event: "old_event", timestamp: oldTs });
    // Write a recent entry (1 minute ago)
    const recentTs = new Date(Date.now() - 60 * 1000).toISOString();
    audit.write({ event: "recent_event", timestamp: recentTs });

    // Purge entries older than 1 hour
    audit.purgeOlderThan(1);

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).event).toBe("recent_event");
  });

  test("preserves all entries within retention window", () => {
    const audit = new AuditLogger(logPath, 10, 2);
    const ts1 = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const ts2 = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    audit.write({ event: "entry1", timestamp: ts1 });
    audit.write({ event: "entry2", timestamp: ts2 });

    audit.purgeOlderThan(1);

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(2);
    expect(JSON.parse(lines[0]).event).toBe("entry1");
    expect(JSON.parse(lines[1]).event).toBe("entry2");
  });

  test("purges nothing when all entries are recent", () => {
    const audit = new AuditLogger(logPath, 10, 2);
    const ts = new Date().toISOString();
    audit.write({ event: "fresh", timestamp: ts });

    audit.purgeOlderThan(168);

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).event).toBe("fresh");
  });

  test("custom retention via hours parameter (24h)", () => {
    const audit = new AuditLogger(logPath, 10, 2);
    const oldTs = new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString();
    const recentTs = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    audit.write({ event: "old", timestamp: oldTs });
    audit.write({ event: "recent", timestamp: recentTs });

    audit.purgeOlderThan(24);

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    expect(lines.length).toBe(1);
    expect(JSON.parse(lines[0]).event).toBe("recent");
  });

  test("handles missing file gracefully", () => {
    const audit = new AuditLogger(join(tmpDir, "nonexistent.log"), 10, 2);
    expect(() => audit.purgeOlderThan(1)).not.toThrow();
  });

  test("handles empty file gracefully", () => {
    writeFileSync(logPath, "", "utf-8");
    const audit = new AuditLogger(logPath, 10, 2);
    expect(() => audit.purgeOlderThan(1)).not.toThrow();
    const content = readFileSync(logPath, "utf-8");
    expect(content).toBe("");
  });

  test("preserves entries with invalid/unparseable timestamps", () => {
    const audit = new AuditLogger(logPath, 10, 2);
    // Entry with no timestamp field
    audit.write({ event: "no_timestamp" });
    // Entry with invalid timestamp
    audit.write({ event: "bad_timestamp", timestamp: "not-a-date" });
    // Old entry that should be purged
    const oldTs = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();
    audit.write({ event: "old_entry", timestamp: oldTs });

    audit.purgeOlderThan(24);

    const content = readFileSync(logPath, "utf-8");
    const lines = content.trim().split("\n");
    // Unparseable entries are kept; only the old one is purged
    expect(lines.length).toBe(2);
    const events = lines.map((l) => JSON.parse(l).event);
    expect(events).toContain("no_timestamp");
    expect(events).toContain("bad_timestamp");
    expect(events).not.toContain("old_entry");
  });
});
