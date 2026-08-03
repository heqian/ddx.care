## Why

The frontend stores one global result and one global token without binding either to a job ID. Route changes can therefore render one case under another case's URL, waiting-page refresh loses authorization, and retry discards the new token while retaining stale terminal state.

## What Changes

- Introduce a session-scoped job context keyed by `jobId`, containing only that job's token, request payload reference, stream state, and result.
- Render a result only when its `jobId` matches the active route.
- Reset stream and terminal state whenever the active job changes and ignore stale asynchronous responses.
- Persist the minimum token metadata needed for same-session waiting-page recovery, with explicit cleanup and expiry.
- Consume the new job ID and token together after every submission or retry.
- Remove capability tokens from result path segments and browser history.
- Add token-enabled refresh, retry, back/forward, multi-case, and stale-response tests.

## Capabilities

### New Capabilities
- `frontend-job-context-isolation`: Defines job-keyed client state, route/result matching, same-session recovery, stale-response rejection, and sensitive context cleanup.

### Modified Capabilities

None.

## Impact

- `src/frontend/main.tsx`, `hooks/useRouter.ts`, and `hooks/useJobStream.ts`
- Frontend API types and diagnosis submission/retry flows
- Waiting and results route formats
- Session storage retention and cleanup behavior
- Frontend component tests and token-enabled Playwright scenarios
