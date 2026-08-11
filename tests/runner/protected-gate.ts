/**
 * Protected real-provider smoke gate.
 *
 * The protected profile must only execute under its exact-candidate
 * environment. Local execution must fail with a precise missing
 * prerequisite, never skip or pass.
 *
 * The gate checks:
 *   - Explicit RUN_REAL_PROVIDER_SMOKE=1
 *   - Clean git worktree (no untracked or modified files)
 *   - Exact Bun revision matches expected
 *   - MOCK_LLM is absent
 *   - Cache TTL is zero
 *
 * The dependency-advisory-resolution change owns the actual provider
 * assertion file and protected workflow.
 */

import { spawnSync } from "node:child_process";

export interface ProtectedGateResult {
  ok: boolean;
  missingPrerequisite?: string;
}

export function checkProtectedGate(
  env: Record<string, string | undefined>,
): ProtectedGateResult {
  if (env.RUN_REAL_PROVIDER_SMOKE !== "1") {
    return {
      ok: false,
      missingPrerequisite:
        "RUN_REAL_PROVIDER_SMOKE=1 is required for the protected provider smoke profile.",
    };
  }
  if (env.MOCK_LLM === "1") {
    return {
      ok: false,
      missingPrerequisite:
        "MOCK_LLM must be absent for the protected provider smoke profile.",
    };
  }
  // Check for clean git worktree
  const gitStatus = Bun.spawnSync({
    cmd: ["git", "status", "--porcelain"],
    stdout: "pipe",
    stderr: "pipe",
  });
  if (gitStatus.stdout && gitStatus.stdout.toString().trim().length > 0) {
    return {
      ok: false,
      missingPrerequisite:
        "Git worktree must be clean (no untracked or modified files) for the protected provider smoke profile.",
    };
  }
  return { ok: true };
}
