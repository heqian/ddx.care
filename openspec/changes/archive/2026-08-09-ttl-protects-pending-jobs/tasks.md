## 1. Config and Validation

- [x] 1.1 Add `PENDING_JOB_TIMEOUT_MS` to `src/backend/config.ts` (default `DIAGNOSIS_TIMEOUT_MS + 120000`), parsed and exported
- [x] 1.2 Add `validateConfig()` rules rejecting `JOB_TTL_MS < DIAGNOSIS_TIMEOUT_MS` and `PENDING_JOB_TIMEOUT_MS < DIAGNOSIS_TIMEOUT_MS` with messages naming both values
- [x] 1.3 Document `PENDING_JOB_TIMEOUT_MS` and the retention relationship in `.env.example` and `AGENTS.md`; correct the 5-minute sensitive-deployment guidance to clarify it applies to terminal retention only

## 2. Progress Store Cleanup

- [x] 2.1 Update `scrubStmt` in `src/backend/progress-store.ts` to also null `error` and to filter by terminal status
- [x] 2.2 Update `cleanupStmt` to filter by terminal status (`completed`, `failed`)
- [x] 2.3 Update `cleanupExpired(ttlMs)` to use the status-filtered statements
- [x] 2.4 Add a `timeoutPending(timeoutMs)` method that finds pending jobs older than the cutoff, aborts their controller via `abortStore`, and marks them `failed("Diagnosis timed out")`

## 3. Startup and Timer Wiring

- [x] 3.1 In `index.ts`, call `progressStore.cleanupExpired(JOB_TTL_MS)` once after `markStalePending()` and before starting the server
- [x] 3.2 In the existing cleanup interval, also call `progressStore.timeoutPending(PENDING_JOB_TIMEOUT_MS)`

## 4. Tests

- [x] 4.1 Add `tests/progress-store.test.ts` cases: pending job is not scrubbed or deleted by `cleanupExpired`; terminal `error` is scrubbed; `timeoutPending` aborts and fails an old pending job
- [x] 4.2 Add `tests/config.test.ts` cases: `JOB_TTL_MS < DIAGNOSIS_TIMEOUT_MS` rejects; `PENDING_JOB_TIMEOUT_MS < DIAGNOSIS_TIMEOUT_MS` rejects; equal/greater values pass
- [x] 4.3 Add `tests/api.test.ts` case: a pending job whose `createdAt` is older than `JOB_TTL_MS` remains accessible after cleanup runs
- [x] 4.4 Add a startup test asserting expired terminal jobs are cleaned before the server accepts connections

## 5. Verification

- [x] 5.1 Run `bun run lint` and fix any issues
- [x] 5.2 Run `bun run test` and ensure all tests pass
- [x] 5.3 Run `bun run typecheck`