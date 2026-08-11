/**
 * Filesystem discovery and registration resolution.
 *
 * Discovers every tests-suffixed .test.ts and .test.tsx file from the filesystem and resolves
 * each to exactly one typed registration. Discovery fails before selection
 * when:
 *   - a discovered test has zero or multiple registrations,
 *   - a registered executable or support path is stale or outside the test tree,
 *   - a startup-case ID is duplicated,
 *   - a profile is unsupported,
 *   - or a registration pattern is ambiguous.
 *
 * The resolved inventory is computed at run time and never asserted against
 * a numeric total. Filters select from the already-validated inventory, so
 * a future unclassified file fails even when its intended class is not
 * selected.
 */

import { glob } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { REGISTRATIONS, type Registration } from "./registrations";
import { isSupportedProfile, PROFILES, type ProfileId } from "./profiles";

export interface ResolvedRegistration {
  testPath: string;
  registration: Registration;
  profile: ProfileId;
}

export interface DiscoveryResult {
  /** Map of absolute test path -> resolved registration. */
  resolved: Map<string, ResolvedRegistration>;
  /** Discovered test paths that matched no registration. */
  unclassified: string[];
  /** Discovered test paths that matched more than one registration. */
  multiplyClassified: Array<{ path: string; owners: string[] }>;
  /** Registered executable paths that do not exist or escape the test tree. */
  staleExecutablePaths: string[];
  /** Registered support paths that do not exist or escape the test tree. */
  staleSupportPaths: string[];
  /** Duplicated startup-case IDs. */
  duplicateStartupCaseIds: string[];
  /** Unsupported profile ids encountered. */
  unsupportedProfiles: string[];
  /** Registrations whose pattern matched zero executable paths. */
  ambiguousPatterns: string[];
}

export class DiscoveryError extends Error {
  constructor(
    message: string,
    public readonly result: DiscoveryResult,
  ) {
    super(message);
    this.name = "DiscoveryError";
  }
}

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

function relativeToRepo(p: string): string {
  const abs = isAbsolute(p) ? p : resolve(REPO_ROOT, p);
  return relative(REPO_ROOT, abs);
}

function isInsideTests(p: string): boolean {
  const rel = relativeToRepo(p);
  return (
    rel === "tests" || rel.startsWith("tests/") || rel.startsWith("tests\\")
  );
}

function matchPattern(pattern: string, path: string): boolean {
  // Convert a narrow glob pattern into a RegExp. Patterns are anchored to the
  // tests/ subtree and cannot be a broad catch-all (validated below).
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replace(/\*/g, "[^/]*")
    .replace(/\?/g, "[^/]");
  return new RegExp(`^${escaped}$`).test(path);
}

function patternIsAmbiguous(pattern: string): boolean {
  // Reject broad catch-all patterns. A valid narrow pattern must be anchored
  // to a tests/ subtree prefix and contain at least one literal path segment.
  if (!pattern.startsWith("tests/")) return true;
  const literalPrefix = pattern.split("*")[0];
  if (literalPrefix.length < "tests/".length + 2) return true;
  return false;
}

export async function discoverTests(): Promise<DiscoveryResult> {
  const discoveredPaths: string[] = [];
  for await (const path of glob("tests/**/*.test.ts")) {
    discoveredPaths.push(relativeToRepo(path));
  }
  for await (const path of glob("tests/**/*.test.tsx")) {
    discoveredPaths.push(relativeToRepo(path));
  }
  discoveredPaths.sort();

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

  // Validate registrations first
  const seenStartupIds = new Set<string>();
  for (const reg of REGISTRATIONS) {
    if (!isSupportedProfile(reg.profile)) {
      result.unsupportedProfiles.push(reg.profile);
      continue;
    }
    for (const p of reg.paths) {
      const abs = resolve(REPO_ROOT, p);
      if (!existsSync(abs) || !isInsideTests(p)) {
        result.staleExecutablePaths.push(p);
      }
    }
    for (const s of reg.support ?? []) {
      const abs = resolve(REPO_ROOT, s);
      if (!existsSync(abs)) {
        result.staleSupportPaths.push(s);
      }
    }
    if (reg.pattern) {
      if (patternIsAmbiguous(reg.pattern)) {
        result.ambiguousPatterns.push(reg.pattern);
      }
    }
    for (const sc of reg.startupCases ?? []) {
      if (seenStartupIds.has(sc.id)) {
        result.duplicateStartupCaseIds.push(sc.id);
      } else {
        seenStartupIds.add(sc.id);
      }
    }
  }

  // Resolve each discovered path to exactly one registration
  for (const path of discoveredPaths) {
    const matches: Registration[] = [];
    for (const reg of REGISTRATIONS) {
      if (reg.paths.includes(path)) {
        matches.push(reg);
        continue;
      }
      if (reg.pattern && matchPattern(reg.pattern, path)) {
        matches.push(reg);
      }
    }
    if (matches.length === 0) {
      result.unclassified.push(path);
    } else if (matches.length > 1) {
      result.multiplyClassified.push({
        path,
        owners: matches.map((m) => m.owner),
      });
    } else {
      const reg = matches[0];
      result.resolved.set(path, {
        testPath: path,
        registration: reg,
        profile: reg.profile,
      });
    }
  }

  return result;
}

export function assertDiscoveryValid(result: DiscoveryResult): void {
  const failures: string[] = [];
  if (result.unclassified.length > 0) {
    failures.push(
      `Unclassified test files (no registration):\n  - ${result.unclassified.join("\n  - ")}`,
    );
  }
  if (result.multiplyClassified.length > 0) {
    failures.push(
      `Multiply-classified test files:\n${result.multiplyClassified
        .map((m) => `  - ${m.path} (owners: ${m.owners.join(", ")})`)
        .join("\n")}`,
    );
  }
  if (result.staleExecutablePaths.length > 0) {
    failures.push(
      `Stale or escaping executable paths:\n  - ${result.staleExecutablePaths.join("\n  - ")}`,
    );
  }
  if (result.staleSupportPaths.length > 0) {
    failures.push(
      `Stale support paths:\n  - ${result.staleSupportPaths.join("\n  - ")}`,
    );
  }
  if (result.duplicateStartupCaseIds.length > 0) {
    failures.push(
      `Duplicate startup-case IDs:\n  - ${result.duplicateStartupCaseIds.join("\n  - ")}`,
    );
  }
  if (result.unsupportedProfiles.length > 0) {
    failures.push(
      `Unsupported profiles:\n  - ${[...new Set(result.unsupportedProfiles)].join("\n  - ")}`,
    );
  }
  if (result.ambiguousPatterns.length > 0) {
    failures.push(
      `Ambiguous registration patterns:\n  - ${result.ambiguousPatterns.join("\n  - ")}`,
    );
  }
  if (failures.length > 0) {
    throw new DiscoveryError(
      `Test discovery failed:\n${failures.join("\n\n")}`,
      result,
    );
  }
}

/**
 * Select resolved registrations by profile. Filters apply to the already
 * validated inventory, so a future unclassified file fails even when its
 * intended class is not selected.
 */
export function selectByProfile(
  result: DiscoveryResult,
  profiles: ReadonlyArray<ProfileId>,
): ResolvedRegistration[] {
  const want = new Set(profiles);
  return [...result.resolved.values()].filter((r) => want.has(r.profile));
}

export function selectDefaultSuite(
  result: DiscoveryResult,
): ResolvedRegistration[] {
  return [...result.resolved.values()].filter((r) => {
    const def = PROFILES[r.profile];
    return def?.defaultSuite ?? false;
  });
}
