import { describe, expect, test } from "bun:test";

describe("WebSocket origin validation (integration — wildcard mode)", () => {
  test("GET /ws allows any origin when ALLOWED_ORIGINS is wildcard", async () => {
    process.env.MOCK_LLM = "1";
    process.env.PORT = "3997";

    const { server } = await import("../index");
    const base = `http://localhost:${server.port}`;

    const res = await fetch(`${base}/ws?jobId=ws-origin-test`, {
      headers: { Origin: "https://evil.example.com" },
    });
    expect(res.status).not.toBe(403);
  });

  test("GET /ws returns 400 without jobId", async () => {
    process.env.MOCK_LLM = "1";
    process.env.PORT = "3997";

    const { server } = await import("../index");
    const base = `http://localhost:${server.port}`;

    const res = await fetch(`${base}/ws`);
    expect(res.status).toBe(400);
  });
});
