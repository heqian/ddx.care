/**
 * Integration tests for WebSocket ticket validation on the /ws upgrade.
 *
 * This file starts a server with WS_TOKEN_SECRET set, enabling ticket
 * verification on the /ws GET handler. Must be run separately from the main
 * test suite (Bun shares the module registry; see rest-token.test.ts for
 * the same constraint).
 *
 * Run:  bun run test:ws-ticket
 */
import { test, expect, describe, beforeAll } from "bun:test";

// Set env vars BEFORE any module imports that read config. In ESM, top-level
// imports are hoisted, so we cannot `import` ws-token here — it would cache
// config with empty env vars. Use lazy `await import()` inside test blocks.
process.env.MOCK_LLM = "1";
process.env.PORT = "3995";
process.env.WS_TOKEN_SECRET = "ws-ticket-test-secret";
process.env.TOOL_CACHE_TTL_MS = "0";
process.env.ORPHADATA_ENABLED = "0";
process.env.RATE_LIMIT_MAX_REQUESTS = "100";
process.env.MAX_CONCURRENT_WORKFLOWS = "20";

let BASE: string;
const VALID_ORIGIN = "http://localhost:3995";

// Lazy-loaded token primitives — imported after env vars are set so the
// config module caches the correct WS_TOKEN_SECRET.
let generateWsTicket: typeof import("../src/backend/utils/ws-token").generateWsTicket;

async function loadTokenPrimitives() {
  const mod = await import("../src/backend/utils/ws-token");
  generateWsTicket = mod.generateWsTicket;
}

async function createJob(): Promise<{
  jobId: string;
  token: string;
  wsTicket: string;
}> {
  const res = await fetch(`${BASE}/v1/diagnose`, {
    method: "POST",
    body: JSON.stringify({
      medicalHistory: "ws ticket integration test",
      conversationTranscript: "test",
      labResults: "test",
    }),
    headers: { "Content-Type": "application/json" },
  });
  if (res.status !== 202) {
    throw new Error(`Failed to create job: ${res.status}`);
  }
  return (await res.json()) as {
    jobId: string;
    token: string;
    wsTicket: string;
  };
}

describe("WebSocket ticket validation (integration with WS_TOKEN_SECRET)", () => {
  beforeAll(async () => {
    await loadTokenPrimitives();
    const { server } = await import("../index");
    BASE = `http://localhost:${server.port}`;
  });

  test("valid ticket within TTL allows upgrade (not 403)", async () => {
    const { jobId, wsTicket } = await createJob();
    const res = await fetch(`${BASE}/ws?jobId=${jobId}&ticket=${wsTicket}`, {
      headers: { Origin: VALID_ORIGIN },
    });
    // 101 = upgrade success; 426 = upgrade available (Bun returns 426 for
    // plain HTTP without the WebSocket protocol upgrade). Any non-403
    // status means the ticket was accepted and the request reached the
    // upgrade step.
    expect(res.status).not.toBe(403);
  });

  test("expired ticket is rejected with 403", async () => {
    const { jobId } = await createJob();
    // Mint a ticket that expired 5 seconds ago.
    const expiredTicket = generateWsTicket(jobId, 1, Date.now() - 5000);
    const res = await fetch(
      `${BASE}/ws?jobId=${jobId}&ticket=${expiredTicket}`,
      { headers: { Origin: VALID_ORIGIN } },
    );
    expect(res.status).toBe(403);
  });

  test("invalid ticket is rejected with 403", async () => {
    const { jobId } = await createJob();
    const res = await fetch(
      `${BASE}/ws?jobId=${jobId}&ticket=not-a-real-ticket`,
      { headers: { Origin: VALID_ORIGIN } },
    );
    expect(res.status).toBe(403);
  });

  test("ticket bound to a different job is rejected with 403", async () => {
    const { jobId } = await createJob();
    const crossTicket = generateWsTicket("different-job-id");
    const res = await fetch(`${BASE}/ws?jobId=${jobId}&ticket=${crossTicket}`, {
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(403);
  });

  test("missing ticket and missing token returns 403", async () => {
    const { jobId } = await createJob();
    const res = await fetch(`${BASE}/ws?jobId=${jobId}`, {
      headers: { Origin: VALID_ORIGIN },
    });
    expect(res.status).toBe(403);
  });

  test("long-lived token still accepted as migration fallback", async () => {
    const { jobId, token } = await createJob();
    const res = await fetch(`${BASE}/ws?jobId=${jobId}&token=${token}`, {
      headers: { Origin: VALID_ORIGIN },
    });
    // Token fallback must still work during the migration window.
    expect(res.status).not.toBe(403);
  });

  test("ticket takes precedence over an invalid token", async () => {
    const { jobId, wsTicket } = await createJob();
    // Valid ticket + invalid token — ticket must win
    const res = await fetch(
      `${BASE}/ws?jobId=${jobId}&ticket=${wsTicket}&token=invalid`,
      { headers: { Origin: VALID_ORIGIN } },
    );
    expect(res.status).not.toBe(403);
  });
});

describe("Dev mode /ws (no WS_TOKEN_SECRET)", () => {
  // This is covered by api.test.ts (dev-mode server). Here we only assert
  // the integration server's behavior under WS_TOKEN_SECRET is set, which
  // is the precondition for ticket validation.
  test("integration server has WS_TOKEN_SECRET set", () => {
    expect(process.env.WS_TOKEN_SECRET).toBeTruthy();
  });
});
