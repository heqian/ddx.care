## 1. Job Context Model

- [ ] 1.1 Define the job-keyed context and monotonic reducer transition types
- [ ] 1.2 Implement a versioned session credential store containing only job ID, token, and expiry
- [ ] 1.3 Add cleanup APIs for reset, cancellation, inactivity, expiry, and malformed storage
- [ ] 1.4 Add reducer and storage tests for multiple jobs and terminal-state monotonicity

## 2. Routing and Submission

- [ ] 2.1 Remove tokens from waiting and result route types and generated paths
- [ ] 2.2 Select visible state exclusively from the active route job ID
- [ ] 2.3 Store submission and retry job ID/token pairs before navigation
- [ ] 2.4 Disable retry while its request is pending and ignore responses after navigation away

## 3. Streaming and Recovery

- [ ] 3.1 Reset stream state and increment the request generation whenever the job ID changes
- [ ] 3.2 Add AbortSignals to status requests and cancel obsolete requests during cleanup
- [ ] 3.3 Replace overlapping polling intervals with serialized recursive polling
- [ ] 3.4 Ignore stale responses and prevent pending state from overwriting terminal state
- [ ] 3.5 Restore credentials and resume authenticated recovery after same-session refresh

## 4. Rendering and Privacy

- [ ] 4.1 Enforce exact route/result job ID matching before rendering results
- [ ] 4.2 Add explicit expired-authorization and missing-context states
- [ ] 4.3 Ensure reset and inactivity purge sensitive contexts and replace browser history where applicable
- [ ] 4.4 Verify no token is written to a URL, document title, or browser-visible error

## 5. Verification

- [ ] 5.1 Add component tests for two completed jobs and back/forward navigation
- [ ] 5.2 Add token-enabled E2E tests for waiting refresh, result refresh, retry, cancel, and expiry
- [ ] 5.3 Add race tests for stale polls, obsolete fetches, and route changes
- [ ] 5.4 Add privacy tests for reset and inactivity credential cleanup
- [ ] 5.5 Run `bun run lint`, `bun run typecheck`, frontend tests, backend API tests, and relevant E2E tests
