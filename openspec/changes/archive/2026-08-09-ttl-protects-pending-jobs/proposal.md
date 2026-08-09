## Why

The TTL cleanup deletes jobs by `createdAt` without excluding pending jobs, and separately fails to scrub the `error` column. A short retention setting (e.g., the documented `JOB_TTL_MS=300000` for sensitive deployments) can delete an active diagnosis whose 15-minute workflow is still running, leaving the workflow consuming capacity and provider budget while status and cancellation return 404. Scrubbing also nulls `result` and `progress` but leaves `error` verbatim, so PHI-derived provider messages can remain recoverable past the intended retention boundary.

## What Changes

- **TTL cleanup excludes pending jobs**: `cleanupExpired` SHALL NOT delete or scrub jobs whose status is `pending`. Only terminal jobs (`completed`, `failed`) are eligible for TTL expiry.
- **Scrub the error column**: the scrub-before-delete statement SHALL null `result`, reset `progress` to `'[]'`, and null `error` in the same transaction.
- **Stale pending timeout**: a separate, configurable `PENDING_JOB_TIMEOUT_MS` SHALL cancel and fail pending jobs whose `createdAt` exceeds the timeout, replacing silent TTL deletion for active work. Default SHALL exceed `DIAGNOSIS_TIMEOUT_MS`.
- **Startup expired cleanup**: on startup, the system SHALL run expired-terminal cleanup immediately in addition to `markStalePending()`, so jobs that expired during downtime are removed before serving requests.
- **Validate retention relationship**: `validateConfig()` SHALL reject configurations where `JOB_TTL_MS` is less than `DIAGNOSIS_TIMEOUT_MS` for terminal expiry, and where `PENDING_JOB_TIMEOUT_MS` is less than `DIAGNOSIS_TIMEOUT_MS`.

## Capabilities

### New Capabilities

- `pending-job-timeout`: Cancels and fails pending jobs that exceed a configurable timeout, distinct from terminal-job TTL expiry, so active work is never silently deleted.

### Modified Capabilities

- `job-lifecycle`: TTL cleanup SHALL exclude pending jobs and SHALL scrub the `error` column; startup SHALL clean expired terminal jobs immediately; config validation SHALL reject retention settings shorter than the workflow timeout.

## Impact

- **Backend**: `src/backend/progress-store.ts` (cleanup logic, scrub statement, stale-pending timeout), `src/backend/config.ts` (new `PENDING_JOB_TIMEOUT_MS`, validation), `index.ts` (startup cleanup, timeout timer).
- **Tests**: `tests/progress-store.test.ts`, `tests/config.test.ts`, `tests/api.test.ts` (pending-preservation, error scrub, timeout, startup cleanup).
- **Documentation**: `AGENTS.md`, `.env.example` (new env var, corrected retention guidance).