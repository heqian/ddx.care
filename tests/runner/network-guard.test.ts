import { test, expect, describe, afterEach } from "bun:test";
import { installNetworkGuard, isLoopbackHost } from "./network-guard";

describe("network guard — loopback-only (5.1)", () => {
  let uninstall: (() => void) | null = null;

  afterEach(() => {
    if (uninstall) {
      uninstall();
      uninstall = null;
    }
  });

  test("isLoopbackHost identifies loopback addresses", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(true);
    expect(isLoopbackHost("example.com")).toBe(false);
    expect(isLoopbackHost("8.8.8.8")).toBe(false);
  });

  test("guard blocks unmocked external requests and identifies the origin", async () => {
    uninstall = installNetworkGuard({ origin: "tests/synth.test.ts" });
    await expect(fetch("https://example.com/")).rejects.toThrow(
      /Non-live network guard blocked.*example.com/,
    );
  });

  test("guard allows loopback requests", async () => {
    uninstall = installNetworkGuard({ origin: "tests/synth.test.ts" });
    // The guard must not throw for loopback. We don't start a server, so the
    // request fails at the connection layer — but not with the guard error.
    try {
      await fetch("http://localhost:1/");
    } catch (e: any) {
      expect(e.message).not.toContain("Non-live network guard");
    }
  });

  test("guard allows provider-allowlisted hosts", async () => {
    uninstall = installNetworkGuard({
      origin: "tests/live.test.ts",
      allowedHosts: ["api.example.com"],
    });
    // The guard passes the allowlist check; the request then fails at the
    // network layer (no real DNS here) — but it must NOT throw the guard
    // error.
    try {
      await fetch("https://api.example.com/");
    } catch (e: any) {
      expect(e.message).not.toContain("Non-live network guard");
    }
  });

  test("guard blocks non-allowlisted external hosts even with an allowlist set", async () => {
    uninstall = installNetworkGuard({
      origin: "tests/live.test.ts",
      allowedHosts: ["api.example.com"],
    });
    await expect(fetch("https://evil.example.com/")).rejects.toThrow(
      /Non-live network guard blocked.*evil.example.com/,
    );
  });

  test("uninstall restores the original fetch", async () => {
    uninstall = installNetworkGuard({ origin: "tests/synth.test.ts" });
    uninstall();
    uninstall = null;
    // After uninstall, fetch is the original — no guard error. We don't make
    // a real request, just confirm the guard is gone by checking fetch is
    // not the guard function.
    expect(globalThis.fetch.name).not.toBe("guard");
  });

  test("guard blocks real GitHub and registry hosts (dependency-evaluator hermeticity, 5.2)", async () => {
    uninstall = installNetworkGuard({
      origin: "tests/dependency-evaluator.test.ts",
    });
    await expect(fetch("https://github.com/some/repo/issues")).rejects.toThrow(
      /Non-live network guard blocked.*github.com/,
    );
    await expect(
      fetch("https://registry.npmjs.org/some-package"),
    ).rejects.toThrow(/Non-live network guard blocked.*registry.npmjs.org/);
  });

  test("dependency evaluator tests must use fake adapters via local fixtures", async () => {
    // This is a documentation contract: the hermetic-bun profile for
    // dependency-advisory-resolution registrations implies the guard is
    // installed. Real GitHub/registry access would fail. The downstream
    // change registers its fixtures under canonical hermetic-bun.
    const { registrationsForOwner } = await import("./registrations");
    const deps = registrationsForOwner("dependency-advisory-resolution");
    for (const r of deps) {
      expect(r.profile).toBe("hermetic-bun");
    }
  });
});
