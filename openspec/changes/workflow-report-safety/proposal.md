## Why

The `generateFinalReport()` function in `diagnostic-workflow.ts` has a tiered fallback design: every failure path gracefully returns a `createMinimalReport(...)` — **except the very last branch** (line 669), which `throw`s when the no-structured-output fallback yields neither parseable JSON text nor a valid `.object`. This throw propagates through `runDiagnosis`'s catch block, re-wraps, and fails the entire diagnostic job — producing no report at all, even after specialists have already consulted. This contradicts the stated design goal: "never fail, always produce some report." The frontend shows a generic error instead of a usable (if degraded) diagnosis.

## What Changes

- **Replace the final `throw` with `createMinimalReport()`** — In `generateFinalReport()`, when all fallback paths are exhausted, return a minimal report with an explanatory message instead of throwing.
- **Add test coverage for the final fallback path** — The existing tests cover the `fallbackResponse.object` branch but not the case where neither text nor `.object` is usable.
- **Improve error context in the minimal report** — Include a summary of what was attempted (structured output, retry, no-structured-output fallback) so the user understands why the report is degraded.

## Capabilities

### New Capabilities

(None)

### Modified Capabilities

- `workflow-safety`: `generateFinalReport()` SHALL never throw — all failure paths SHALL return a minimal report

## Impact

- **Backend workflow** (`src/backend/workflows/diagnostic-workflow.ts`): Replace `throw new Error(...)` at line 669 with `return createMinimalReport(...)`
- **Tests** (`tests/workflow.test.ts`): Add test case covering the final fallback path (no parseable text, no `.object`)
