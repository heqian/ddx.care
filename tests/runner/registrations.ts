/**
 * Deterministic, extensible test registration fragments.
 *
 * Each fragment declares an owner, exact paths or a narrow owned pattern,
 * one supported profile, optional support/fixture paths, and optional
 * parent-run startup cases. Fragments are composed in deterministic order
 * by discovery (see discover.ts).
 *
 * Downstream changes add or update an owned fragment when they add a
 * matching test, support fixture, startup case, or protected execution
 * class — they never replace a central inventory.
 */

import type { ProfileId } from "./profiles";

export type OwnerId =
  | "core"
  | "dependency-advisory-resolution"
  | "clinician-reviewed-prompts"
  | "patient-data-delimiter-escaping"
  | "sensitive-cache-redaction"
  | "evidence-provenance-ledger"
  | "consultation-budget-enforcement"
  | "export-privacy-and-disclaimer"
  | "form-semantics-and-labels";

export interface StartupCase {
  /** Unique, stable id for this startup case across all fragments. */
  id: string;
  /** Fixture key — resolved by the launcher's fixture registry. */
  fixture: string;
  /** Declared application entry command (e.g. ["bun", "index.ts"]). */
  command: string[];
  /** Readiness probe kind. */
  readiness:
    | { kind: "http-ok"; path: string; timeoutMs: number }
    | { kind: "exit"; expectedCode: number; timeoutMs: number };
  /** Optional probes to run once ready. */
  probes?: Array<{
    name: string;
    run: (ctx: { root: string; port: number }) => Promise<void>;
  }>;
}

export interface Registration {
  /** Owning change or core. */
  owner: OwnerId;
  /** Exact test paths (relative to repo root) OR a narrow owned pattern. */
  paths: string[];
  /**
   * Optional narrow glob pattern that intentionally registers future matching
   * tests under this policy. Patterns must be narrow (anchored to an owned
   * subtree) and cannot be a broad catch-all.
   */
  pattern?: string;
  /** Exactly one supported profile. */
  profile: ProfileId;
  /** Optional TypeScript support/fixture paths that must exist and typecheck. */
  support?: string[];
  /** Optional parent-run startup cases for this registration. */
  startupCases?: StartupCase[];
  /**
   * CI status name that selects this owner registration. When omitted, the
   * registration runs under the default non-live suite selection.
   */
  ciStatus?: string;
}

export const REGISTRATIONS: Registration[] = [
  {
    owner: "core",
    paths: ["tests/api.test.ts"],
    profile: "server-test",
    support: ["tests/runner/registrations.ts"],
  },
  {
    owner: "core",
    paths: ["tests/tools.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/workflow.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/progress-store.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/rate-limiter.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/logger.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/fetch-utils.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/websocket.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/config.test.ts"],
    profile: "config-matrix",
  },
  {
    owner: "core",
    paths: ["tests/tool-execute.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/routes-helpers.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/routes-capacity.test.ts"],
    profile: "server-test",
  },
  {
    owner: "core",
    paths: ["tests/router.test.ts"],
    profile: "frontend-dom",
  },
  {
    owner: "core",
    paths: ["tests/ws-origin.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/shutdown.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/api-client.test.ts"],
    profile: "frontend-dom",
  },
  {
    owner: "core",
    paths: ["tests/job-context.test.ts"],
    profile: "frontend-dom",
  },
  {
    owner: "core",
    paths: ["tests/audit-logger.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/prompt-injection.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/orphadata-cache.test.ts"],
    profile: "orphadata-cache",
  },
  {
    owner: "core",
    paths: ["tests/orphadata-tools.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/nlm-clinical-tables.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/openfda-new-tools.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/tool-cache.test.ts"],
    profile: "cache-enabled",
  },
  {
    owner: "core",
    paths: ["tests/errors.test.ts"],
    profile: "hermetic-bun",
  },
  {
    owner: "core",
    paths: ["tests/rest-token.test.ts"],
    profile: "token-secret-rest",
  },
  {
    owner: "core",
    paths: ["tests/ws-ticket.test.ts"],
    profile: "token-secret-ws",
  },
  {
    owner: "core",
    paths: ["tests/frontend.test.tsx"],
    profile: "frontend-dom",
  },
  {
    owner: "core",
    paths: ["tests/api-integration.test.ts"],
    profile: "live-integration",
  },
  {
    owner: "core",
    paths: ["tests/api-contract.test.ts"],
    profile: "live-contract",
  },
  // Runner infrastructure self-tests live under tests/runner/ and run as
  // hermetic-bun. The narrow pattern intentionally includes future
  // runner-owned self-tests under the same policy.
  {
    owner: "core",
    pattern: "tests/runner/*.test.ts",
    profile: "hermetic-bun",
    paths: [],
  },
  // Narrow owned patterns: intentionally include future matching tests
  // added by the owning change so they inherit the declared policy.
  {
    owner: "dependency-advisory-resolution",
    pattern: "tests/dependency-*.test.ts",
    profile: "hermetic-bun",
    paths: [],
  },
  {
    owner: "clinician-reviewed-prompts",
    pattern: "tests/clinician-*.test.ts",
    profile: "hermetic-bun",
    paths: [],
  },
  {
    owner: "patient-data-delimiter-escaping",
    pattern: "tests/delimiter-*.test.ts",
    profile: "hermetic-bun",
    paths: [],
  },
  {
    owner: "sensitive-cache-redaction",
    pattern: "tests/sensitive-cache-*.test.ts",
    profile: "hermetic-bun",
    paths: [],
  },
  {
    owner: "evidence-provenance-ledger",
    pattern: "tests/provenance-*.test.ts",
    profile: "hermetic-bun",
    paths: [],
  },
  {
    owner: "consultation-budget-enforcement",
    pattern: "tests/consultation-budget-*.test.ts",
    profile: "hermetic-bun",
    paths: [],
  },
  {
    owner: "export-privacy-and-disclaimer",
    pattern: "tests/export-*.test.ts",
    profile: "hermetic-bun",
    paths: [],
  },
  {
    owner: "form-semantics-and-labels",
    pattern: "tests/form-semantics-*.test.ts",
    profile: "hermetic-bun",
    paths: [],
  },
];

/**
 * Subset of registrations owned by a downstream change. Used by the
 * downstream-registration-extensions section to verify composable ownership.
 */
export function registrationsForOwner(owner: OwnerId): Registration[] {
  return REGISTRATIONS.filter((r) => r.owner === owner);
}
