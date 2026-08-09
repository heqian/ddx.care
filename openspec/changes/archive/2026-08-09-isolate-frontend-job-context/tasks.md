## 1. Job Context Model

- [x] 1.1 Define the job-keyed context and monotonic reducer transition types
- [x] 1.2 Implement a versioned session credential store containing only job ID, token, and expiry
- [x] 1.3 Add cleanup APIs for reset, cancellation, inactivity, expiry, and malformed storage
- [x] 1.4 Add reducer and storage tests for multiple jobs and terminal-state monotonicity

## 2. Routing and Submission

- [x] 2.1 Remove tokens from waiting and result route types and generated paths
- [x] 2.2 Select visible state exclusively from the active route job ID
- [x] 2.3 Store submission and retry job ID/token pairs before navigation
- [x] 2.4 Disable retry while its request is pending and ignore responses after navigation away

## 3. Streaming and Recovery

- [x] 3.1 Reset stream state and increment the request generation whenever the job ID changes
- [x] 3.2 Add AbortSignals to status requests and cancel obsolete requests during cleanup
- [x] 3.3 Replace overlapping polling intervals with serialized recursive polling
- [x] 3.4 Ignore stale responses and prevent pending state from overwriting terminal state
- [x] 3.5 Restore credentials and resume authenticated recovery after same-session refresh

## 4. Rendering and Privacy

- [x] 4.1 Enforce exact route/result job ID matching before rendering results
- [x] 4.2 Add explicit expired-authorization and missing-context states
- [x] 4.3 Ensure reset and inactivity purge sensitive contexts and replace browser history where applicable
- [x] 4.4 Verify no token is written to a URL, document title, or browser-visible error

## 5. Verification

- [x] 5.1 Add component tests for two completed jobs and back/forward navigation
- [x] 5.2 Add token-enabled E2E tests for waiting refresh, result refresh, retry, cancel, and expiry
- [x] 5.3 Add race tests for stale polls, obsolete fetches, and route changes
- [x] 5.4 Add privacy tests for reset and inactivity credential cleanup
- [x] 5.5 Run `bun run lint`, `bun run typecheck`, frontend tests, backend API tests, and relevant E2E tests
