## 1. Capacity Ownership

- [x] 1.1 Replace scalar active count and released history with an active job ID set
- [x] 1.2 Implement atomic `tryStartWorkflow(jobId)` reservation with capacity checking
- [x] 1.3 Implement idempotent `finishWorkflow(jobId)` ownership release
- [x] 1.4 Ensure rate-limit pruning never mutates active workflow ownership

## 2. Request Lifecycle

- [x] 2.1 Move workflow reservation after JSON parsing and schema validation
- [x] 2.2 Generate the job ID before reservation and use it for every ownership transition
- [x] 2.3 Wrap job creation, run creation, controller registration, and start setup in one compensation boundary
- [x] 2.4 Mark an initialized job failed and release its exact reservation on synchronous startup errors

## 3. Cancellation and Shutdown

- [x] 3.1 Remove workflow capacity release from the DELETE handler
- [x] 3.2 Make DELETE idempotent for cancelled, failed, and completed jobs
- [x] 3.3 Release capacity only from the workflow promise settlement path
- [x] 3.4 Update health and graceful shutdown accounting to use active job ownership

## 4. Verification

- [x] 4.1 Add tests for duplicate release, unknown release, pruning, and reservation at capacity
- [x] 4.2 Add route tests for cancellation before settlement and repeated DELETE requests
- [x] 4.3 Inject job creation, run creation, and synchronous start failures and verify exact cleanup
- [x] 4.4 Add stress tests proving actual unsettled work never exceeds configured capacity
- [x] 4.5 Update tests and specs that currently require immediate cancellation release
- [x] 4.6 Run `bun run lint`, `bun run typecheck`, backend tests, and relevant E2E tests
