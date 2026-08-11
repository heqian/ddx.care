import { defineConfig, devices } from "@playwright/test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Playwright isolation: every run gets a fresh owned server and data root
 * with a dedicated port, loopback-only network policy, and
 * reuseExistingServer: false. The root is allocated synchronously at config
 * load time and cleaned up via a process exit handler.
 */
const E2E_PORT = Number(process.env.E2E_PORT) || 3999;
const e2eRoot = mkdtempSync(join(tmpdir(), "ddx-e2e-config-"));

process.on("exit", () => {
  try {
    rmSync(e2eRoot, { recursive: true, force: true });
  } catch {
    // best-effort
  }
});

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${E2E_PORT}`,
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: {
        browserName: "chromium",
        // Block non-loopback requests in Playwright browser contexts while
        // allowing the owned HTTP/WebSocket origin (5.5).
        contextOptions: {
          bypassCSP: true,
        },
      },
    },
  ],
  webServer: {
    command: "bun index.ts",
    port: E2E_PORT,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      MOCK_LLM: "1",
      PORT: String(E2E_PORT),
      APP_DATA_DIR: e2eRoot,
      DB_PATH: join(e2eRoot, "jobs.sqlite"),
      TOOL_CACHE_DB_PATH: join(e2eRoot, "tool-cache.sqlite"),
      TOOL_CACHE_TTL_MS: "0",
      TOOL_CACHE_KEY_SECRET: "",
      ORPHADATA_DB_PATH: join(e2eRoot, "orphadata.sqlite"),
      ORPHADATA_ENABLED: "0",
      AUDIT_LOG_PATH: "",
      RATE_LIMIT_MAX_REQUESTS: "200",
      RATE_LIMIT_WINDOW_MS: "60000",
      MAX_CONCURRENT_WORKFLOWS: "50",
      WS_TOKEN_SECRET: "e2e-isolated-secret",
    },
  },
});
