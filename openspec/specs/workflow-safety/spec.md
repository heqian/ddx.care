## ADDED Requirements

### Requirement: Concurrency slot release is guarded against double-decrement

The `finishWorkflow()` method on the rate limiter SHALL maintain a `Set<string>` of job IDs that have already released their concurrency slot. If `finishWorkflow()` is called for a job ID already present in the set, the call SHALL be a no-op and SHALL NOT decrement the active workflow count.

#### Scenario: Normal single finishWorkflow call
- **WHEN** a workflow completes and `finishWorkflow(jobId)` is called for the first time
- **THEN** the active workflow count decrements by 1 and the job ID is recorded in the released set

#### Scenario: Duplicate finishWorkflow call from cancel path
- **WHEN** `finishWorkflow(jobId)` is called a second time (e.g., from both the DELETE handler and the workflow `.finally()` block)
- **THEN** the call returns immediately without modifying the active workflow count, and the active count reflects only one release

#### Scenario: Released set does not leak memory indefinitely
- **WHEN** the released set contains many job IDs from completed workflows
- **THEN** the `prune()` method (called every `RATE_LIMIT_PRUNE_INTERVAL_MS`) SHALL clear the released set alongside clearing expired rate-limit entries

### Requirement: progressStore.complete() does not overwrite failed job status

The `complete()` method on `JobStore` SHALL read the current job row before writing. If the current status is `"failed"`, the method SHALL log a warning and return without modifying the job, preserving the failure reason (e.g., "Cancelled by user").

#### Scenario: Complete called after job already cancelled
- **WHEN** a workflow promise resolves after the job was already marked `failed("Cancelled by user")` via the DELETE handler
- **THEN** `complete()` reads the current status, finds `"failed"`, logs a structured warning, and returns without overwriting

#### Scenario: Complete called for a non-failed job
- **WHEN** `complete()` is called for a job currently in `"pending"` status
- **THEN** the job is updated to `"completed"` with the result data, as before

### Requirement: Workflow abort distinguishes cancellation from timeout

When a workflow's abort signal fires, the error handler SHALL inspect `abortController.signal.reason` to distinguish between user-initiated cancellation and timeout. Cancellation SHALL produce an error with message "Diagnosis cancelled by user". Timeout SHALL produce an error with message "Diagnosis timed out after {DIAGNOSIS_TIMEOUT_MS}ms".

#### Scenario: User cancels via DELETE endpoint
- **WHEN** the DELETE handler aborts the workflow's `AbortController` and the in-flight `agent.generate()` throws `AbortError`
- **THEN** the catch block detects the abort signal was triggered by user action (not timeout) and throws `new Error("Diagnosis cancelled by user")`

#### Scenario: Workflow times out naturally
- **WHEN** the `DIAGNOSIS_TIMEOUT_MS` timer fires and aborts the controller with a timeout reason
- **THEN** the catch block detects the timeout reason and throws `new Error("Diagnosis timed out after {DIAGNOSIS_TIMEOUT_MS}ms")`

#### Scenario: Cancelled job is not treated as a generation failure
- **WHEN** a cancelled job's error propagates to the route handler
- **THEN** the job is marked `failed("Cancelled by user")` not `failed("Diagnosis generation failed: ...")`

### Requirement: generateFinalReport always returns a report

The `generateFinalReport()` function SHALL never throw an exception. All failure paths — including the terminal case where no structured output, no parseable text, and no `.object` are available — SHALL return a minimal report via `createMinimalReport()` with an explanatory message. The function SHALL only throw if the abort signal is triggered (user cancellation or timeout).

#### Scenario: All fallbacks exhausted returns minimal report
- **WHEN** the CMO's structured output fails validation, the correction retry fails, the no-structured-output fallback produces no parseable text, and `fallbackResponse.object` is falsy
- **THEN** `generateFinalReport()` returns a `createMinimalReport()` result with a message explaining that all fallbacks were exhausted, and does not throw

#### Scenario: Minimal report includes explanatory message
- **WHEN** the terminal fallback path is reached
- **THEN** the returned minimal report's message field includes text indicating report generation failed after all retries and fallbacks

#### Scenario: Abort signal still propagates as an error
- **WHEN** the abort signal is triggered during `generateFinalReport()` (user cancellation or timeout)
- **THEN** the abort error propagates as before — this is not a report-generation failure and SHALL NOT be caught as a fallback case
