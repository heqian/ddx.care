import { test, expect, describe } from "bun:test";
import {
  AppError,
  RetriableError,
  LLMTimeoutError,
  APITimeoutError,
  RateLimitError,
  NonRetriableError,
  SchemaValidationError,
  PermanentAPIError,
  ToolError,
  getErrorTypeName,
  isRetriableError,
  sanitizeForContext,
} from "../src/backend/utils/errors";
import { withRetry } from "../src/backend/workflows/diagnostic-workflow";

describe("Error class hierarchy", () => {
  test("AppError is base of hierarchy", () => {
    const err = new AppError("test");
    expect(err instanceof AppError).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(err.message).toBe("test");
    expect(err.name).toBe("AppError");
  });

  test("RetriableError extends AppError", () => {
    const err = new RetriableError("retry me");
    expect(err instanceof RetriableError).toBe(true);
    expect(err instanceof AppError).toBe(true);
    expect(err instanceof Error).toBe(true);
    expect(err.name).toBe("RetriableError");
  });

  test("LLMTimeoutError extends RetriableError", () => {
    const err = new LLMTimeoutError("timeout");
    expect(err instanceof LLMTimeoutError).toBe(true);
    expect(err instanceof RetriableError).toBe(true);
    expect(err instanceof AppError).toBe(true);
    expect(err.name).toBe("LLMTimeoutError");
  });

  test("APITimeoutError extends RetriableError", () => {
    const err = new APITimeoutError("api timeout");
    expect(err instanceof APITimeoutError).toBe(true);
    expect(err instanceof RetriableError).toBe(true);
    expect(err instanceof AppError).toBe(true);
    expect(err.name).toBe("APITimeoutError");
  });

  test("RateLimitError extends RetriableError", () => {
    const err = new RateLimitError("rate limited");
    expect(err instanceof RateLimitError).toBe(true);
    expect(err instanceof RetriableError).toBe(true);
    expect(err instanceof AppError).toBe(true);
    expect(err.name).toBe("RateLimitError");
  });

  test("NonRetriableError extends AppError", () => {
    const err = new NonRetriableError("don't retry");
    expect(err instanceof NonRetriableError).toBe(true);
    expect(err instanceof AppError).toBe(true);
    expect(err.name).toBe("NonRetriableError");
  });

  test("SchemaValidationError extends NonRetriableError", () => {
    const err = new SchemaValidationError("validation failed");
    expect(err instanceof SchemaValidationError).toBe(true);
    expect(err instanceof NonRetriableError).toBe(true);
    expect(err instanceof AppError).toBe(true);
    expect(err.name).toBe("SchemaValidationError");
  });

  test("PermanentAPIError extends NonRetriableError", () => {
    const err = new PermanentAPIError("not found", 404);
    expect(err instanceof PermanentAPIError).toBe(true);
    expect(err instanceof NonRetriableError).toBe(true);
    expect(err instanceof AppError).toBe(true);
    expect(err.name).toBe("PermanentAPIError");
    expect(err.statusCode).toBe(404);
  });

  test("ToolError extends AppError", () => {
    const cause = new Error("underlying");
    const err = new ToolError("drug-interaction", "tool failed", cause);
    expect(err instanceof ToolError).toBe(true);
    expect(err instanceof AppError).toBe(true);
    expect(err.name).toBe("ToolError");
    expect(err.toolName).toBe("drug-interaction");
    expect(err.cause).toBe(cause);
  });

  test("RetriableError is not instance of NonRetriableError", () => {
    const retriable = new RetriableError("r");
    const nonRetriable = new NonRetriableError("nr");
    expect(retriable instanceof NonRetriableError).toBe(false);
    expect(nonRetriable instanceof RetriableError).toBe(false);
  });

  test("cause is preserved", () => {
    const cause = new Error("original");
    const err = new AppError("wrapped", cause);
    expect(err.cause).toBe(cause);
  });
});

describe("getErrorTypeName", () => {
  test("returns subclass name for AppError instances", () => {
    expect(getErrorTypeName(new LLMTimeoutError("t"))).toBe("LLMTimeoutError");
    expect(getErrorTypeName(new APITimeoutError("t"))).toBe("APITimeoutError");
    expect(getErrorTypeName(new RateLimitError("r"))).toBe("RateLimitError");
    expect(getErrorTypeName(new SchemaValidationError("v"))).toBe(
      "SchemaValidationError",
    );
    expect(getErrorTypeName(new PermanentAPIError("p", 403))).toBe(
      "PermanentAPIError",
    );
    expect(getErrorTypeName(new ToolError("t", "e"))).toBe("ToolError");
    expect(getErrorTypeName(new AppError("base"))).toBe("AppError");
  });

  test("returns UnknownError for generic Error", () => {
    expect(getErrorTypeName(new Error("generic"))).toBe("UnknownError");
  });

  test("returns UnknownError for non-Error values", () => {
    expect(getErrorTypeName("string error")).toBe("UnknownError");
    expect(getErrorTypeName(42)).toBe("UnknownError");
    expect(getErrorTypeName(null)).toBe("UnknownError");
  });
});

describe("isRetriableError", () => {
  test("RetriableError subclasses are retriable", () => {
    expect(isRetriableError(new LLMTimeoutError("t"))).toBe(true);
    expect(isRetriableError(new APITimeoutError("t"))).toBe(true);
    expect(isRetriableError(new RateLimitError("r"))).toBe(true);
    expect(isRetriableError(new RetriableError("r"))).toBe(true);
  });

  test("NonRetriableError subclasses are not retriable", () => {
    expect(isRetriableError(new SchemaValidationError("v"))).toBe(false);
    expect(isRetriableError(new PermanentAPIError("p", 403))).toBe(false);
    expect(isRetriableError(new NonRetriableError("nr"))).toBe(false);
  });

  test("unknown errors default to retriable", () => {
    expect(isRetriableError(new Error("generic"))).toBe(true);
    expect(isRetriableError("string")).toBe(true);
  });

  test("ToolError is retriable (base AppError default)", () => {
    expect(isRetriableError(new ToolError("t", "e"))).toBe(true);
  });
});

describe("sanitizeForContext", () => {
  test("passes through short clean messages unchanged", () => {
    expect(sanitizeForContext("Drug API timeout")).toBe("Drug API timeout");
  });

  test("strips URLs from messages", () => {
    const msg =
      "Failed to fetch https://api.example.com/v1/data?api_key=SECRET";
    const result = sanitizeForContext(msg);
    expect(result).not.toContain("api_key=SECRET");
    expect(result).toContain("[url removed]");
    expect(result).not.toContain("https://");
  });

  test("strips file paths from messages", () => {
    const msg = "Error reading /etc/config/secrets.json: permission denied";
    const result = sanitizeForContext(msg);
    expect(result).toContain("[path removed]");
    expect(result).not.toContain("/etc/config/secrets.json");
  });

  test("truncates long messages to maxLength", () => {
    const msg = "A".repeat(500);
    const result = sanitizeForContext(msg, 200);
    expect(result.length).toBeLessThanOrEqual(200);
    expect(result.endsWith("...")).toBe(true);
    expect(result.length).toBe(200); // 197 chars + "..."
  });

  test("uses default maxLength of 200", () => {
    const msg = "B".repeat(300);
    const result = sanitizeForContext(msg);
    expect(result.length).toBeLessThanOrEqual(200);
  });

  test("does not truncate short messages", () => {
    const msg = "Short error message";
    const result = sanitizeForContext(msg);
    expect(result).toBe("Short error message");
  });

  test("handles multiple URLs in one message", () => {
    const msg =
      "Failed: https://api.example.com/data and https://api2.example.com/other";
    const result = sanitizeForContext(msg);
    expect(result).not.toContain("https://");
    const removedCount = (result.match(/\[url removed\]/g) || []).length;
    expect(removedCount).toBe(2);
  });
});

describe("withRetry with shouldRetry predicate", () => {
  test("retries retriable errors", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 3) throw new RetriableError("retry me");
        return "success";
      },
      3,
      10,
      undefined,
      (e) => e instanceof RetriableError,
    );

    expect(result).toBe("success");
    expect(calls).toBe(3);
  });

  test("does not retry NonRetriableError", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new SchemaValidationError("bad schema");
        },
        3,
        10,
        undefined,
        (e) => !(e instanceof NonRetriableError),
      ),
    ).rejects.toThrow("bad schema");

    expect(calls).toBe(1); // Should not retry
  });

  test("abort error always propagates immediately even with shouldRetry", async () => {
    const controller = new AbortController();
    controller.abort();

    // When signal is already aborted, withRetry throws before calling fn
    await expect(
      withRetry(
        async () => "never reached",
        3,
        10,
        controller.signal,
        () => true,
      ),
    ).rejects.toThrow("Aborted");
  });

  test("without shouldRetry, defaults to retrying all errors", async () => {
    let calls = 0;
    const result = await withRetry(
      async () => {
        calls++;
        if (calls < 2) throw new SchemaValidationError("bad");
        return "ok";
      },
      3,
      10,
    );

    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  test("shouldRetry returning false immediately propagates error", async () => {
    let calls = 0;
    await expect(
      withRetry(
        async () => {
          calls++;
          throw new Error("generic");
        },
        3,
        10,
        undefined,
        () => false,
      ),
    ).rejects.toThrow("generic");

    expect(calls).toBe(1);
  });
});