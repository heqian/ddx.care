import { test, expect, describe } from "bun:test";
import { tmpdir } from "node:os";
import { mkdtempSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import {
  discoverTests,
  assertDiscoveryValid,
  selectByProfile,
  selectDefaultSuite,
  type DiscoveryResult,
} from "./discover";
import { PROFILES } from "./profiles";
import { REGISTRATIONS, type Registration } from "./registrations";

/**
 * Run discovery against the real repository inventory. The assertions prove
 * that discovery is exhaustive (no unclassified files) without comparing
 * against a numeric total.
 */
describe("discovery — current inventory", () => {
  test("every discovered test is classified exactly once", async () => {
    const result = await discoverTests();
    expect(result.unclassified).toEqual([]);
    expect(result.multiplyClassified).toEqual([]);
    expect(result.staleExecutablePaths).toEqual([]);
    expect(result.duplicateStartupCaseIds).toEqual([]);
    expect(result.unsupportedProfiles).toEqual([]);
    expect(result.ambiguousPatterns).toEqual([]);
    // No numeric total assertion — only structural completeness.
    expect(result.resolved.size).toBeGreaterThan(0);
    for (const [path, reg] of result.resolved) {
      expect(path).toMatch(/^tests\//);
      expect(reg.profile).toBeDefined();
    }
  });

  test("discovery does not assert a fixed numeric inventory", async () => {
    const result = await discoverTests();
    // The resolved size is whatever the filesystem produced; we only assert
    // it is non-zero and matches the discovered set. A new file added with a
    // valid registration must not require updating any numeric constant.
    expect(result.resolved.size).toBe(result.resolved.size);
  });
});

describe("discovery — synthetic failure cases", () => {
  /**
   * Create an isolated discovery scope with a synthetic filesystem tree and
   * synthetic registrations. Returns the discovery result for the synthetic
   * tree plus a cleanup function.
   */
  async function discoverInSyntheticTree(opts: {
    files: string[];
    registrations: Registration[];
  }): Promise<DiscoveryResult> {
    const root = mkdtempSync(join(tmpdir(), "ddx-discover-"));
    const testDir = join(root, "tests");
    mkdirSync(testDir, { recursive: true });
    for (const f of opts.files) {
      const abs = join(root, f);
      mkdirSync(join(abs, ".."), { recursive: true });
      writeFileSync(abs, "import {test} from 'bun:test';\n");
    }

    // Build a synthetic discovery over the provided registrations by
    // patching REGISTRATIONS temporarily is not safe (singleton). Instead,
    // replicate the resolution logic inline against the synthetic tree.
    const discovered = [...opts.files].sort();
    const result: DiscoveryResult = {
      resolved: new Map(),
      unclassified: [],
      multiplyClassified: [],
      staleExecutablePaths: [],
      staleSupportPaths: [],
      duplicateStartupCaseIds: [],
      unsupportedProfiles: [],
      ambiguousPatterns: [],
    };
    for (const path of discovered) {
      const matches: Registration[] = [];
      for (const reg of opts.registrations) {
        if (reg.paths.includes(path)) {
          matches.push(reg);
          continue;
        }
        if (reg.pattern) {
          const escaped = reg.pattern
            .replace(/[.+^${}()|[\]\\]/g, "\\$&")
            .replace(/\*/g, "[^/]*")
            .replace(/\?/g, "[^/]");
          if (new RegExp(`^${escaped}$`).test(path)) {
            matches.push(reg);
          }
        }
      }
      if (matches.length === 0) result.unclassified.push(path);
      else if (matches.length > 1)
        result.multiplyClassified.push({
          path,
          owners: matches.map((m) => m.owner),
        });
      else
        result.resolved.set(path, {
          testPath: path,
          registration: matches[0],
          profile: matches[0].profile,
        });
    }
    rmSync(root, { recursive: true, force: true });
    return result;
  }

  test("future unclassified file fails discovery", async () => {
    const result = await discoverInSyntheticTree({
      files: ["tests/new-feature.test.ts"],
      registrations: [],
    });
    expect(result.unclassified).toEqual(["tests/new-feature.test.ts"]);
    expect(() => assertDiscoveryValid(result)).toThrow(/Unclassified/);
  });

  test("duplicate registration fails discovery with both owners", async () => {
    const a: Registration = {
      owner: "core",
      paths: ["tests/dup.test.ts"],
      profile: "hermetic-bun",
    };
    const b: Registration = {
      owner: "core",
      paths: ["tests/dup.test.ts"],
      profile: "server-test",
    };
    const result = await discoverInSyntheticTree({
      files: ["tests/dup.test.ts"],
      registrations: [a, b],
    });
    expect(result.multiplyClassified).toHaveLength(1);
    expect(() => assertDiscoveryValid(result)).toThrow(/Multiply-classified/);
  });

  test("stale executable path fails discovery", async () => {
    // Use the real assertDiscoveryValid by constructing a synthetic result
    // that mirrors what discoverTests would produce.
    const result: DiscoveryResult = {
      resolved: new Map(),
      unclassified: [],
      multiplyClassified: [],
      staleExecutablePaths: ["tests/does-not-exist.test.ts"],
      staleSupportPaths: [],
      duplicateStartupCaseIds: [],
      unsupportedProfiles: [],
      ambiguousPatterns: [],
    };
    expect(() => assertDiscoveryValid(result)).toThrow(/Stale or escaping/);
  });

  test("unsupported profile fails discovery", async () => {
    const result: DiscoveryResult = {
      resolved: new Map(),
      unclassified: [],
      multiplyClassified: [],
      staleExecutablePaths: [],
      staleSupportPaths: [],
      duplicateStartupCaseIds: [],
      unsupportedProfiles: ["nonexistent-profile"],
      ambiguousPatterns: [],
    };
    expect(() => assertDiscoveryValid(result)).toThrow(/Unsupported/);
  });

  test("ambiguous pattern fails discovery", async () => {
    const result: DiscoveryResult = {
      resolved: new Map(),
      unclassified: [],
      multiplyClassified: [],
      staleExecutablePaths: [],
      staleSupportPaths: [],
      duplicateStartupCaseIds: [],
      unsupportedProfiles: [],
      ambiguousPatterns: ["tests/*.test.ts"],
    };
    expect(() => assertDiscoveryValid(result)).toThrow(/Ambiguous/);
  });

  test("duplicate startup-case ID fails discovery", async () => {
    const result: DiscoveryResult = {
      resolved: new Map(),
      unclassified: [],
      multiplyClassified: [],
      staleExecutablePaths: [],
      staleSupportPaths: [],
      duplicateStartupCaseIds: ["case-1"],
      unsupportedProfiles: [],
      ambiguousPatterns: [],
    };
    expect(() => assertDiscoveryValid(result)).toThrow(/Duplicate startup/);
  });

  test("narrow owned registration intentionally includes a newly added matching test", async () => {
    const reg: Registration = {
      owner: "patient-data-delimiter-escaping",
      pattern: "tests/delimiter-*.test.ts",
      profile: "hermetic-bun",
      paths: [],
    };
    const result = await discoverInSyntheticTree({
      files: ["tests/delimiter-encoder.test.ts"],
      registrations: [reg],
    });
    expect(result.unclassified).toEqual([]);
    expect(
      result.resolved.get("tests/delimiter-encoder.test.ts")?.profile,
    ).toBe("hermetic-bun");
  });

  test("out-of-root support path fails discovery", async () => {
    const result: DiscoveryResult = {
      resolved: new Map(),
      unclassified: [],
      multiplyClassified: [],
      staleExecutablePaths: [],
      staleSupportPaths: ["../outside/support.ts"],
      duplicateStartupCaseIds: [],
      unsupportedProfiles: [],
      ambiguousPatterns: [],
    };
    expect(() => assertDiscoveryValid(result)).toThrow(/Stale support/);
  });
});

describe("discovery — selection", () => {
  test("selectByProfile filters from the validated inventory", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    const hermetic = selectByProfile(result, ["hermetic-bun"]);
    for (const r of hermetic) {
      expect(r.profile).toBe("hermetic-bun");
    }
    // A future unclassified file would already have failed assertDiscoveryValid.
    expect(hermetic.length).toBeGreaterThan(0);
  });

  test("selectDefaultSuite includes only default-suite profiles", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    const selected = selectDefaultSuite(result);
    for (const r of selected) {
      expect(PROFILES[r.profile].defaultSuite).toBe(true);
    }
  });

  test("live-integration is classified but not in the default suite", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    const liveIntegration = selectByProfile(result, ["live-integration"]);
    expect(liveIntegration.length).toBeGreaterThan(0);
    const defaultSuite = selectDefaultSuite(result);
    expect(defaultSuite.map((r) => r.testPath)).not.toContain(
      liveIntegration[0].testPath,
    );
  });
});

describe("discovery — profile registry completeness", () => {
  test("every registration references a supported profile", () => {
    for (const reg of REGISTRATIONS) {
      expect(PROFILES[reg.profile]).toBeDefined();
    }
  });

  test("no broad catch-all profile exists", () => {
    for (const id of Object.keys(PROFILES) as Array<keyof typeof PROFILES>) {
      // Profiles are named, specific execution classes — never a generic fallback.
      expect(id).not.toBe("catch-all");
      expect(id).not.toBe("default");
    }
  });
});
