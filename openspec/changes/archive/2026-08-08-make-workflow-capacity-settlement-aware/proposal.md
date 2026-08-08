## Why

Cancellation decrements the workflow counter before the aborted work settles, so replacement jobs can start while cancelled LLM or tool work is still running. The released-job guard is bounded and cleared during pruning, allowing repeated cancellation of old failed jobs to decrement capacity belonging to unrelated active work.

## What Changes

- Replace scalar capacity accounting and released-ID history with an authoritative set of active job IDs.
- Reserve capacity for a specific job and release it only once, after that job's workflow promise settles.
- Make cancellation idempotent for pending, cancelled, failed, and completed jobs.
- Keep cancelled-but-unsettled work counted against the global concurrency limit.
- Make initialization failures release their exact reservation through one exception-safe path.
- Add cancellation, pruning, retry, and shutdown stress tests that compare configured capacity with actual running work.

## Capabilities

### New Capabilities

None.

### Modified Capabilities
- `workflow-safety`: Replaces the bounded released-ID double-decrement guard with exact active-job ownership and settlement-aware release.
- `workflow-cancellation`: Changes cancellation so abort requests do not release capacity until the workflow has actually settled.

## Impact

- `src/backend/utils/rate-limiter.ts`
- Diagnosis creation and cancellation handlers in `src/backend/api/routes.ts`
- Workflow promise lifecycle and graceful shutdown accounting
- Rate-limiter, route, cancellation, and shutdown tests
- Existing requirements that promise immediate capacity release on DELETE
