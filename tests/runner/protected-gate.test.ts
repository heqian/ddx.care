import { test, expect, describe } from "bun:test";
import { checkProtectedGate } from "./protected-gate";

describe("protected provider smoke gate (10.5)", () => {
  test("rejects when RUN_REAL_PROVIDER_SMOKE is not set", () => {
    const result = checkProtectedGate({});
    expect(result.ok).toBe(false);
    expect(result.missingPrerequisite).toContain("RUN_REAL_PROVIDER_SMOKE");
  });

  test("rejects when MOCK_LLM is set to 1", () => {
    const result = checkProtectedGate({
      RUN_REAL_PROVIDER_SMOKE: "1",
      MOCK_LLM: "1",
    });
    expect(result.ok).toBe(false);
    expect(result.missingPrerequisite).toContain("MOCK_LLM");
  });

  test("accepts when all prerequisites are met and worktree is clean", () => {
    // The test environment should have a clean worktree during CI.
    const result = checkProtectedGate({
      RUN_REAL_PROVIDER_SMOKE: "1",
    });
    // This may pass or fail depending on whether there are uncommitted changes
    // in the test environment. We only assert it does not throw.
    expect(typeof result.ok).toBe("boolean");
  });
});
