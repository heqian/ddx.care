import { test, expect, describe } from "bun:test";
import {
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
} from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  runChild,
  profileToAllocateOptions,
  installSignalCleanup,
} from "./parent";
import {
  allocateChildEnvironment,
  isBeneathRoot,
  sanitizeInheritedEnv,
  verifyArtifactsBeneathRoot,
} from "./environment";
import { generateCacheKey, isValidCacheKey } from "./crypto";
import { PROFILES } from "./profiles";

describe("parent runner — temp root allocation", () => {
  test("each child receives a unique APP_DATA_DIR with absolute leaves beneath it", () => {
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
    expect(a.root).not.toBe(b.root);
    expect(a.env.APP_DATA_DIR).toBe(a.root);
    expect(b.env.APP_DATA_DIR).toBe(b.root);
    expect(isBeneathRoot(a.env.DB_PATH, a.root)).toBe(true);
    expect(isBeneathRoot(a.env.TOOL_CACHE_DB_PATH, a.root)).toBe(true);
    expect(isBeneathRoot(a.env.ORPHADATA_DB_PATH, a.root)).toBe(true);
    expect(isBeneathRoot(a.env.AUDIT_LOG_PATH ?? "", a.root)).toBe(true);
    a.cleanup();
    b.cleanup();
    expect(existsSync(a.root)).toBe(false);
    expect(existsSync(b.root)).toBe(false);
  });

  test("inherited data-root/path/secret/port/live-run values are sanitized", () => {
    const sanitized = sanitizeInheritedEnv({
      APP_DATA_DIR: "/should/be/scrubbed",
      DB_PATH: "/should/be/scrubbed",
      TOOL_CACHE_KEY_SECRET: "should-be-scrubbed",
      WS_TOKEN_SECRET: "should-be-scrubbed",
      PORT: "9999",
      MOCK_LLM: "0",
      TOOL_CACHE_TTL_MS: "999",
      RUN_INTEGRATION: "1",
      RUN_CONTRACT: "1",
      KEEP_ME: "yes",
    });
    expect(sanitized.APP_DATA_DIR).toBeUndefined();
    expect(sanitized.DB_PATH).toBeUndefined();
    expect(sanitized.TOOL_CACHE_KEY_SECRET).toBeUndefined();
    expect(sanitized.WS_TOKEN_SECRET).toBeUndefined();
    expect(sanitized.PORT).toBeUndefined();
    expect(sanitized.MOCK_LLM).toBeUndefined();
    expect(sanitized.TOOL_CACHE_TTL_MS).toBeUndefined();
    expect(sanitized.RUN_INTEGRATION).toBeUndefined();
    expect(sanitized.RUN_CONTRACT).toBeUndefined();
    expect(sanitized.KEEP_ME).toBe("yes");
  });

  test("base profile sets cache TTL zero, no cache key, disabled Orphadata", () => {
    const opts = profileToAllocateOptions("hermetic-bun");
    expect(opts.cacheTtlMs).toBe(0);
    expect(opts.cacheKey).toBeUndefined();
    expect(opts.enableOrphadata).toBe(false);
    expect(opts.mockLlm).toBe(true);
  });

  test("cache-enabled profile receives a generated strict cache key and positive TTL", () => {
    const opts = profileToAllocateOptions("cache-enabled");
    expect(opts.cacheTtlMs).toBeGreaterThan(0);
    expect(opts.cacheKey).toBeDefined();
    expect(isValidCacheKey(opts.cacheKey ?? "")).toBe(true);
  });

  test("token-secret-rest profile receives a generated secret", () => {
    const opts = profileToAllocateOptions("token-secret-rest");
    expect(opts.tokenSecret).toBeDefined();
    expect(opts.tokenSecret?.length).toBeGreaterThan(0);
  });
});

describe("parent runner — cache key generation", () => {
  test("generateCacheKey produces a 43-char unpadded base64url value", () => {
    const key = generateCacheKey();
    expect(key).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(isValidCacheKey(key)).toBe(true);
  });

  test("two generated keys are distinct", () => {
    const a = generateCacheKey();
    const b = generateCacheKey();
    expect(a).not.toBe(b);
  });

  test("isValidCacheKey rejects malformed values", () => {
    expect(isValidCacheKey("")).toBe(false);
    expect(isValidCacheKey("too-short")).toBe(false);
    expect(isValidCacheKey("invalid!chars*here")).toBe(false);
  });
});

describe("parent runner — verify artifacts stay beneath root", () => {
  test("verifyArtifactsBeneathRoot flags escapees", () => {
    const root = mkdtempSync(join(tmpdir(), "ddx-runner-beneath-"));
    const escapee = join(tmpdir(), "outside-root-file.sqlite");
    writeFileSync(escapee, "x");
    const { ok, escapees } = verifyArtifactsBeneathRoot(root, [
      join(root, "jobs.sqlite"),
      escapee,
    ]);
    expect(ok).toBe(false);
    expect(escapees).toContain(escapee);
    rmSync(root, { recursive: true, force: true });
    rmSync(escapee, { force: true });
  });
});

describe("parent runner — child execution", () => {
  test("a hermetic child runs in a fresh process with a unique root and cleans up", async () => {
    // Create a trivial test file inside a synthetic temp repo so the child
    // has something to run. This exercises the runChild path end-to-end.
    const synthRoot = mkdtempSync(join(tmpdir(), "ddx-runner-"));
    const synthTests = join(synthRoot, "tests");
    mkdirSync(synthTests, { recursive: true });
    const testFile = join(synthTests, "synth.test.ts");
    writeFileSync(
      testFile,
      "import {test, expect} from 'bun:test';\ntest('ok', () => { expect(1).toBe(1); });\n",
    );

    const resolved = {
      testPath: "tests/synth.test.ts",
      registration: {
        owner: "core" as const,
        paths: ["tests/synth.test.ts"],
        profile: "hermetic-bun" as const,
      },
      profile: "hermetic-bun" as const,
    };
    const result = await runChild(resolved, {
      repoRoot: synthRoot,
      timeoutMs: 30_000,
      verbose: false,
    });
    expect(result.exitCode).toBe(0);
    expect(result.timedOut).toBe(false);
    expect(result.cleaned).toBe(true);
    expect(result.artifactsBeneathRoot).toBe(true);
    expect(existsSync(result.root)).toBe(false);
    rmSync(synthRoot, { recursive: true, force: true });
  }, 60_000);
});

describe("parent runner — signal cleanup", () => {
  test("installSignalCleanup registers and unregisters handlers", () => {
    const uninstall = installSignalCleanup(() => {
      // no-op: signal handlers are not safely testable without signalling.
    });
    uninstall();
    expect(typeof uninstall).toBe("function");
  });
});

describe("parent runner — profile registry coverage", () => {
  test("every profile resolves to an AllocateOptions value", () => {
    for (const id of Object.keys(PROFILES) as Array<keyof typeof PROFILES>) {
      const opts = profileToAllocateOptions(id);
      expect(opts).toBeDefined();
      expect(typeof opts.cacheTtlMs).toBe("number");
    }
  });
});
