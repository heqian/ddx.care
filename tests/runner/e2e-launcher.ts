/**
 * E2E launcher for Playwright isolation.
 *
 * Every Playwright invocation starts and stops a new child server with
 * `reuseExistingServer` disabled, a dedicated port, and one unique temporary
 * root exported as `APP_DATA_DIR`, distinct from every other child. The
 * launcher assigns explicit absolute job/cache/Orphadata/audit leaves
 * beneath that root without implementing application resolver semantics.
 * The server uses mock LLM mode, cache TTL zero with no cache key, and
 * disabled Orphadata. The server and browser allow loopback traffic only.
 */

import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";

export interface E2ELaunchResult {
  /** Unique canonical absolute temporary root. */
  root: string;
  /** Allocated port for the child server. */
  port: number;
  /** Environment for the child server. */
  env: Record<string, string>;
  /** Cleanup function: recursively removes only this server's data root. */
  cleanup: () => void;
}

/** Allocate an available TCP port on loopback. */
export function allocatePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const srv = createServer();
    srv.unref();
    srv.on("error", reject);
    srv.listen(0, "127.0.0.1", () => {
      const addr = srv.address();
      if (addr && typeof addr === "object") {
        const port = addr.port;
        srv.close(() => resolve(port));
      } else {
        srv.close();
        reject(new Error("Could not allocate port"));
      }
    });
  });
}

export interface E2ELaunchOptions {
  /** Override the port (otherwise a free port is allocated). */
  port?: number;
  /** Mock LLM mode (default true). */
  mockLlm?: boolean;
  /** Extra environment overrides. */
  extraEnv?: Record<string, string>;
}

export async function launchE2EServer(
  opts: E2ELaunchOptions = {},
): Promise<E2ELaunchResult> {
  const root = mkdtempSync(join(tmpdir(), "ddx-e2e-"));
  const port = opts.port ?? (await allocatePort());

  const env: Record<string, string> = {};
  // Scrub inherited data-root/path/secret/port/live-run values.
  const scrubbed = [
    "APP_DATA_DIR",
    "DB_PATH",
    "TOOL_CACHE_DB_PATH",
    "TOOL_CACHE_KEY_SECRET",
    "ORPHADATA_DB_PATH",
    "ORPHADATA_ENABLED",
    "AUDIT_LOG_PATH",
    "WS_TOKEN_SECRET",
    "PORT",
    "MOCK_LLM",
    "TOOL_CACHE_TTL_MS",
    "RUN_INTEGRATION",
    "RUN_CONTRACT",
  ];
  for (const [k, v] of Object.entries(process.env)) {
    if (scrubbed.includes(k)) continue;
    if (v !== undefined) env[k] = v;
  }

  env.APP_DATA_DIR = root;
  env.DB_PATH = join(root, "jobs.sqlite");
  env.TOOL_CACHE_DB_PATH = join(root, "tool-cache.sqlite");
  env.TOOL_CACHE_TTL_MS = "0";
  env.TOOL_CACHE_KEY_SECRET = "";
  env.ORPHADATA_DB_PATH = join(root, "orphadata.sqlite");
  env.ORPHADATA_ENABLED = "0";
  env.AUDIT_LOG_PATH = "";
  env.MOCK_LLM = opts.mockLlm === false ? "" : "1";
  env.PORT = String(port);
  // Relax rate limits for E2E suite traffic.
  env.RATE_LIMIT_MAX_REQUESTS = env.RATE_LIMIT_MAX_REQUESTS ?? "200";
  env.RATE_LIMIT_WINDOW_MS = env.RATE_LIMIT_WINDOW_MS ?? "60000";
  env.MAX_CONCURRENT_WORKFLOWS = env.MAX_CONCURRENT_WORKFLOWS ?? "50";
  env.WS_TOKEN_SECRET = env.WS_TOKEN_SECRET ?? "e2e-isolated-secret";

  for (const [k, v] of Object.entries(opts.extraEnv ?? {})) {
    env[k] = v;
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // best-effort
    }
  };

  return { root, port, env, cleanup };
}
