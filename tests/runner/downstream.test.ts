import { test, expect, describe } from "bun:test";
import {
  REGISTRATIONS,
  registrationsForOwner,
  type OwnerId,
} from "./registrations";
import { PROFILES } from "./profiles";
import { discoverTests, assertDiscoveryValid } from "./discover";

/**
 * Section 7: Verify that active downstream changes can register tests,
 * support fixtures, startup cases, and protected classes through the
 * canonical discovery contract — without replacing the central inventory.
 */
describe("downstream registration extensions — composable ownership (section 7)", () => {
  const downstreamOwners: Array<{
    owner: OwnerId;
    section: string;
    expectedProfile: string;
  }> = [
    {
      owner: "dependency-advisory-resolution",
      section: "7.1",
      expectedProfile: "hermetic-bun",
    },
    {
      owner: "clinician-reviewed-prompts",
      section: "7.2",
      expectedProfile: "hermetic-bun",
    },
    {
      owner: "patient-data-delimiter-escaping",
      section: "7.3",
      expectedProfile: "hermetic-bun",
    },
    {
      owner: "sensitive-cache-redaction",
      section: "7.4",
      expectedProfile: "hermetic-bun",
    },
    {
      owner: "evidence-provenance-ledger",
      section: "7.5",
      expectedProfile: "hermetic-bun",
    },
    {
      owner: "consultation-budget-enforcement",
      section: "7.6",
      expectedProfile: "hermetic-bun",
    },
    {
      owner: "export-privacy-and-disclaimer",
      section: "7.7",
      expectedProfile: "hermetic-bun",
    },
    {
      owner: "form-semantics-and-labels",
      section: "7.8",
      expectedProfile: "hermetic-bun",
    },
  ];

  test("every downstream change has at least one registration fragment", () => {
    for (const { owner } of downstreamOwners) {
      const regs = registrationsForOwner(owner);
      expect(regs.length).toBeGreaterThan(0);
    }
  });

  test("every downstream registration uses a supported profile", () => {
    for (const { owner } of downstreamOwners) {
      const regs = registrationsForOwner(owner);
      for (const r of regs) {
        expect(PROFILES[r.profile]).toBeDefined();
      }
    }
  });

  test("dependency-advisory-resolution uses hermetic-bun for evaluator/fixtures (7.1)", () => {
    const regs = registrationsForOwner("dependency-advisory-resolution");
    for (const r of regs) {
      expect(r.profile).toBe("hermetic-bun");
    }
    // The registration pattern intentionally includes future matching tests.
    expect(regs[0].pattern).toMatch(/^tests\/dependency-/);
  });

  test("clinician-reviewed-prompts registers under hermetic profiles (7.2)", () => {
    const regs = registrationsForOwner("clinician-reviewed-prompts");
    for (const r of regs) {
      expect(r.profile).toBe("hermetic-bun");
    }
  });

  test("patient-data-delimiter-escaping registers under hermetic profiles (7.3)", () => {
    const regs = registrationsForOwner("patient-data-delimiter-escaping");
    for (const r of regs) {
      expect(r.profile).toBe("hermetic-bun");
    }
  });

  test("sensitive-cache-redaction will use cache-enabled, server-test, and cache-startup (7.4)", () => {
    // The sensitive-cache change is applied after this change. Its
    // registrations will use cache-enabled, server-test, and cache-startup
    // profiles. This change provides those profiles in the registry.
    expect(PROFILES["cache-enabled"]).toBeDefined();
    expect(PROFILES["server-test"]).toBeDefined();
    expect(PROFILES["cache-startup"]).toBeDefined();
    // The current sensitive-cache registration is a placeholder pattern
    // under hermetic-bun; the change will update it when it lands.
    const regs = registrationsForOwner("sensitive-cache-redaction");
    expect(regs.length).toBeGreaterThan(0);
  });

  test("evidence-provenance-ledger extends registrations (7.5)", () => {
    const regs = registrationsForOwner("evidence-provenance-ledger");
    expect(regs.length).toBeGreaterThan(0);
  });

  test("consultation-budget-enforcement extends registrations (7.6)", () => {
    const regs = registrationsForOwner("consultation-budget-enforcement");
    expect(regs.length).toBeGreaterThan(0);
  });

  test("export-privacy-and-disclaimer extends registrations (7.7)", () => {
    const regs = registrationsForOwner("export-privacy-and-disclaimer");
    expect(regs.length).toBeGreaterThan(0);
  });

  test("form-semantics-and-labels extends registrations (7.8)", () => {
    const regs = registrationsForOwner("form-semantics-and-labels");
    expect(regs.length).toBeGreaterThan(0);
  });

  test("no downstream change introduces a parallel inventory or runner", () => {
    // All downstream registrations are part of the single REGISTRATIONS array.
    // No separate runner or inventory exists.
    const allDownstreamRegs = downstreamOwners.flatMap(({ owner }) =>
      registrationsForOwner(owner),
    );
    for (const r of allDownstreamRegs) {
      expect(REGISTRATIONS).toContain(r);
    }
  });

  test("downstream registrations compose with the current inventory without conflict", async () => {
    const result = await discoverTests();
    assertDiscoveryValid(result);
    // No multiply-classified tests — downstream patterns don't overlap with
    // existing exact-path registrations.
    expect(result.multiplyClassified).toEqual([]);
  });
});
