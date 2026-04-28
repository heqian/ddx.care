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
  if (!requestOrigin) return false;
  if (allowedOrigins === "*") return true;
  const allowed = allowedOrigins.split(",").map((o) => o.trim());
  return allowed.includes(requestOrigin);
}

describe("WebSocket origin validation logic", () => {
  describe("wildcard mode (ALLOWED_ORIGINS='*')", () => {
    test("allows any origin", () => {
      expect(isOriginAllowed("*", "https://evil.example.com")).toBe(true);
    });

    test("rejects null origin — browsers always send Origin for WebSocket upgrades", () => {
      expect(isOriginAllowed("*", null)).toBe(false);
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

describe("WebSocket token authentication logic", () => {
  function generateToken(jobId: string, secret: string): string {
    if (!secret) return "";
    const { createHmac } = require("node:crypto");
    return createHmac("sha256", secret).update(jobId).digest("hex");
  }

  function verifyToken(
    jobId: string,
    token: string,
    secret: string,
  ): boolean {
    if (!secret) return true;
    const expected = generateToken(jobId, secret);
    if (!expected || !token) return false;
    if (expected.length !== token.length) return false;
    const { timingSafeEqual } = require("node:crypto");
    return timingSafeEqual(Buffer.from(expected), Buffer.from(token));
  }

  test("generateToken produces consistent HMAC for same jobId", () => {
    const token1 = generateToken("job-123", "test-secret-key");
    const token2 = generateToken("job-123", "test-secret-key");
    expect(token1).toBe(token2);
    expect(token1.length).toBeGreaterThan(0);
  });

  test("verifyToken returns true for valid token", () => {
    const token = generateToken("job-456", "test-secret-key");
    expect(verifyToken("job-456", token, "test-secret-key")).toBe(true);
  });

  test("verifyToken returns false for wrong token", () => {
    expect(
      verifyToken("job-456", "invalid-token", "test-secret-key"),
    ).toBe(false);
  });

  test("verifyToken returns false for token from different jobId", () => {
    const token = generateToken("job-A", "test-secret-key");
    expect(verifyToken("job-B", token, "test-secret-key")).toBe(false);
  });

  test("verifyToken returns true when secret is empty (dev mode)", () => {
    expect(verifyToken("job-123", "any-token", "")).toBe(true);
  });

  test("generateToken returns empty string when secret is empty", () => {
    expect(generateToken("job-123", "")).toBe("");
  });

  test("different secrets produce different tokens", () => {
    const token1 = generateToken("job-123", "secret-A");
    const token2 = generateToken("job-123", "secret-B");
    expect(token1).not.toBe(token2);
  });

  test("TRUSTED_ORIGINS takes precedence over ALLOWED_ORIGINS for WS", () => {
    const isOriginAllowed = (
      trustedOrigins: string,
      allowedOrigins: string,
      requestOrigin: string | null,
    ): boolean => {
      if (!requestOrigin) return false;
      const originsList = trustedOrigins
        ? trustedOrigins
            .split(",")
            .map((o) => o.trim())
        : allowedOrigins === "*"
          ? null
          : allowedOrigins
              .split(",")
              .map((o) => o.trim());
      if (!originsList) return true;
      return originsList.includes(requestOrigin);
    };

    expect(
      isOriginAllowed("https://ddx.care", "*", "https://ddx.care"),
    ).toBe(true);
    expect(
      isOriginAllowed("https://ddx.care", "*", "https://evil.com"),
    ).toBe(false);
    expect(
      isOriginAllowed("", "https://other.com", "https://other.com"),
    ).toBe(true);
    expect(isOriginAllowed("", "*", "https://anything.com")).toBe(true);
  });
});
