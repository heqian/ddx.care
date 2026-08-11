/**
 * The authoritative parent runner.
 *
 * For a normal Bun test, the parent spawns `bun test <one-file>` in a fresh
 * child process. For a startup case, it prepares the declared fixture,
 * spawns the registration's declared application entry command, observes
 * readiness or expected exit, performs registered probes, terminates the
 * process, and reports the case/profile.
 *
 * Before each runner-owned process starts, the parent allocates one unique
 * canonical absolute temporary root (see environment.ts), exports it as
 * `APP_DATA_DIR`, and sets explicit leaves beneath it. Base profiles set
 * `MOCK_LLM=1`, `TOOL_CACHE_TTL_MS=0`, unset `TOOL_CACHE_KEY_SECRET`, and
 * set `ORPHADATA_ENABLED=0`. The parent removes inherited data-root,
 * leaf-path, cache-key, token, port, and live-run values before applying
 * the profile.
 *
 * The parent stops owned processes and recursively removes only the unique
 * data root on success, failure, timeout, or signal. Children run with
 * bounded parallelism and deterministic failure attribution.
 */

import { spawn, type Subprocess } from "bun";
import { existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { PROFILES, type ProfileId } from "./profiles";
import type { ResolvedRegistration } from "./discover";
import type { StartupCase } from "./registrations";
import {
  allocateChildEnvironment,
  verifyArtifactsBeneathRoot,
  type AllocateOptions,
} from "./environment";
import { generateCacheKey, generateTokenSecret } from "./crypto";

export interface ChildResult {
  testPath: string;
  owner: string;
  profile: ProfileId;
  exitCode: number | null;
  timedOut: boolean;
  signal: string | null;
  root: string;
  cleaned: boolean;
  artifactsBeneathRoot: boolean;
  stdout: string;
  stderr: string;
  durationMs: number;
}

export interface RunnerOptions {
  /** Timeout per child in ms. Default 120000 (2 min). */
  timeoutMs?: number;
  /** Max concurrent children. Default 1. */
  concurrency?: number;
  /** Repo root (defaults to two levels above this file). */
  repoRoot?: string;
  /** Whether to print child stdout/stderr to the parent. Default true. */
  verbose?: boolean;
  /** Override the bun binary (default "bun"). */
  bunBin?: string;
}

const REPO_ROOT = resolve(import.meta.dir, "..", "..");

function resolveRepoRoot(opts?: RunnerOptions): string {
  return opts?.repoRoot ?? REPO_ROOT;
}

export function profileToAllocateOptions(
  profile: ProfileId,
  overrides?: {
    port?: number;
    tokenSecret?: string;
    cacheKey?: string;
    cacheTtlMs?: number;
    enableAuditLog?: boolean;
    enableOrphadata?: boolean;
    mockLlm?: boolean;
    extraEnv?: Record<string, string>;
  },
): AllocateOptions {
  const def = PROFILES[profile];
  const base: AllocateOptions = {
    cacheTtlMs: 0,
    enableAuditLog: false,
    enableOrphadata: false,
    mockLlm: true,
    extraEnv: overrides?.extraEnv,
  };
  switch (def.cache) {
    case "disabled":
      base.cacheTtlMs = 0;
      break;
    case "enabled-positive":
      base.cacheTtlMs = overrides?.cacheTtlMs ?? 60_000;
      base.cacheKey = overrides?.cacheKey ?? generateCacheKey();
      break;
    case "startup-controlled":
      // Startup cases declare their own cache mode; the runner caller wires
      // the right TTL/key through overrides.
      base.cacheTtlMs = overrides?.cacheTtlMs ?? 0;
      if (overrides?.cacheKey) base.cacheKey = overrides.cacheKey;
      break;
  }
  switch (def.secret) {
    case "no-token-secret":
      base.tokenSecret = "";
      break;
    case "generated-rest-secret":
    case "generated-ws-ticket-secret":
      base.tokenSecret = overrides?.tokenSecret ?? generateTokenSecret();
      break;
    case "cache-startup-enabled":
    case "cache-startup-disabled":
    case "cache-startup-expected-failure":
      base.tokenSecret = "";
      break;
  }
  if (def.id === "orphadata-cache") {
    base.enableOrphadata = true;
  }
  if (overrides?.port !== undefined) base.port = overrides.port;
  if (overrides?.enableAuditLog !== undefined)
    base.enableAuditLog = overrides.enableAuditLog;
  if (overrides?.enableOrphadata !== undefined)
    base.enableOrphadata = overrides.enableOrphadata;
  if (overrides?.mockLlm !== undefined) base.mockLlm = overrides.mockLlm;

  // Restore live-run flags for live profiles after scrubbing.
  if (def.id === "live-integration") {
    base.liveIntegration = true;
  }
  if (def.id === "live-contract") {
    base.liveContract = true;
  }
  // Protected smoke must not have MOCK_LLM set.
  if (def.id === "real-provider-smoke") {
    base.mockLlm = false;
  }
  // Set network policy from the profile definition.
  base.networkPolicy = def.network;
  base.networkOrigin = `profile:${def.id}`;
  return base;
}

/**
 * Run a single resolved registration as a child `bun test <file>` process.
 * Returns the full child result including cleanup confirmation.
 */
export async function runChild(
  resolved: ResolvedRegistration,
  opts: RunnerOptions = {},
  allocateOpts?: AllocateOptions,
): Promise<ChildResult> {
  const repoRoot = resolveRepoRoot(opts);
  const startTime = Date.now();
  const allocate = allocateOpts ?? profileToAllocateOptions(resolved.profile);

  const childEnv = allocateChildEnvironment(allocate);
  const testPathAbs = join(repoRoot, resolved.testPath);

  let timedOut = false;
  let exitCode: number | null = null;
  const signal: string | null = null;
  let stdout = "";
  let stderr = "";

  let proc: Subprocess<"ignore", "pipe", "pipe"> | null = null;
  const bunBin = opts.bunBin ?? "bun";
  const preloadPath = resolve(repoRoot, "tests/runner/network-preload.ts");
  // Only add the preload if it exists; synthetic test trees may not have it.
  const preloadExists = existsSync(preloadPath);
  const cmd = preloadExists
    ? [bunBin, "--preload", preloadPath, "test", testPathAbs]
    : [bunBin, "test", testPathAbs];

  try {
    proc = Bun.spawn({
      cmd,
      cwd: repoRoot,
      env: childEnv.env,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    const timeoutMs = opts.timeoutMs ?? 120_000;
    const timer = setTimeout(() => {
      timedOut = true;
      try {
        proc?.kill();
      } catch {
        // Ignore kill errors during timeout.
      }
    }, timeoutMs);

    try {
      const [stdoutBuf, stderrBuf] = await Promise.all([
        new Response(proc.stdout).text(),
        new Response(proc.stderr).text(),
      ]);
      stdout = stdoutBuf;
      stderr = stderrBuf;
      const exit = await proc.exited;
      exitCode = exit;
    } finally {
      clearTimeout(timer);
    }

    if (opts.verbose !== false) {
      if (stdout) process.stdout.write(stdout);
      if (stderr) process.stderr.write(stderr);
    }
  } catch (err) {
    stderr += `\nRunner error: ${err instanceof Error ? err.message : String(err)}\n`;
    try {
      proc?.kill();
    } catch {
      // ignore
    }
  } finally {
    // Collect artifacts that should be beneath the root for verification.
    const leaves = [
      join(childEnv.root, "jobs.sqlite"),
      join(childEnv.root, "jobs.sqlite-wal"),
      join(childEnv.root, "jobs.sqlite-shm"),
      join(childEnv.root, "tool-cache.sqlite"),
      join(childEnv.root, "tool-cache.sqlite-wal"),
      join(childEnv.root, "tool-cache.sqlite-shm"),
      join(childEnv.root, "orphadata.sqlite"),
      join(childEnv.root, "orphadata.sqlite-wal"),
      join(childEnv.root, "orphadata.sqlite-shm"),
      join(childEnv.root, "audit.log"),
    ];
    const verification = verifyArtifactsBeneathRoot(childEnv.root, leaves);
    childEnv.cleanup();
    const cleaned = !existsSync(childEnv.root);
    return {
      testPath: resolved.testPath,
      owner: resolved.registration.owner,
      profile: resolved.profile,
      exitCode,
      timedOut,
      signal,
      root: childEnv.root,
      cleaned,
      artifactsBeneathRoot: verification.ok,
      stdout,
      stderr,
      durationMs: Date.now() - startTime,
    };
  }
}

/**
 * Run a parent-owned startup case: prepare the declared fixture, spawn the
 * declared application entry command, observe readiness or expected exit,
 * run probes, terminate, and clean up.
 */
export interface StartupCaseResult {
  caseId: string;
  profile: ProfileId;
  ready: boolean;
  exitCode: number | null;
  timedOut: boolean;
  root: string;
  cleaned: boolean;
  artifactsBeneathRoot: boolean;
  probeResults: Array<{ name: string; ok: boolean; error?: string }>;
  durationMs: number;
}

export async function runStartupCase(
  startupCase: StartupCase,
  profile: ProfileId,
  opts: RunnerOptions = {},
  allocateOpts?: AllocateOptions,
): Promise<StartupCaseResult> {
  const repoRoot = resolveRepoRoot(opts);
  const startTime = Date.now();
  const allocate = allocateOpts ?? profileToAllocateOptions(profile);

  const childEnv = allocateChildEnvironment(allocate);
  const port = allocate.port ?? 0;

  let proc: Subprocess<"ignore", "pipe", "pipe"> | null = null;
  let ready = false;
  let exitCode: number | null = null;
  let timedOut = false;
  const probeResults: Array<{ name: string; ok: boolean; error?: string }> = [];

  try {
    proc = Bun.spawn({
      cmd: startupCase.command,
      cwd: repoRoot,
      env: childEnv.env,
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    if (startupCase.readiness.kind === "http-ok") {
      const path = startupCase.readiness.path;
      const timeoutMs = startupCase.readiness.timeoutMs;
      const basePort = port || 3000;
      const url = `http://localhost:${basePort}${path}`;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const res = await fetch(url);
          if (res.ok) {
            ready = true;
            break;
          }
        } catch {
          // not ready yet
        }
        await new Promise((r) => setTimeout(r, 100));
      }
      if (!ready) timedOut = true;
    } else if (startupCase.readiness.kind === "exit") {
      const expected = startupCase.readiness.expectedCode;
      const timeoutMs = startupCase.readiness.timeoutMs;
      const timer = setTimeout(() => {
        timedOut = true;
        try {
          proc?.kill();
        } catch {
          // ignore
        }
      }, timeoutMs);
      try {
        const code = await proc.exited;
        exitCode = code;
        ready = code === expected;
      } finally {
        clearTimeout(timer);
      }
    }

    if (ready && startupCase.probes) {
      for (const probe of startupCase.probes) {
        try {
          await probe.run({ root: childEnv.root, port: port || 3000 });
          probeResults.push({ name: probe.name, ok: true });
        } catch (e) {
          probeResults.push({
            name: probe.name,
            ok: false,
            error: e instanceof Error ? e.message : String(e),
          });
        }
      }
    }
  } finally {
    try {
      if (proc && startupCase.readiness.kind === "http-ok") {
        proc.kill();
        exitCode = await proc.exited.catch(() => null);
      }
    } catch {
      // ignore
    }
    const leaves = [
      join(childEnv.root, "jobs.sqlite"),
      join(childEnv.root, "tool-cache.sqlite"),
      join(childEnv.root, "orphadata.sqlite"),
      join(childEnv.root, "audit.log"),
    ];
    const verification = verifyArtifactsBeneathRoot(childEnv.root, leaves);
    childEnv.cleanup();
    const cleaned = !existsSync(childEnv.root);
    return {
      caseId: startupCase.id,
      profile,
      ready,
      exitCode,
      timedOut,
      root: childEnv.root,
      cleaned,
      artifactsBeneathRoot: verification.ok,
      probeResults,
      durationMs: Date.now() - startTime,
    };
  }
}

export interface RunAllResult {
  results: ChildResult[];
  passed: number;
  failed: number;
  durationMs: number;
}

/**
 * Run a set of resolved registrations with bounded parallelism and finally
 * cleanup. Reports per-child owner, registration, profile, file, exit,
 * timeout, and cleanup result.
 */
export async function runAll(
  resolved: ResolvedRegistration[],
  opts: RunnerOptions = {},
): Promise<RunAllResult> {
  const startTime = Date.now();
  const concurrency = Math.max(1, opts.concurrency ?? 1);
  const results: ChildResult[] = [];
  const queue = [...resolved];

  async function worker(): Promise<void> {
    while (queue.length > 0) {
      const next = queue.shift();
      if (!next) break;
      const result = await runChild(next, opts);
      results.push(result);
    }
  }

  const workers: Promise<void>[] = [];
  for (let i = 0; i < concurrency; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);

  results.sort((a, b) => a.testPath.localeCompare(b.testPath));
  const passed = results.filter(
    (r) =>
      r.exitCode === 0 && !r.timedOut && r.cleaned && r.artifactsBeneathRoot,
  ).length;
  const failed = results.length - passed;

  return {
    results,
    passed,
    failed,
    durationMs: Date.now() - startTime,
  };
}

/**
 * Install signal handlers so owned processes are stopped and roots are
 * removed on interruption. Returns a function that removes the handlers.
 */
export function installSignalCleanup(
  cleanup: () => void,
  signals: Array<NodeJS.Signals> = ["SIGINT", "SIGTERM"],
): () => void {
  const handler = () => {
    cleanup();
    process.exit(130);
  };
  for (const sig of signals) {
    process.on(sig, handler);
  }
  return () => {
    for (const sig of signals) {
      process.off(sig, handler);
    }
  };
}
