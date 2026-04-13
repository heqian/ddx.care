/**
 * Unit tests for WebSocket origin validation logic.
 *
 * These tests directly verify the origin checking behavior without needing
 * a separate server instance with different ALLOWED_ORIGINS config.
 */
import { test, expect, describe } from "bun:test";

/**
 * Extracted origin validation logic matching routes.ts implementation.
 * This mirrors the exact check in the /ws route handler.
 */
function isOriginAllowed(
  allowedOrigins: string,
  requestOrigin: string | null,
): boolean {
  if (allowedOrigins === "*") return true;
  if (!requestOrigin) return false;
  const allowed = allowedOrigins.split(",").map((o) => o.trim());
  return allowed.includes(requestOrigin);
}

describe("WebSocket origin validation logic", () => {
  describe("wildcard mode (ALLOWED_ORIGINS='*')", () => {
    test("allows any origin", () => {
      expect(isOriginAllowed("*", "https://evil.example.com")).toBe(true);
    });

    test("allows null origin", () => {
      expect(isOriginAllowed("*", null)).toBe(true);
    });
  });

  describe("restricted mode", () => {
    const ORIGINS = "https://app.ddx.care,https://staging.ddx.care";

    test("rejects request with no origin", () => {
      expect(isOriginAllowed(ORIGINS, null)).toBe(false);
    });

    test("rejects disallowed origin", () => {
      expect(isOriginAllowed(ORIGINS, "https://evil.example.com")).toBe(false);
    });

    test("allows first listed origin", () => {
      expect(isOriginAllowed(ORIGINS, "https://app.ddx.care")).toBe(true);
    });

    test("allows second listed origin", () => {
      expect(isOriginAllowed(ORIGINS, "https://staging.ddx.care")).toBe(true);
    });

    test("rejects origin that is a substring of allowed", () => {
      expect(isOriginAllowed(ORIGINS, "https://app.ddx.care.evil.com")).toBe(
        false,
      );
    });

    test("rejects origin with different scheme", () => {
      expect(isOriginAllowed(ORIGINS, "http://app.ddx.care")).toBe(false);
    });

    test("handles whitespace in origin list", () => {
      const origins = "https://a.com , https://b.com";
      expect(isOriginAllowed(origins, "https://a.com")).toBe(true);
      expect(isOriginAllowed(origins, "https://b.com")).toBe(true);
    });

    test("is case-sensitive", () => {
      expect(
        isOriginAllowed("https://App.DDX.Care", "https://app.ddx.care"),
      ).toBe(false);
    });

    test("rejects empty origin list", () => {
      expect(isOriginAllowed("", "https://app.ddx.care")).toBe(false);
    });

    test("rejects origin with trailing slash mismatch", () => {
      expect(
        isOriginAllowed("https://app.ddx.care", "https://app.ddx.care/"),
      ).toBe(false);
    });

    test("rejects origin with port number", () => {
      expect(
        isOriginAllowed("https://app.ddx.care", "https://app.ddx.care:443"),
      ).toBe(false);
    });
  });

  describe("single origin mode", () => {
    test("allows exact match", () => {
      expect(
        isOriginAllowed("https://app.ddx.care", "https://app.ddx.care"),
      ).toBe(true);
    });

    test("rejects non-match", () => {
      expect(isOriginAllowed("https://app.ddx.care", "https://other.com")).toBe(
        false,
      );
    });
  });
});

describe("WebSocket origin validation (integration — wildcard mode)", () => {
  let BASE: string;

  test("GET /ws allows any origin when ALLOWED_ORIGINS is wildcard", async () => {
    process.env.MOCK_LLM = "1";
    process.env.PORT = "3997";

    const { server } = await import("../index");
    BASE = `http://localhost:${server.port}`;

    const res = await fetch(`${BASE}/ws?jobId=ws-origin-test`, {
      headers: { Origin: "https://evil.example.com" },
    });
    // Should NOT be 403 — wildcard mode allows everything
    expect(res.status).not.toBe(403);
  });

  test("GET /ws returns 400 without jobId", async () => {
    process.env.MOCK_LLM = "1";
    process.env.PORT = "3997";

    const { server } = await import("../index");
    BASE = `http://localhost:${server.port}`;

    const res = await fetch(`${BASE}/ws`);
    expect(res.status).toBe(400);
  });
});
