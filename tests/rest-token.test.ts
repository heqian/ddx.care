/**
 * Integration tests for REST endpoint HMAC token verification.
 *
 * This file starts a server with WS_TOKEN_SECRET set, enabling token
 * verification on GET /v1/status/:jobId and DELETE /v1/diagnose/:jobId.
 *
 * NOTE: This file must be run separately from the main test suite because Bun
 * shares the module registry across test files in a single invocation. When
 * run alongside api.test.ts (which starts a dev-mode server), the config module
 * is already cached with WS_TOKEN_SECRET="" and this file's env vars have no
 * effect. The pure-function token verification tests in api.test.ts cover CI.
 *
 * Run:  bun run test:rest-token
 */
import { test, expect, describe, beforeAll } from "bun:test";
import { createHmac } from "node:crypto";

process.env.MOCK_LLM = "1";
process.env.PORT = "3996";
process.env.WS_TOKEN_SECRET = "integration-test-secret";
process.env.TOOL_CACHE_TTL_MS = "0";
process.env.ORPHADATA_ENABLED = "0";
process.env.RATE_LIMIT_MAX_REQUESTS = "100";
process.env.MAX_CONCURRENT_WORKFLOWS = "20";

const SECRET = "integration-test-secret";
let BASE: string;

function makeToken(jobId: string): string {
  return createHmac("sha256", SECRET).update(jobId).digest("hex");
}

const UNKNOWN_UUID = "00000000-0000-4000-a000-000000000000";

async function createJob(
  history: string,
): Promise<{ jobId: string; token: string }> {
  const res = await fetch(`${BASE}/v1/diagnose`, {
    method: "POST",
    body: JSON.stringify({
      medicalHistory: history,
      conversationTranscript: "test",
      labResults: "test",
    }),
    headers: { "Content-Type": "application/json" },
  });
  if (res.status !== 202) {
    throw new Error(`Failed to create job: ${res.status}`);
  }
  const { jobId } = (await res.json()) as { jobId: string };
  return { jobId, token: makeToken(jobId) };
}

describe("REST token verification (integration with WS_TOKEN_SECRET)", () => {
  beforeAll(async () => {
    const { server } = await import("../index");
    BASE = `http://localhost:${server.port}`;
  });

  describe("GET /v1/status/:jobId", () => {
    test("valid token returns 200", async () => {
      const { jobId, token } = await createJob("valid token test");
      const res = await fetch(`${BASE}/v1/status/${jobId}?token=${token}`);
      expect(res.status).toBe(200);
    });

    test("missing token returns 403", async () => {
      const { jobId } = await createJob("missing token test");
      const res = await fetch(`${BASE}/v1/status/${jobId}`);
      expect(res.status).toBe(403);
      const body = (await res.json()) as { error: string };
      expect(body.error).toContain("token");
    });

    test("invalid token returns 403", async () => {
      const { jobId } = await createJob("invalid token test");
      const res = await fetch(`${BASE}/v1/status/${jobId}?token=invalid-hex`);
      expect(res.status).toBe(403);
    });

    test("token verified before existence — unknown job with bad token returns 403 not 404", async () => {
      const res = await fetch(`${BASE}/v1/status/${UNKNOWN_UUID}?token=bad`);
      expect(res.status).toBe(403);
    });

    test("valid token on unknown job returns 404 (not 403)", async () => {
      const token = makeToken(UNKNOWN_UUID);
      const res = await fetch(
        `${BASE}/v1/status/${UNKNOWN_UUID}?token=${token}`,
      );
      expect(res.status).toBe(404);
    });

    test("token from different job is rejected", async () => {
      const { jobId } = await createJob("cross-job token test");
      const crossToken = makeToken(UNKNOWN_UUID);
      const res = await fetch(`${BASE}/v1/status/${jobId}?token=${crossToken}`);
      expect(res.status).toBe(403);
    });

    test("malformed job ID returns 400 regardless of token", async () => {
      const res = await fetch(`${BASE}/v1/status/bad-id?token=whatever`);
      expect(res.status).toBe(400);
    });
  });

  describe("DELETE /v1/diagnose/:jobId", () => {
    test("valid token cancels the job", async () => {
      const { jobId, token } = await createJob("delete valid token test");
      const delRes = await fetch(
        `${BASE}/v1/diagnose/${jobId}?token=${token}`,
        {
          method: "DELETE",
        },
      );
      expect(delRes.status).toBe(200);
      const body = (await delRes.json()) as { status: string };
      expect(body.status).toBe("cancelled");
    });

    test("missing token returns 403 and does not cancel", async () => {
      const { jobId, token } = await createJob("delete missing token test");
      const delRes = await fetch(`${BASE}/v1/diagnose/${jobId}`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(403);

      // Verify the job was NOT cancelled — it should still be accessible
      const statusRes = await fetch(
        `${BASE}/v1/status/${jobId}?token=${token}`,
      );
      expect(statusRes.status).toBe(200);
      const statusBody = (await statusRes.json()) as { status: string };
      expect(statusBody.status).not.toBe("failed");
    });

    test("invalid token returns 403", async () => {
      const { jobId } = await createJob("delete invalid token test");
      const delRes = await fetch(`${BASE}/v1/diagnose/${jobId}?token=invalid`, {
        method: "DELETE",
      });
      expect(delRes.status).toBe(403);
    });
  });
});
