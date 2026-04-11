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
    command: "MOCK_LLM=1 bun index.ts",
    port: Number(process.env.PORT) || 3999,
    reuseExistingServer: !process.env.CI,
    timeout: 10_000,
  },
});
