import { test, expect, describe, beforeEach, afterEach, vi } from "bun:test";
import { fetchJSON } from "../src/backend/tools/utils/fetch";
import { resetToolCache } from "../src/backend/tools/utils/tool-cache";

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
