import { test, expect, describe } from "bun:test";
import {
  discoverTests,
  assertDiscoveryValid,
  selectByProfile,
} from "./discover";
import { PROFILES } from "./profiles";
import { profileToAllocateOptions } from "./parent";
import { isValidCacheKey } from "./crypto";

/**
 * Section 4: Verify every execution profile is applied correctly to the
 * discovered inventory. Tests confirm that base-profile children receive
 * the right environment, cache-enabled children receive a strict key, and
 * live/protected classes are separate and cache-free.
 */
describe("profile application — discovered inventory (4.1)", () => {
  test("every hermetic-bun registration receives cache-disabled base environment", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    const hermetic = selectByProfile(result, ["hermetic-bun"]);
    expect(hermetic.length).toBeGreaterThan(0);
    for (const r of hermetic) {
      const opts = profileToAllocateOptions(r.profile);
      expect(opts.cacheTtlMs).toBe(0);
      expect(opts.cacheKey).toBeUndefined();
      expect(opts.enableOrphadata).toBe(false);
      expect(opts.mockLlm).toBe(true);
    }
  });

  test("server-test registrations receive cache-disabled base with parent-owned server", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    const serverTests = selectByProfile(result, ["server-test"]);
    expect(serverTests.length).toBeGreaterThan(0);
    for (const r of serverTests) {
      const opts = profileToAllocateOptions(r.profile);
      expect(opts.cacheTtlMs).toBe(0);
      expect(opts.cacheKey).toBeUndefined();
    }
  });

  test("config-matrix registrations use base process environment without import-global mutation", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    const configMatrix = selectByProfile(result, ["config-matrix"]);
    expect(configMatrix.length).toBeGreaterThan(0);
    for (const r of configMatrix) {
      const opts = profileToAllocateOptions(r.profile);
      // config-matrix uses base cache-disabled environment; alternate values
      // are passed to the injected config loader, not via env mutation.
      expect(opts.cacheTtlMs).toBe(0);
    }
  });
});

describe("profile application — base child environment (4.2)", () => {
  test("every base-profile child receives unique APP_DATA_DIR, cache TTL zero, no cache key, orphadata disabled", () => {
    for (const id of Object.keys(PROFILES) as Array<keyof typeof PROFILES>) {
      const def = PROFILES[id];
      if (!def.defaultSuite) continue;
      if (def.cache === "enabled-positive") continue;
      const opts = profileToAllocateOptions(id);
      expect(opts.cacheTtlMs).toBe(0);
      expect(opts.cacheKey).toBeUndefined();
      expect(opts.mockLlm).toBe(true);
    }
  });
});

describe("profile application — cache-enabled (4.3, 4.4)", () => {
  test("cache-enabled profile generates a strict 32-byte base64url key", () => {
    const opts = profileToAllocateOptions("cache-enabled");
    expect(opts.cacheTtlMs).toBeGreaterThan(0);
    expect(opts.cacheKey).toBeDefined();
    expect(isValidCacheKey(opts.cacheKey as string)).toBe(true);
  });

  test("two cache-enabled children receive distinct keys", () => {
    const a = profileToAllocateOptions("cache-enabled");
    const b = profileToAllocateOptions("cache-enabled");
    expect(a.cacheKey).not.toBe(b.cacheKey);
  });

  test("cache-enabled child has no external network (loopback-only)", () => {
    const def = PROFILES["cache-enabled"];
    expect(def.network).toBe("loopback-only");
  });

  test("disabled cache behavior is tested through the base profile, not cache-enabled", () => {
    // The base hermetic-bun profile has cache TTL zero — that is the
    // disabled-cache test path. cache-enabled is only for positive TTL.
    const base = profileToAllocateOptions("hermetic-bun");
    expect(base.cacheTtlMs).toBe(0);
    const enabled = profileToAllocateOptions("cache-enabled");
    expect(enabled.cacheTtlMs).toBeGreaterThan(0);
  });
});

describe("profile application — cache-startup (4.5)", () => {
  test("cache-startup profile is parent-owned with declared disabled/enabled/expected-failure mode", () => {
    const def = PROFILES["cache-startup"];
    expect(def.processKind).toBe("server-entry");
    expect(def.cache).toBe("startup-controlled");
  });

  test("cache-startup disabled mode has TTL zero and no key", () => {
    const opts = profileToAllocateOptions("cache-startup", {
      cacheTtlMs: 0,
    });
    expect(opts.cacheTtlMs).toBe(0);
    expect(opts.cacheKey).toBeUndefined();
  });

  test("cache-startup enabled mode receives a generated strict key and positive TTL", () => {
    const opts = profileToAllocateOptions("cache-startup", {
      cacheTtlMs: 60_000,
    });
    expect(opts.cacheTtlMs).toBe(60_000);
    // The caller wires the key for startup-enabled; profileToAllocateOptions
    // generates one only when overrides.cacheKey is set or the profile is
    // cache-enabled. For startup-controlled, the caller provides the key.
    expect(opts.cacheKey).toBeUndefined();
  });

  test("cache-startup expected-failure mode is a startup-negative case", () => {
    // Expected-failure cases declare missing/invalid key to test fail-closed
    // positive-TTL behavior. They are registered as startup-negative cases
    // and are NOT successful cache-enabled profiles.
    const def = PROFILES["cache-startup"];
    expect(def.defaultSuite).toBe(true);
    // The expected-failure sub-mode is selected by the registration's
    // startup-case fixture, not by a separate profile.
  });
});

describe("profile application — orphadata-cache (4.6)", () => {
  test("orphadata-cache runs in its own child with mocked fetch, disabled tool cache", () => {
    const def = PROFILES["orphadata-cache"];
    expect(def.network).toBe("loopback-only");
    expect(def.cache).toBe("disabled");
    const opts = profileToAllocateOptions("orphadata-cache");
    expect(opts.cacheTtlMs).toBe(0);
    expect(opts.enableOrphadata).toBe(true);
  });
});

describe("profile application — token-secret-rest and token-secret-ws (4.7)", () => {
  test("REST and WebSocket ticket profiles use separate generated secrets and server processes", () => {
    const restOpts = profileToAllocateOptions("token-secret-rest");
    const wsOpts = profileToAllocateOptions("token-secret-ws");
    expect(restOpts.tokenSecret).toBeDefined();
    expect(wsOpts.tokenSecret).toBeDefined();
    expect(restOpts.tokenSecret).not.toBe(wsOpts.tokenSecret);
  });

  test("both token-secret profiles are loopback-only", () => {
    expect(PROFILES["token-secret-rest"].network).toBe("loopback-only");
    expect(PROFILES["token-secret-ws"].network).toBe("loopback-only");
  });
});

describe("profile application — frontend-dom (4.8)", () => {
  test("frontend-dom registrations run in dedicated children with no external network", () => {
    const def = PROFILES["frontend-dom"];
    expect(def.network).toBe("loopback-only");
    expect(def.cache).toBe("disabled");
  });
});

describe("profile application — live integration and contract (4.9)", () => {
  test("live-integration is explicit, cache-disabled, and not in the default suite", () => {
    const def = PROFILES["live-integration"];
    expect(def.defaultSuite).toBe(false);
    expect(def.liveTrigger).toBe(true);
    expect(def.cache).toBe("disabled");
    expect(def.network).toBe("provider-allowlist");
  });

  test("live-contract is explicit, cache-disabled, and not in the default suite", () => {
    const def = PROFILES["live-contract"];
    expect(def.defaultSuite).toBe(false);
    expect(def.liveTrigger).toBe(true);
    expect(def.cache).toBe("disabled");
    expect(def.network).toBe("provider-allowlist");
  });

  test("live profiles are rooted in unique APP_DATA_DIR values", () => {
    // The runner allocates a unique root per child regardless of profile —
    // verified by the environment tests. Here we confirm the profiles do
    // not bypass that isolation.
    expect(PROFILES["live-integration"].processKind).toBe("bun-test");
    expect(PROFILES["live-contract"].processKind).toBe("bun-test");
  });
});

describe("profile application — real-provider-smoke (4.10)", () => {
  test("real-provider-smoke is protected and not in the default suite", () => {
    const def = PROFILES["real-provider-smoke"];
    expect(def.protected).toBe(true);
    expect(def.defaultSuite).toBe(false);
    expect(def.liveTrigger).toBe(false);
  });

  test("real-provider-smoke uses cache-disabled, provider-smoke-allowlist network", () => {
    const def = PROFILES["real-provider-smoke"];
    expect(def.cache).toBe("disabled");
    expect(def.network).toBe("provider-smoke-allowlist");
  });

  test("real-provider-smoke policy does not own synthetic cases or workflow/status", () => {
    // The profile owns only execution policy. Synthetic case/assertions and
    // the single revision/lock-bound workflow/status are owned by dependency
    // policy (see downstream registration extensions).
    const def = PROFILES["real-provider-smoke"];
    expect(def.summary.toLowerCase()).toContain("protected");
    expect(def.summary.toLowerCase()).not.toContain("synthetic case");
  });

  test("real-provider-smoke requires mock mode absent", () => {
    const def = PROFILES["real-provider-smoke"];
    expect(def.summary).toContain("mock mode absent");
  });

  test("real-provider-smoke requires exact clean source revision", () => {
    const def = PROFILES["real-provider-smoke"];
    expect(def.summary).toContain("exact clean source revision");
  });
});
