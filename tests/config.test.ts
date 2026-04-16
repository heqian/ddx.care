import { test, expect, describe } from "bun:test";
import {
  validateConfig,
  PORT,
  ALLOWED_ORIGINS,
  JOB_TTL_MS,
  CLEANUP_INTERVAL_MS,
  RATE_LIMIT_PRUNE_INTERVAL_MS,
  SPECIALIST_MODEL,
  ORCHESTRATOR_MODEL,
  DIAGNOSIS_TIMEOUT_MS,
  MAX_DIAGNOSIS_ROUNDS,
  RATE_LIMIT_MAX_REQUESTS,
  RATE_LIMIT_WINDOW_MS,
  MAX_CONCURRENT_WORKFLOWS,
  MAX_INPUT_FIELD_LENGTH,
  MAX_PAYLOAD_BYTES,
  AGENT_GENERATE_MAX_RETRIES,
  AGENT_GENERATE_RETRY_BASE_DELAY,
} from "../src/backend/config";

describe("Config — Constants", () => {
  test("PORT is a positive number", () => {
    expect(typeof PORT).toBe("number");
    expect(PORT).toBeGreaterThan(0);
  });

  test("ALLOWED_ORIGINS is a non-empty string", () => {
    expect(typeof ALLOWED_ORIGINS).toBe("string");
    expect(ALLOWED_ORIGINS.length).toBeGreaterThan(0);
  });

  test("timeouts and intervals are positive", () => {
    expect(JOB_TTL_MS).toBeGreaterThan(0);
    expect(CLEANUP_INTERVAL_MS).toBeGreaterThan(0);
    expect(RATE_LIMIT_PRUNE_INTERVAL_MS).toBeGreaterThan(0);
    expect(DIAGNOSIS_TIMEOUT_MS).toBeGreaterThan(0);
    expect(AGENT_GENERATE_RETRY_BASE_DELAY).toBeGreaterThan(0);
  });

  test("model strings are non-empty", () => {
    expect(typeof SPECIALIST_MODEL).toBe("string");
    expect(SPECIALIST_MODEL.length).toBeGreaterThan(0);
    expect(typeof ORCHESTRATOR_MODEL).toBe("string");
    expect(ORCHESTRATOR_MODEL.length).toBeGreaterThan(0);
  });

  test("rate limit and concurrency settings are positive", () => {
    expect(RATE_LIMIT_MAX_REQUESTS).toBeGreaterThan(0);
    expect(RATE_LIMIT_WINDOW_MS).toBeGreaterThan(0);
    expect(MAX_CONCURRENT_WORKFLOWS).toBeGreaterThan(0);
  });

  test("payload limits are reasonable", () => {
    expect(MAX_INPUT_FIELD_LENGTH).toBeGreaterThan(0);
    expect(MAX_PAYLOAD_BYTES).toBeGreaterThan(0);
    expect(MAX_PAYLOAD_BYTES).toBeGreaterThan(MAX_INPUT_FIELD_LENGTH);
  });

  test("AGENT_GENERATE_MAX_RETRIES is non-negative", () => {
    expect(AGENT_GENERATE_MAX_RETRIES).toBeGreaterThanOrEqual(0);
  });

  test("MAX_DIAGNOSIS_ROUNDS is positive", () => {
    expect(MAX_DIAGNOSIS_ROUNDS).toBeGreaterThan(0);
  });
});

describe("Config — validateConfig", () => {
  test("passes with current env (MOCK_LLM=1)", () => {
    process.env.MOCK_LLM = "1";
    expect(() => validateConfig()).not.toThrow();
  });

  test("passes with OPENCODE_API_KEY set", () => {
    process.env.OPENCODE_API_KEY = "test-key";
    expect(() => validateConfig()).not.toThrow();
  });

  test("throws when OPENCODE_API_KEY is missing and MOCK_LLM is not 1", () => {
    const original = process.env.OPENCODE_API_KEY;
    const originalMock = process.env.MOCK_LLM;
    delete process.env.OPENCODE_API_KEY;
    process.env.MOCK_LLM = "0";
    try {
      expect(() => validateConfig()).toThrow("Missing OPENCODE_API_KEY");
    } finally {
      process.env.OPENCODE_API_KEY = original;
      process.env.MOCK_LLM = originalMock;
    }
  });
});
