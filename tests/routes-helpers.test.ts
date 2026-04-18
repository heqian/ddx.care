import { test, expect, describe } from "bun:test";

describe("getClientIp", () => {
  function getClientIp(headers: Record<string, string | null>, socketIp?: string): string {
    const forwarded = headers["x-forwarded-for"];
    if (forwarded) {
      const parts = forwarded.split(",");
      return parts[parts.length - 1].trim();
    }
    return socketIp || "unknown";
  }

  test("extracts IP from x-forwarded-for with single IP", () => {
    expect(getClientIp({ "x-forwarded-for": "1.2.3.4" })).toBe("1.2.3.4");
  });

  test("extracts rightmost IP from x-forwarded-for chain (appended by proxy)", () => {
    expect(
      getClientIp({ "x-forwarded-for": "1.2.3.4, 5.6.7.8, 9.10.11.12" }),
    ).toBe("9.10.11.12");
  });

  test("trims whitespace from x-forwarded-for", () => {
    expect(getClientIp({ "x-forwarded-for": "  1.2.3.4  " })).toBe("1.2.3.4");
  });

  test("falls back to socket IP when no x-forwarded-for header", () => {
    expect(getClientIp({}, "192.168.1.5")).toBe("192.168.1.5");
  });

  test("returns unknown when no x-forwarded-for and no socket IP", () => {
    expect(getClientIp({})).toBe("unknown");
  });
});

describe("corsHeaders", () => {
  function corsHeaders(allowedOrigins: string): Record<string, string> {
    return {
      "Access-Control-Allow-Origin": allowedOrigins,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
  }

  test("returns all CORS headers with configured origin", () => {
    const headers = corsHeaders("https://app.ddx.care");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://app.ddx.care");
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST, OPTIONS");
    expect(headers["Access-Control-Allow-Headers"]).toBe("Content-Type");
  });

  test("returns wildcard origin when configured", () => {
    const headers = corsHeaders("*");
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
  });
});

describe("diagnoseSchema validation", () => {
  test("rejects missing required fields", async () => {
    const { z } = await import("zod");
    const MAX_INPUT_FIELD_LENGTH = 50_000;
    const schema = z.object({
      medicalHistory: z.string().max(MAX_INPUT_FIELD_LENGTH),
      conversationTranscript: z.string().max(MAX_INPUT_FIELD_LENGTH),
      labResults: z.string().max(MAX_INPUT_FIELD_LENGTH),
    });

    const result = schema.safeParse({});
    expect(result.success).toBe(false);
  });

  test("accepts valid input", async () => {
    const { z } = await import("zod");
    const MAX_INPUT_FIELD_LENGTH = 50_000;
    const schema = z.object({
      medicalHistory: z.string().max(MAX_INPUT_FIELD_LENGTH),
      conversationTranscript: z.string().max(MAX_INPUT_FIELD_LENGTH),
      labResults: z.string().max(MAX_INPUT_FIELD_LENGTH),
    });

    const result = schema.safeParse({
      medicalHistory: "Patient has hypertension",
      conversationTranscript: "Headache for 3 days",
      labResults: "BP: 140/90",
    });
    expect(result.success).toBe(true);
  });

  test("rejects fields exceeding max length", async () => {
    const { z } = await import("zod");
    const MAX_INPUT_FIELD_LENGTH = 50_000;
    const schema = z.object({
      medicalHistory: z.string().max(MAX_INPUT_FIELD_LENGTH),
      conversationTranscript: z.string().max(MAX_INPUT_FIELD_LENGTH),
      labResults: z.string().max(MAX_INPUT_FIELD_LENGTH),
    });

    const result = schema.safeParse({
      medicalHistory: "x".repeat(51_000),
      conversationTranscript: "ok",
      labResults: "ok",
    });
    expect(result.success).toBe(false);
  });

  test("rejects non-string fields", async () => {
    const { z } = await import("zod");
    const MAX_INPUT_FIELD_LENGTH = 50_000;
    const schema = z.object({
      medicalHistory: z.string().max(MAX_INPUT_FIELD_LENGTH),
      conversationTranscript: z.string().max(MAX_INPUT_FIELD_LENGTH),
      labResults: z.string().max(MAX_INPUT_FIELD_LENGTH),
    });

    const result = schema.safeParse({
      medicalHistory: 123,
      conversationTranscript: "ok",
      labResults: "ok",
    });
    expect(result.success).toBe(false);
  });
});
