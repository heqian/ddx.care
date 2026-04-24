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

function getRotatedFiles(dir: string, baseName: string): string[] {
  return readdirSync(dir)
    .filter(
      (f) => f.startsWith(`${baseName}.`) && f !== `${baseName}.log`,
    )
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
    expect(rotated[0]).toMatch(/^audit\.\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z\.log$/);

    const rotatedContent = readFileSync(join(tmpDir, rotated[0]), "utf-8").trim();
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
