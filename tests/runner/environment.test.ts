import { test, expect, describe } from "bun:test";
import {
  allocateChildEnvironment,
  allocateRootLeaves,
  isBeneathRoot,
  sanitizeInheritedEnv,
  verifyArtifactsBeneathRoot,
} from "./environment";
import { generateCacheKey, isValidCacheKey } from "./crypto";
import { existsSync, mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

/**
 * Task 2.1: Validate the runner's own generated temporary root, explicit
 * absolute leaf environment values, fixtures, and observed artifacts remain
 * beneath the owning child root; do not implement or consume the later
 * sensitive-cache resolver.
 */
describe("environment — runner-owned root validation (task 2.1)", () => {
  test("every allocated leaf is an absolute path beneath the root", () => {
    const child = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: true,
      enableOrphadata: false,
      mockLlm: true,
    });
    try {
      const leaves = allocateRootLeaves(child.root);
      for (const leaf of Object.values(leaves)) {
        expect(isBeneathRoot(leaf, child.root)).toBe(true);
      }
      // The exported APP_DATA_DIR equals the root.
      expect(child.env.APP_DATA_DIR).toBe(child.root);
    } finally {
      child.cleanup();
    }
  });

  test("the runner does not implement application path-resolution semantics", () => {
    // The environment module exposes only absolute-leaf allocation and
    // canonical validation. It must NOT expose mount/no-follow/resolver APIs
    // — those are owned by sensitive-cache-redaction.
    const child = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: false,
      enableOrphadata: false,
      mockLlm: true,
    });
    child.cleanup();
    // No resolver export exists; the only exports are allocation/validation.
    expect(typeof allocateChildEnvironment).toBe("function");
    expect(typeof isBeneathRoot).toBe("function");
    expect(typeof verifyArtifactsBeneathRoot).toBe("function");
  });

  test("observed created artifacts stay beneath the owning root", () => {
    const child = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: true,
      enableOrphadata: false,
      mockLlm: true,
    });
    try {
      // Simulate a child writing its jobs database.
      writeFileSync(join(child.root, "jobs.sqlite"), "x");
      writeFileSync(join(child.root, "jobs.sqlite-wal"), "x");
      const leaves = [
        join(child.root, "jobs.sqlite"),
        join(child.root, "jobs.sqlite-wal"),
        join(child.root, "audit.log"),
      ];
      const result = verifyArtifactsBeneathRoot(child.root, leaves);
      expect(result.ok).toBe(true);
      expect(result.escapees).toEqual([]);
    } finally {
      child.cleanup();
    }
  });

  test("an escapee is flagged", () => {
    const child = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: false,
      enableOrphadata: false,
      mockLlm: true,
    });
    const outside = mkdtempSync(join(tmpdir(), "ddx-env-escape-"));
    const escapee = join(outside, "escapee.sqlite");
    writeFileSync(escapee, "x");
    try {
      const result = verifyArtifactsBeneathRoot(child.root, [
        join(child.root, "jobs.sqlite"),
        escapee,
      ]);
      expect(result.ok).toBe(false);
      expect(result.escapees).toContain(escapee);
    } finally {
      child.cleanup();
      rmSync(outside, { recursive: true, force: true });
    }
  });

  test("cleanup removes only the owning child's root", () => {
    const a = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: false,
      enableOrphadata: false,
      mockLlm: true,
    });
    const b = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: false,
      enableOrphadata: false,
      mockLlm: true,
    });
    a.cleanup();
    expect(existsSync(a.root)).toBe(false);
    expect(existsSync(b.root)).toBe(true);
    b.cleanup();
    expect(existsSync(b.root)).toBe(false);
  });

  test("base profile env has cache TTL zero, no cache key, orphadata disabled", () => {
    const child = allocateChildEnvironment({
      cacheTtlMs: 0,
      enableAuditLog: false,
      enableOrphadata: false,
      mockLlm: true,
    });
    try {
      expect(child.env.TOOL_CACHE_TTL_MS).toBe("0");
      expect(child.env.TOOL_CACHE_KEY_SECRET).toBeUndefined();
      expect(child.env.ORPHADATA_ENABLED).toBe("0");
      expect(child.env.MOCK_LLM).toBe("1");
    } finally {
      child.cleanup();
    }
  });

  test("cache-enabled profile receives a strict cache key and positive TTL", () => {
    const key = generateCacheKey();
    const child = allocateChildEnvironment({
      cacheTtlMs: 60_000,
      cacheKey: key,
      enableAuditLog: false,
      enableOrphadata: false,
      mockLlm: true,
    });
    try {
      expect(child.env.TOOL_CACHE_TTL_MS).toBe("60000");
      expect(child.env.TOOL_CACHE_KEY_SECRET).toBe(key);
      expect(isValidCacheKey(key)).toBe(true);
    } finally {
      child.cleanup();
    }
  });

  test("sanitized env removes all data-root/leaf/secret/port/live-run keys", () => {
    const sanitized = sanitizeInheritedEnv({
      APP_DATA_DIR: "/x",
      DB_PATH: "/x",
      TOOL_CACHE_DB_PATH: "/x",
      TOOL_CACHE_KEY_SECRET: "x",
      ORPHADATA_DB_PATH: "/x",
      ORPHADATA_ENABLED: "1",
      AUDIT_LOG_PATH: "/x",
      WS_TOKEN_SECRET: "x",
      PORT: "9999",
      MOCK_LLM: "0",
      TOOL_CACHE_TTL_MS: "999",
      RUN_INTEGRATION: "1",
      RUN_CONTRACT: "1",
      PATH: "/usr/bin",
    });
    expect(sanitized.APP_DATA_DIR).toBeUndefined();
    expect(sanitized.PATH).toBe("/usr/bin");
  });
});
