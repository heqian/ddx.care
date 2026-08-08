## ADDED Requirements

### Requirement: Concurrency slot release is guarded against double-decrement

The concurrency limiter SHALL maintain the exact set of job IDs that currently own workflow capacity. Reserving capacity SHALL add a specific job ID atomically if capacity is available. Releasing capacity SHALL remove that job ID only if it currently owns a reservation. Pruning rate-limit history SHALL NOT clear active workflow ownership.

#### Scenario: Workflow reserves and releases capacity normally
- **WHEN** a validated diagnosis reserves capacity for a job and that workflow later settles
- **THEN** the job ID is removed exactly once and active workflow count decreases by one

#### Scenario: Duplicate release for the same job
- **WHEN** release is requested more than once for a settled job ID
- **THEN** every request after the first is a no-op and cannot affect another workflow

#### Scenario: Release requested for an unknown job
- **WHEN** release is requested for a job ID that does not own capacity
- **THEN** active workflow ownership remains unchanged

#### Scenario: Rate-limit pruning runs during active work
- **WHEN** rate-limit history is pruned while workflows are running
- **THEN** all active job reservations remain present and counted

#### Scenario: Capacity is full
- **WHEN** the number of active job IDs equals the configured workflow limit
- **THEN** no additional job can reserve capacity until an owning workflow settles

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

The report-generation operation SHALL return a typed report outcome for every non-abort terminal path. Successful generation SHALL return `available` with a validated report. Exhausted or unavailable generation SHALL return `generation_failed`. The operation SHALL only throw when cancellation, timeout, or an unrecoverable application invariant requires the workflow itself to fail.

#### Scenario: All fallbacks exhausted returns generation failure
- **WHEN** structured output, correction, and bounded fallback generation are exhausted
- **THEN** the operation returns a `generation_failed` outcome and does not synthesize a diagnosis

#### Scenario: Generation failure includes a stable explanation
- **WHEN** a `generation_failed` outcome is returned
- **THEN** it includes a stable public error code and fixed user-facing message without raw provider details

#### Scenario: Abort signal still propagates as an error
- **WHEN** the abort signal is triggered by user cancellation or timeout during report generation
- **THEN** the abort condition propagates as a workflow failure and is not caught as a generation fallback
