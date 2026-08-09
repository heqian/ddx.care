import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "*.spec.ts",
  timeout: 30_000,
  retries: 0,
  use: {
    baseURL: `http://localhost:${process.env.PORT || 3999}`,
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  webServer: {
    command: "MOCK_LLM=1 PORT=3999 bun index.ts",
    port: Number(process.env.PORT) || 3999,
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
    env: {
      MOCK_LLM: "1",
      PORT: "3999",
      // The E2E suite fires many submissions (often in parallel) against a
      // single reused server. Relax the per-IP and concurrency limits so the
      // suite's own traffic never trips the production rate limiter.
      RATE_LIMIT_MAX_REQUESTS: "200",
      RATE_LIMIT_WINDOW_MS: "60000",
      MAX_CONCURRENT_WORKFLOWS: "50",
      WS_TOKEN_SECRET: "e2e-job-context-secret",
    },
  },
});
