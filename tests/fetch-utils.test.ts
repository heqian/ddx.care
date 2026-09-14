import {
  test,
  expect,
  describe,
  beforeAll,
  afterAll,
  afterEach,
  vi,
} from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fetchJSON } from "../src/backend/tools/utils/fetch";
import {
  initToolCache,
  resetToolCache,
} from "../src/backend/tools/utils/tool-cache";

// Save original fetch
const originalFetch = globalThis.fetch;

afterEach(() => {
  // Restore fetch after each test
  globalThis.fetch = originalFetch;
  resetToolCache();
});

describe("fetchJSON — Success Cases", () => {
  test("returns parsed JSON on successful response", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: "hello" }),
    }) as any;

    const result = await fetchJSON("https://example.com/api");
    expect(result).toEqual({ data: "hello" });
  });

  test("passes through fetch options", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    });
    globalThis.fetch = mockFetch as any;

    await fetchJSON("https://example.com/api", {
      method: "POST",
      headers: { "X-Custom": "header" },
    });

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const callArgs = mockFetch.mock.calls[0];
    expect(callArgs[1].method).toBe("POST");
    expect(callArgs[1].headers).toEqual({ "X-Custom": "header" });
  });
});

describe("fetchJSON — Error Handling", () => {
  test("throws on non-200 response with status info", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      statusText: "Internal Server Error",
    }) as any;

    await expect(fetchJSON("https://example.com/api")).rejects.toThrow(
      "API error: 500 Internal Server Error",
    );
  });

  test("uses custom errorPrefix in error message", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      statusText: "Service Unavailable",
    }) as any;

    await expect(
      fetchJSON("https://example.com/api", { errorPrefix: "RxNav" }),
    ).rejects.toThrow("RxNav error: 503 Service Unavailable");
  });

  test("returns error object on 404 when ignore404 is true", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as any;

    const result = await fetchJSON("https://example.com/api", {
      ignore404: true,
    });
    expect(result).toEqual({ error: true, results: [] });
  });

  test("throws on 404 when ignore404 is false (default)", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      statusText: "Not Found",
    }) as any;

    await expect(fetchJSON("https://example.com/api")).rejects.toThrow(
      "API error: 404 Not Found",
    );
  });
});

describe("fetchJSON — Timeout", () => {
  test("throws on timeout", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(async (_url: string, opts: any) => {
        // Wait until the abort signal fires
        return new Promise((_, reject) => {
          opts.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }) as any;

    await expect(
      fetchJSON("https://slow.example.com/api", { timeoutMs: 50 }),
    ).rejects.toThrow(/timeout/i);
  });
});

describe("fetchJSON — PHI redaction in logs and errors", () => {
  const tmpDir = mkdtempSync(join(tmpdir(), "fetch-redact-"));

  beforeAll(() => {
    // fetchJSON only logs tool_cache_hit when the cache is initialized
    process.env.TOOL_CACHE_DB_PATH = join(
      tmpDir,
      `redact-${Date.now()}.sqlite`,
    );
    initToolCache();
  });

  afterAll(() => {
    rmSync(tmpDir, { recursive: true, force: true });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    resetToolCache();
  });

  test("cache-hit log lines contain the hashed key, never the URL", async () => {
    const url = "https://example.com/api?condition=hiv+tuberculosis";
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ data: "x" }),
    }) as any;
    await fetchJSON(url); // populate cache

    const logs: string[] = [];
    const spy = vi.spyOn(console, "log").mockImplementation((...args) => {
      logs.push(args.join(" "));
    });
    try {
      await fetchJSON(url); // cache hit → tool_cache_hit log line
    } finally {
      spy.mockRestore();
    }

    const hitLine = logs.find((l) => l.includes("tool_cache_hit"));
    expect(hitLine).toBeDefined();
    // PHI-derived query terms must never reach the log
    expect(hitLine).not.toContain("condition=hiv");
    expect(hitLine).not.toContain(url);
    // The log carries the SHA-256 cache key instead
    expect(hitLine).toMatch(/[0-9a-f]{64}/);
  });

  test("timeout error messages strip the query string", async () => {
    globalThis.fetch = vi
      .fn()
      .mockImplementation(async (_url: string, opts: any) => {
        return new Promise((_, reject) => {
          opts.signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        });
      }) as any;

    try {
      await fetchJSON("https://slow.example.com/api?drug=warfarin", {
        timeoutMs: 50,
      });
      expect.unreachable("expected timeout");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      const message = (error as Error).message;
      expect(message).toContain("slow.example.com/api");
      expect(message).not.toContain("drug=warfarin");
    }
  });
});
