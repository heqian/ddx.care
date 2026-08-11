/**
 * Temporary-environment containment for the authoritative parent runner.
 *
 * Before each runner-owned process starts, the parent allocates one unique
 * canonical OS temporary directory, exports that path as `APP_DATA_DIR`, and
 * sets `DB_PATH`, `TOOL_CACHE_DB_PATH`, `ORPHADATA_DB_PATH`, and enabled
 * `AUDIT_LOG_PATH` to explicit absolute leaves beneath it. The parent
 * validates its generated environment and fixtures lexically/canonically
 * before spawn and verifies created artifacts afterward. It does not parse
 * application-relative paths, implement the production data-root resolver,
 * or define mount/no-follow behavior.
 */

import { mkdtempSync, rmSync, existsSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, isAbsolute, relative, resolve } from "node:path";

export interface ChildEnvironment {
  /** Unique canonical absolute temporary root. */
  root: string;
  /** Environment variables to inject into the child process. */
  env: Record<string, string>;
  /** Cleanup function: recursively removes only this child's data root. */
  cleanup: () => void;
}

export interface RootLeaves {
  dbPath: string;
  toolCacheDbPath: string;
  orphadataDbPath: string;
  auditLogPath: string;
}

export function allocateRootLeaves(root: string): RootLeaves {
  return {
    dbPath: join(root, "jobs.sqlite"),
    toolCacheDbPath: join(root, "tool-cache.sqlite"),
    orphadataDbPath: join(root, "orphadata.sqlite"),
    auditLogPath: join(root, "audit.log"),
  };
}

/**
 * Return true iff `path` is inside `root` (canonical, absolute, no traversal
 * escape). Used to validate that created/assigned leaves stayed beneath the
 * owning child root.
 */
export function isBeneathRoot(path: string, root: string): boolean {
  const absPath = isAbsolute(path) ? path : resolve(root, path);
  const rel = relative(root, absPath);
  if (rel === "") return true;
  return !rel.startsWith("..") && !isAbsolute(rel);
}

export interface AllocateOptions {
  /** Optional PORT override; otherwise a free port is allocated. */
  port?: number;
  /** Token secret (REST, WS, or empty for dev mode). */
  tokenSecret?: string;
  /** Cache key (only for cache-enabled profiles). */
  cacheKey?: string;
  /** Cache TTL. 0 disables caching. */
  cacheTtlMs: number;
  /** Whether to enable the audit log leaf. */
  enableAuditLog: boolean;
  /** Whether Orphadata startup is enabled. */
  enableOrphadata: boolean;
  /** Mock LLM mode. */
  mockLlm: boolean;
  /** Whether to set RUN_INTEGRATION=1 (live-integration profile only). */
  liveIntegration?: boolean;
  /** Whether to set RUN_CONTRACT=1 (live-contract profile only). */
  liveContract?: boolean;
  /** Network policy for the child: "loopback-only" or "provider-allowlist". */
  networkPolicy?:
    | "loopback-only"
    | "provider-allowlist"
    | "provider-smoke-allowlist";
  /** Originating registration ID for network guard diagnostics. */
  networkOrigin?: string;
  /** Provider host allowlist for live/protected profiles. */
  networkAllowedHosts?: string[];
  /** Extra environment overrides. */
  extraEnv?: Record<string, string>;
}

/** Inherited environment keys that must be scrubbed before applying a profile. */
const SCRUBBED_KEYS = [
  "APP_DATA_DIR",
  "DB_PATH",
  "TOOL_CACHE_DB_PATH",
  "TOOL_CACHE_KEY_SECRET",
  "ORPHADATA_DB_PATH",
  "ORPHADATA_ENABLED",
  "AUDIT_LOG_PATH",
  "WS_TOKEN_SECRET",
  "PORT",
  "MOCK_LLM",
  "TOOL_CACHE_TTL_MS",
  "RUN_INTEGRATION",
  "RUN_CONTRACT",
  "DDX_NETWORK_POLICY",
  "DDX_NETWORK_ORIGIN",
  "DDX_NETWORK_ALLOWED_HOSTS",
];

export function sanitizeInheritedEnv(
  source: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const out: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(source)) {
    if (SCRUBBED_KEYS.includes(k)) continue;
    out[k] = v;
  }
  return out;
}

export function allocateChildEnvironment(
  opts: AllocateOptions,
  now: () => number = Date.now,
): ChildEnvironment {
  const root = mkdtempSync(join(tmpdir(), "ddx-child-"));
  const leaves = allocateRootLeaves(root);

  // Pre-create the root leaves directory tree so child imports find them.
  mkdirSync(root, { recursive: true });

  const sanitized = sanitizeInheritedEnv(process.env as Record<string, string>);
  const env: Record<string, string> = {};
  for (const [k, v] of Object.entries(sanitized)) {
    if (v !== undefined) env[k] = v;
  }

  env.APP_DATA_DIR = root;
  env.DB_PATH = leaves.dbPath;
  env.TOOL_CACHE_DB_PATH = leaves.toolCacheDbPath;
  env.ORPHADATA_DB_PATH = leaves.orphadataDbPath;
  env.TOOL_CACHE_TTL_MS = String(opts.cacheTtlMs);
  env.ORPHADATA_ENABLED = opts.enableOrphadata ? "1" : "0";
  env.MOCK_LLM = opts.mockLlm ? "1" : "";

  if (opts.enableAuditLog) {
    env.AUDIT_LOG_PATH = leaves.auditLogPath;
  } else {
    delete env.AUDIT_LOG_PATH;
  }

  if (opts.tokenSecret !== undefined) {
    env.WS_TOKEN_SECRET = opts.tokenSecret;
  } else {
    delete env.WS_TOKEN_SECRET;
  }

  if (opts.cacheKey && opts.cacheTtlMs > 0) {
    env.TOOL_CACHE_KEY_SECRET = opts.cacheKey;
  } else {
    delete env.TOOL_CACHE_KEY_SECRET;
  }

  if (opts.port !== undefined) {
    env.PORT = String(opts.port);
  }

  // Restore live-run flags that were scrubbed from the inherited environment.
  // The profile owns these flags; they are set here, not inherited from the
  // parent process.
  if (opts.liveIntegration) {
    env.RUN_INTEGRATION = "1";
  }
  if (opts.liveContract) {
    env.RUN_CONTRACT = "1";
  }

  for (const [k, v] of Object.entries(opts.extraEnv ?? {})) {
    env[k] = v;
  }

  // Install network guard environment for the preload.
  // The preload reads these and installs the guard before any test imports.
  const networkPolicy = opts.networkPolicy ?? "loopback-only";
  env.DDX_NETWORK_POLICY = networkPolicy;
  env.DDX_NETWORK_ORIGIN = opts.networkOrigin ?? "unknown";
  if (networkPolicy !== "loopback-only" && opts.networkAllowedHosts) {
    env.DDX_NETWORK_ALLOWED_HOSTS = opts.networkAllowedHosts.join(",");
  } else {
    delete env.DDX_NETWORK_ALLOWED_HOSTS;
  }
  // Scrub these from the inherited env so they cannot leak into children.
  delete env.DDX_NETWORK_POLICY;
  delete env.DDX_NETWORK_ORIGIN;
  delete env.DDX_NETWORK_ALLOWED_HOSTS;
  // Re-set after scrubbing (the scrub above was defensive against inherited values).
  env.DDX_NETWORK_POLICY = networkPolicy;
  env.DDX_NETWORK_ORIGIN = opts.networkOrigin ?? "unknown";
  if (networkPolicy !== "loopback-only" && opts.networkAllowedHosts) {
    env.DDX_NETWORK_ALLOWED_HOSTS = opts.networkAllowedHosts.join(",");
  }

  // Canonical validation: every leaf must be beneath the root.
  for (const leaf of Object.values(leaves)) {
    if (!isBeneathRoot(leaf, root)) {
      throw new Error(
        `Leaf path ${leaf} escaped the child root ${root} during allocation`,
      );
    }
  }

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    try {
      rmSync(root, { recursive: true, force: true });
    } catch {
      // Best-effort cleanup; the OS temporary root is safe to reap.
    }
  };

  return { root, env, cleanup };
}

/**
 * Verify that every configured or created database, sidecar, audit file,
 * and audit rotation stayed beneath the owning child root.
 */
export function verifyArtifactsBeneathRoot(
  root: string,
  artifacts: string[],
): { ok: boolean; escapees: string[] } {
  const escapees: string[] = [];
  for (const a of artifacts) {
    if (existsSync(a) && !isBeneathRoot(a, root)) {
      escapees.push(a);
    }
  }
  return { ok: escapees.length === 0, escapees };
}
