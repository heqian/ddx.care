## 1. Capacity Ownership

- [ ] 1.1 Replace scalar active count and released history with an active job ID set
- [ ] 1.2 Implement atomic `tryStartWorkflow(jobId)` reservation with capacity checking
- [ ] 1.3 Implement idempotent `finishWorkflow(jobId)` ownership release
- [ ] 1.4 Ensure rate-limit pruning never mutates active workflow ownership

## 2. Request Lifecycle

- [ ] 2.1 Move workflow reservation after JSON parsing and schema validation
- [ ] 2.2 Generate the job ID before reservation and use it for every ownership transition
- [ ] 2.3 Wrap job creation, run creation, controller registration, and start setup in one compensation boundary
- [ ] 2.4 Mark an initialized job failed and release its exact reservation on synchronous startup errors

## 3. Cancellation and Shutdown

- [ ] 3.1 Remove workflow capacity release from the DELETE handler
- [ ] 3.2 Make DELETE idempotent for cancelled, failed, and completed jobs
- [ ] 3.3 Release capacity only from the workflow promise settlement path
- [ ] 3.4 Update health and graceful shutdown accounting to use active job ownership

## 4. Verification

- [ ] 4.1 Add tests for duplicate release, unknown release, pruning, and reservation at capacity
- [ ] 4.2 Add route tests for cancellation before settlement and repeated DELETE requests
- [ ] 4.3 Inject job creation, run creation, and synchronous start failures and verify exact cleanup
- [ ] 4.4 Add stress tests proving actual unsettled work never exceeds configured capacity
- [ ] 4.5 Update tests and specs that currently require immediate cancellation release
- [ ] 4.6 Run `bun run lint`, `bun run typecheck`, backend tests, and relevant E2E tests
