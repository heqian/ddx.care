import { test, expect, describe, beforeEach, vi, afterEach } from "bun:test";
import { logger } from "../src/backend/utils/logger";

let logSpy: ReturnType<typeof vi.spyOn>;
let warnSpy: ReturnType<typeof vi.spyOn>;
let errorSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
  warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
  errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  logSpy.mockRestore();
  warnSpy.mockRestore();
  errorSpy.mockRestore();
});

describe("Logger — Level Dispatch", () => {
  test("info() calls console.log", () => {
    logger.info("test_event");
    expect(logSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("warn() calls console.warn", () => {
    logger.warn("test_warning");
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(errorSpy).not.toHaveBeenCalled();
  });

  test("error() calls console.error", () => {
    logger.error("test_error");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
    expect(warnSpy).not.toHaveBeenCalled();
  });
});

describe("Logger — Output Format", () => {
  test("includes ISO timestamp", () => {
    logger.info("test_event");
    const output = logSpy.mock.calls[0][0] as string;
    // ISO timestamp pattern: 2024-01-15T10:30:00.000Z
    expect(output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  test("includes level in uppercase", () => {
    logger.info("my_event");
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain("INFO");
    expect(output).toContain("my_event");
  });

  test("includes extra data as JSON", () => {
    logger.info("with_data", { key: "value", count: 42 });
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('"key":"value"');
    expect(output).toContain('"count":42');
  });

  test("omits JSON block when no extra data", () => {
    logger.info("simple");
    const output = logSpy.mock.calls[0][0] as string;
    // Should be: "<timestamp> INFO simple" with no trailing JSON
    const parts = output.split(" ");
    // timestamp, INFO, simple — no more
    expect(parts.length).toBe(3);
  });

  test("formats as JSON when LOG_FORMAT=json", () => {
    process.env.LOG_FORMAT = "json";
    logger.info("json_event", { key: "value" });
    const output = logSpy.mock.calls[0][0] as string;
    const parsed = JSON.parse(output);
    expect(parsed.level).toBe("info");
    expect(parsed.event).toBe("json_event");
    expect(parsed.key).toBe("value");
    expect(parsed.timestamp).toBeDefined();
    delete process.env.LOG_FORMAT;
  });
});

describe("Logger — Specialized Methods", () => {
  test("request() logs method, path, status, and durationMs", () => {
    logger.request("POST", "/v1/diagnose", 202, 15);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain("http_request");
    expect(output).toContain('"method":"POST"');
    expect(output).toContain('"/v1/diagnose"');
    expect(output).toContain('"status":202');
    expect(output).toContain('"durationMs":15');
  });

  test("request() includes extra data", () => {
    logger.request("GET", "/v1/status", 200, 5, { jobId: "abc-123" });
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain('"jobId":"abc-123"');
  });

  test("workflowStart() logs jobId", () => {
    logger.workflowStart("job-xyz");
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain("workflow_start");
    expect(output).toContain('"jobId":"job-xyz"');
  });

  test("workflowComplete() logs jobId, duration, and specialistCount", () => {
    logger.workflowComplete("job-abc", 5000, 3);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain("workflow_complete");
    expect(output).toContain('"durationMs":5000');
    expect(output).toContain('"specialistCount":3');
  });

  test("workflowFail() logs to error level", () => {
    logger.workflowFail("job-fail", 1000, "timeout");
    expect(errorSpy).toHaveBeenCalledTimes(1);
    const output = errorSpy.mock.calls[0][0] as string;
    expect(output).toContain("workflow_fail");
    expect(output).toContain('"error":"timeout"');
  });

  test("specialistCall() logs specialist details", () => {
    logger.specialistCall("cardiologist", "job-1", 2000, true);
    const output = logSpy.mock.calls[0][0] as string;
    expect(output).toContain("specialist_call");
    expect(output).toContain('"specialistId":"cardiologist"');
    expect(output).toContain('"durationMs":2000');
    // success is stringified
    expect(output).toContain('"success":"true"');
  });
});
