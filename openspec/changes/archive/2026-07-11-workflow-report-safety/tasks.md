## 1. Fix generateFinalReport Terminal Branch

- [x] 1.1 In `src/backend/workflows/diagnostic-workflow.ts`, replace the `throw new Error(...)` at line 669 (inside `generateFinalReport()`) with `return createMinimalReport(...)` containing an explanatory message that all fallback strategies were exhausted.
- [x] 1.2 Verify the abort-signal handling in the surrounding `withRetry`/catch blocks is unaffected — aborts must still propagate, not be caught by the fallback chain.

## 2. Testing

- [x] 2.1 Add test in `tests/workflow.test.ts` covering the terminal fallback path: mock the CMO so that structured output throws, no-structured-output fallback returns empty text and no `.object`, and assert that `generateFinalReport()` returns a minimal report (does not throw).
- [x] 2.2 Add test asserting the minimal report message in this path includes text about fallback exhaustion.
- [x] 2.3 Run `bun run lint && bun run typecheck && bun run test` to verify all changes.
