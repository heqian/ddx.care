import { test, expect, describe } from "bun:test";
import {
  validateConfig,
  JOB_TTL_MS,
  DIAGNOSIS_TIMEOUT_MS,
  PENDING_JOB_TIMEOUT_MS,
} from "../src/backend/config";

describe("Config — Constants", () => {
  test("DIAGNOSIS_TIMEOUT_MS defaults to 15 minutes", () => {
    expect(DIAGNOSIS_TIMEOUT_MS).toBe(15 * 60 * 1000);
  });

  test("PENDING_JOB_TIMEOUT_MS defaults to DIAGNOSIS_TIMEOUT_MS + 120000", () => {
    expect(PENDING_JOB_TIMEOUT_MS).toBe(DIAGNOSIS_TIMEOUT_MS + 120_000);
  });

  test("JOB_TTL_MS >= DIAGNOSIS_TIMEOUT_MS by default", () => {
    expect(JOB_TTL_MS).toBeGreaterThanOrEqual(DIAGNOSIS_TIMEOUT_MS);
  });
});

describe("Config — DIAGNOSIS_TIMEOUT_MS env override", () => {
  const key = "DIAGNOSIS_TIMEOUT_MS";

  async function importFresh(value: string | undefined) {
    const original = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
    try {
      return await import(
        `../src/backend/config?t=${Date.now()}-${Math.random()}`
      );
    } finally {
      if (original === undefined) delete process.env[key];
      else process.env[key] = original;
    }
  }

  test("reads custom value from env", async () => {
    const mod = await importFresh("120000");
    expect(mod.DIAGNOSIS_TIMEOUT_MS).toBe(120000);
  });

  test("validateConfig throws on non-positive value", async () => {
    const mod = await importFresh("0");
    expect(() => mod.validateConfig()).toThrow("DIAGNOSIS_TIMEOUT_MS");
  });

  test("validateConfig throws on non-numeric value", async () => {
    const mod = await importFresh("abc");
    expect(() => mod.validateConfig()).toThrow("DIAGNOSIS_TIMEOUT_MS");
  });
});

describe("Config — validateConfig", () => {
  test("passes with current env (MOCK_LLM=1)", () => {
    const original = process.env.MOCK_LLM;
    process.env.MOCK_LLM = "1";
    try {
      expect(() => validateConfig()).not.toThrow();
    } finally {
      if (original !== undefined) {
        process.env.MOCK_LLM = original;
      } else {
        delete process.env.MOCK_LLM;
      }
    }
  });

  test("passes with OLLAMA_API_KEY set", () => {
    const original = process.env.OLLAMA_API_KEY;
    process.env.OLLAMA_API_KEY = "test-key";
    try {
      expect(() => validateConfig()).not.toThrow();
    } finally {
      if (original !== undefined) {
        process.env.OLLAMA_API_KEY = original;
      } else {
        delete process.env.OLLAMA_API_KEY;
      }
    }
  });

  test("throws when OLLAMA_API_KEY is missing and MOCK_LLM is not 1", () => {
    const original = process.env.OLLAMA_API_KEY;
    const originalMock = process.env.MOCK_LLM;
    delete process.env.OLLAMA_API_KEY;
    process.env.MOCK_LLM = "0";
    try {
      expect(() => validateConfig()).toThrow("Missing OLLAMA_API_KEY");
    } finally {
      if (original !== undefined) {
        process.env.OLLAMA_API_KEY = original;
      } else {
        delete process.env.OLLAMA_API_KEY;
      }
      if (originalMock !== undefined) {
        process.env.MOCK_LLM = originalMock;
      } else {
        delete process.env.MOCK_LLM;
      }
    }
  });
});

describe("Config — retention/timeout relationship validation", () => {
  async function importFreshConfig(env: Record<string, string>) {
    const originals: Record<string, string | undefined> = {};
    for (const [key, value] of Object.entries(env)) {
      originals[key] = process.env[key];
      process.env[key] = value;
    }
    try {
      return await import(
        `../src/backend/config?t=${Date.now()}-${Math.random()}`
      );
    } finally {
      for (const [key, value] of Object.entries(originals)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    }
  }

  test("rejects JOB_TTL_MS < DIAGNOSIS_TIMEOUT_MS", async () => {
    const savedMock = process.env.MOCK_LLM;
    process.env.MOCK_LLM = "1";
    try {
      const mod = await importFreshConfig({
        JOB_TTL_MS: "300000",
        DIAGNOSIS_TIMEOUT_MS: "900000",
      });
      expect(() => mod.validateConfig()).toThrow("JOB_TTL_MS");
      expect(() => mod.validateConfig()).toThrow("300000");
      expect(() => mod.validateConfig()).toThrow("900000");
    } finally {
      if (savedMock === undefined) delete process.env.MOCK_LLM;
      else process.env.MOCK_LLM = savedMock;
    }
  });

  test("rejects PENDING_JOB_TIMEOUT_MS < DIAGNOSIS_TIMEOUT_MS", async () => {
    const savedMock = process.env.MOCK_LLM;
    process.env.MOCK_LLM = "1";
    try {
      const mod = await importFreshConfig({
        PENDING_JOB_TIMEOUT_MS: "60000",
        DIAGNOSIS_TIMEOUT_MS: "900000",
      });
      expect(() => mod.validateConfig()).toThrow("PENDING_JOB_TIMEOUT_MS");
      expect(() => mod.validateConfig()).toThrow("60000");
      expect(() => mod.validateConfig()).toThrow("900000");
    } finally {
      if (savedMock === undefined) delete process.env.MOCK_LLM;
      else process.env.MOCK_LLM = savedMock;
    }
  });

  test("accepts JOB_TTL_MS equal to DIAGNOSIS_TIMEOUT_MS", async () => {
    const savedMock = process.env.MOCK_LLM;
    process.env.MOCK_LLM = "1";
    try {
      const mod = await importFreshConfig({
        JOB_TTL_MS: "900000",
        DIAGNOSIS_TIMEOUT_MS: "900000",
      });
      expect(() => mod.validateConfig()).not.toThrow();
    } finally {
      if (savedMock === undefined) delete process.env.MOCK_LLM;
      else process.env.MOCK_LLM = savedMock;
    }
  });

  test("accepts PENDING_JOB_TIMEOUT_MS equal to DIAGNOSIS_TIMEOUT_MS", async () => {
    const savedMock = process.env.MOCK_LLM;
    process.env.MOCK_LLM = "1";
    try {
      const mod = await importFreshConfig({
        PENDING_JOB_TIMEOUT_MS: "900000",
        DIAGNOSIS_TIMEOUT_MS: "900000",
      });
      expect(() => mod.validateConfig()).not.toThrow();
    } finally {
      if (savedMock === undefined) delete process.env.MOCK_LLM;
      else process.env.MOCK_LLM = savedMock;
    }
  });

  test("PENDING_JOB_TIMEOUT_MS defaults to DIAGNOSIS_TIMEOUT_MS + 120000", async () => {
    const savedMock = process.env.MOCK_LLM;
    process.env.MOCK_LLM = "1";
    try {
      const mod = await importFreshConfig({
        DIAGNOSIS_TIMEOUT_MS: "900000",
      });
      expect(mod.PENDING_JOB_TIMEOUT_MS).toBe(900_000 + 120_000);
      expect(() => mod.validateConfig()).not.toThrow();
    } finally {
      if (savedMock === undefined) delete process.env.MOCK_LLM;
      else process.env.MOCK_LLM = savedMock;
    }
  });
});
