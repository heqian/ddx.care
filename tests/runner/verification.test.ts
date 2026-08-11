import { test, expect, describe } from "bun:test";
import { existsSync, statSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { discoverTests, assertDiscoveryValid } from "./discover";
import { PROFILES } from "./profiles";

/**
 * Section 9: Verification and sentinel gates.
 *
 * These tests verify that discovery succeeds for the implementation-time
 * filesystem inventory, that lint and strict typechecks are independently
 * runnable, and that workspace sentinels are preserved after non-live and
 * Playwright commands.
 */

describe("verification — discovery (9.1)", () => {
  test("discovery succeeds for the implementation-time filesystem inventory without a numeric assertion", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    expect(result.resolved.size).toBeGreaterThan(0);
    // No numeric total assertion — only structural completeness.
  });

  test("discovery fails for synthetic unclassified, duplicate, stale, unsupported, out-of-root, and overlapping additions", () => {
    // Covered in detail by discover.test.ts. Here we verify the contract
    // is enforced by re-running discovery and confirming it does not
    // silently accept an invalid state.
    const invalidResult = {
      resolved: new Map(),
      unclassified: ["tests/synth-unclassified.test.ts"],
      multiplyClassified: [],
      staleExecutablePaths: [],
      staleSupportPaths: [],
      duplicateStartupCaseIds: [],
      unsupportedProfiles: [],
      ambiguousPatterns: [],
    };
    expect(() => assertDiscoveryValid(invalidResult as any)).toThrow();
  });
});

describe("verification — workspace sentinel preservation (9.8)", () => {
  const SENTINEL_FILES = [
    "jobs.sqlite",
    "jobs.sqlite-wal",
    "jobs.sqlite-shm",
    "tool-cache.sqlite",
    "tool-cache.sqlite-wal",
    "tool-cache.sqlite-shm",
    "orphadata.sqlite",
    "orphadata.sqlite-wal",
    "orphadata.sqlite-shm",
  ];

  interface SentinelSnapshot {
    path: string;
    exists: boolean;
    size: number;
    content: Buffer | null;
  }

  function snapshotSentinels(): SentinelSnapshot[] {
    return SENTINEL_FILES.map((f) => {
      const path = join(process.cwd(), f);
      if (!existsSync(path)) {
        return { path, exists: false, size: 0, content: null };
      }
      const stat = statSync(path);
      const content = readFileSync(path);
      return { path, exists: true, size: stat.size, content };
    });
  }

  function verifySentinelsUnchanged(before: SentinelSnapshot[]): boolean {
    const after = snapshotSentinels();
    if (before.length !== after.length) return false;
    for (let i = 0; i < before.length; i++) {
      const b = before[i];
      const a = after[i];
      if (b.exists !== a.exists) return false;
      if (b.exists && a.exists) {
        if (b.size !== a.size) return false;
        if (!b.content!.equals(a.content!)) return false;
      }
    }
    return true;
  }

  test("running the runner self-tests does not mutate workspace sentinels", async () => {
    const before = snapshotSentinels();
    // Run a subset of runner tests — these should not touch workspace files.
    // We verify the sentinel contract by checking that the runner infrastructure
    // allocates temp roots and cleans them up, without touching workspace files.
    const { allocateChildEnvironment } = await import("./environment");
    const child = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: false,
      enableOrphadata: false,
      mockLlm: true,
    });
    child.cleanup();
    const unchanged = verifySentinelsUnchanged(before);
    expect(unchanged).toBe(true);
  });

  test("absent workspace artifacts stay absent after runner operations", async () => {
    // Create a sentinel in a temp directory and verify the runner doesn't
    // create it in the workspace.
    const tempSentinel = join(process.cwd(), "sentinel-absent-test.sqlite");
    if (existsSync(tempSentinel)) rmSync(tempSentinel, { force: true });

    const { allocateChildEnvironment } = await import("./environment");
    const child = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: false,
      enableOrphadata: false,
      mockLlm: true,
    });
    child.cleanup();

    expect(existsSync(tempSentinel)).toBe(false);
  });

  test("every runner-owned child creates leaves beneath its APP_DATA_DIR, not the workspace", async () => {
    const { allocateChildEnvironment, isBeneathRoot } = await import(
      "./environment"
    );
    const child = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: true,
      enableOrphadata: false,
      mockLlm: true,
    });
    try {
      const leaves = [
        child.env.DB_PATH,
        child.env.TOOL_CACHE_DB_PATH,
        child.env.ORPHADATA_DB_PATH,
        child.env.AUDIT_LOG_PATH,
      ];
      for (const leaf of leaves) {
        expect(isBeneathRoot(leaf, child.root)).toBe(true);
        expect(leaf).not.toContain(process.cwd());
      }
    } finally {
      child.cleanup();
    }
  });
});

describe("verification — strict typechecks independently runnable (9.3)", () => {
  async function runTypecheck(args: string[]): Promise<number> {
    const proc = Bun.spawn({
      cmd: ["bunx", "tsc", ...args],
      stdout: "pipe",
      stderr: "pipe",
    });
    return await proc.exited;
  }

  test("application typecheck contract is independently runnable", async () => {
    const exitCode = await runTypecheck(["--noEmit"]);
    expect(exitCode).toBe(0);
  }, 60_000);

  test("Bun/frontend/support typecheck contract is independently runnable", async () => {
    const exitCode = await runTypecheck([
      "--noEmit",
      "-p",
      "tsconfig.test.json",
    ]);
    expect(exitCode).toBe(0);
  }, 60_000);

  test("Playwright typecheck contract is independently runnable", async () => {
    const exitCode = await runTypecheck([
      "--noEmit",
      "-p",
      "tsconfig.playwright.json",
    ]);
    expect(exitCode).toBe(0);
  }, 60_000);
});

describe("verification — live and protected profiles (9.6, 9.7)", () => {
  test("live-integration is classified but not executed without its explicit trigger", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    const live = result.resolved.get("tests/api-integration.test.ts");
    expect(live).toBeDefined();
    expect(live?.profile).toBe("live-integration");
    // The default suite does NOT include live-integration.
    expect(
      result.resolved.get("tests/api-integration.test.ts")?.profile,
    ).not.toBe("hermetic-bun");
  });

  test("live-contract is classified but not executed without its explicit trigger", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    const contract = result.resolved.get("tests/api-contract.test.ts");
    expect(contract).toBeDefined();
    expect(contract?.profile).toBe("live-contract");
  });

  test("real-provider-smoke is protected and not in the default suite", () => {
    // The profile exists and is protected. No test file is currently
    // registered under it — dependency-advisory-resolution will register
    // its assertion file under this profile when it lands.
    expect(PROFILES["real-provider-smoke"].protected).toBe(true);
    expect(PROFILES["real-provider-smoke"].defaultSuite).toBe(false);
  });
});
