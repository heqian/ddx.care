## ADDED Requirements

### Requirement: Cancel diagnosis endpoint

A `DELETE /v1/diagnose/:jobId` endpoint SHALL be available to cancel a running diagnostic workflow. The endpoint SHALL locate the job's `AbortController`, call `.abort()` on it, mark the job as `failed("Cancelled by user")` in the progress store, and decrement the concurrent workflow counter via `rateLimiter.finishWorkflow()`.

#### Scenario: Cancel a running workflow
- **WHEN** a client sends `DELETE /v1/diagnose/<jobId>` for a job that is `pending`
- **THEN** the server aborts the workflow, marks the job as `failed` with error "Cancelled by user", and returns `200 OK` with `{ "status": "cancelled" }`

#### Scenario: Cancel a completed job
- **WHEN** a client sends `DELETE /v1/diagnose/<jobId>` for a job that is already `completed`
- **THEN** the server returns `200 OK` with `{ "status": "already_completed" }` and does not modify the job

#### Scenario: Cancel a non-existent job
- **WHEN** a client sends `DELETE /v1/diagnose/<unknownId>` for a job that does not exist
- **THEN** the server returns `404 Not Found` with `{ "error": "Job not found" }`

#### Scenario: Cancel releases concurrency slot
- **WHEN** a running workflow is cancelled via the endpoint
- **THEN** `rateLimiter.activeWorkflows` decreases by 1, allowing a new workflow to start

### Requirement: AbortController map for running workflows

The server SHALL maintain a `Map<string, AbortController>` that stores the `AbortController` for each running workflow. When a workflow starts, its `AbortController` SHALL be added to the map. When a workflow completes, fails, or is cancelled, the `AbortController` SHALL be removed from the map.

#### Scenario: AbortController stored on workflow start
- **WHEN** a workflow begins execution for a given `jobId`
- **THEN** the `AbortController` for that workflow is stored in the map

#### Scenario: AbortController removed on workflow completion
- **WHEN** a workflow completes (success or failure)
- **THEN** the `AbortController` for that `jobId` is removed from the map

### Requirement: Frontend cancel button calls cancellation endpoint

The "Cancel" button in `WaitingRoom` SHALL call `DELETE /v1/diagnose/:jobId` before navigating back to the input form. If the cancellation request fails, the button SHALL still navigate back (graceful degradation).

#### Scenario: User clicks Cancel during active diagnosis
- **WHEN** the user clicks the Cancel button while a diagnosis is in progress
- **THEN** the frontend sends `DELETE /v1/diagnose/<jobId>` and navigates back to the input form