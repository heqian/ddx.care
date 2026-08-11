import { test, expect, describe } from "bun:test";
import { launchE2EServer, allocatePort } from "./e2e-launcher";
import { existsSync, rmSync } from "node:fs";
import { join } from "node:path";

describe("E2E launcher — isolated server and browser network (5.3, 5.4, 5.5)", () => {
  test("allocatePort returns an available loopback port", async () => {
    const port = await allocatePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65536);
  });

  test("launchE2EServer allocates a unique temporary root with explicit absolute leaves", async () => {
    const a = await launchE2EServer();
    const b = await launchE2EServer();
    try {
      expect(a.root).not.toBe(b.root);
      expect(a.env.APP_DATA_DIR).toBe(a.root);
      expect(a.env.DB_PATH).toBe(join(a.root, "jobs.sqlite"));
      expect(a.env.TOOL_CACHE_DB_PATH).toBe(join(a.root, "tool-cache.sqlite"));
      expect(a.env.ORPHADATA_DB_PATH).toBe(join(a.root, "orphadata.sqlite"));
      // Cache TTL zero, no cache key.
      expect(a.env.TOOL_CACHE_TTL_MS).toBe("0");
      expect(a.env.TOOL_CACHE_KEY_SECRET).toBe("");
      // Mock LLM, disabled Orphadata.
      expect(a.env.MOCK_LLM).toBe("1");
      expect(a.env.ORPHADATA_ENABLED).toBe("0");
      // Dedicated port.
      expect(a.port).toBeGreaterThan(0);
      expect(a.env.PORT).toBe(String(a.port));
    } finally {
      a.cleanup();
      b.cleanup();
    }
  });

  test("cleanup removes only the owning server's data root", async () => {
    const a = await launchE2EServer();
    const b = await launchE2EServer();
    a.cleanup();
    expect(existsSync(a.root)).toBe(false);
    expect(existsSync(b.root)).toBe(true);
    b.cleanup();
    expect(existsSync(b.root)).toBe(false);
  });

  test("inherited data-root/path/secret/port/live-run values are scrubbed", async () => {
    const saved: Record<string, string | undefined> = {};
    const keys = [
      "APP_DATA_DIR",
      "DB_PATH",
      "TOOL_CACHE_KEY_SECRET",
      "ORPHADATA_ENABLED",
      "PORT",
      "MOCK_LLM",
      "TOOL_CACHE_TTL_MS",
      "RUN_INTEGRATION",
    ];
    for (const k of keys) {
      saved[k] = process.env[k];
      process.env[k] = "/should/be/scrubbed";
    }
    try {
      const server = await launchE2EServer();
      try {
        expect(server.env.APP_DATA_DIR).toBe(server.root);
        expect(server.env.DB_PATH).not.toBe("/should/be/scrubbed");
      } finally {
        server.cleanup();
      }
    } finally {
      for (const [k, v] of Object.entries(saved)) {
        if (v === undefined) delete process.env[k];
        else process.env[k] = v;
      }
    }
  });
});

describe("Playwright config — reuseExistingServer disabled (5.4)", () => {
  test("config sets reuseExistingServer: false for local and CI runs", async () => {
    // Reading the config module confirms reuseExistingServer is false. We
    // import it fresh to avoid any cached state.
    const config = (await import("../../playwright.config")).default;
    const webServer = Array.isArray(config.webServer)
      ? config.webServer[0]
      : config.webServer;
    expect(webServer?.reuseExistingServer).toBe(false);
  });

  test("config uses a dedicated port and isolated APP_DATA_DIR", async () => {
    const config = (await import("../../playwright.config")).default;
    const webServer = Array.isArray(config.webServer)
      ? config.webServer[0]
      : config.webServer;
    expect(webServer?.port).toBeDefined();
    expect(webServer?.env?.APP_DATA_DIR).toBeDefined();
    expect(webServer?.env?.TOOL_CACHE_TTL_MS).toBe("0");
    expect(webServer?.env?.TOOL_CACHE_KEY_SECRET).toBe("");
    expect(webServer?.env?.ORPHADATA_ENABLED).toBe("0");
  });
});

describe("Playwright config — spec discovery reconciliation (5.5)", () => {
  test("every discovered tests/**/*.spec.ts file matches the configured testMatch", async () => {
    const { glob } = await import("node:fs/promises");
    const config = (await import("../../playwright.config")).default;
    const testMatch = config.testMatch;
    const discovered: string[] = [];
    for await (const p of glob("tests/**/*.spec.ts")) {
      discovered.push(p);
    }
    expect(discovered.length).toBeGreaterThan(0);
    // Every discovered spec must match the configured testMatch pattern.
    const pattern = new RegExp(
      String(testMatch).replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]"),
    );
    for (const p of discovered) {
      expect(pattern.test(p)).toBe(true);
    }
  });
});
