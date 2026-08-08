## ADDED Requirements

### Requirement: Cancel diagnosis endpoint

A `DELETE /v1/diagnose/:jobId` endpoint SHALL request cancellation of a running diagnostic workflow. For a pending job, the endpoint SHALL abort its controller, mark the persisted job as cancelled or failed with the public reason "Cancelled by user", and return a successful cancellation response. The endpoint SHALL NOT release workflow capacity; capacity SHALL remain owned by the job until its workflow promise settles.

#### Scenario: Cancel a running workflow
- **WHEN** a client sends `DELETE /v1/diagnose/<jobId>` for a pending job
- **THEN** the server requests abort, records cancellation, returns `200 OK` with `{ "status": "cancelled" }`, and continues counting the job until settlement

#### Scenario: Cancelled workflow settles
- **WHEN** the cancelled workflow promise reaches its terminal `finally` path
- **THEN** the job's capacity reservation is released exactly once

#### Scenario: Cancel a completed job
- **WHEN** a client sends DELETE for a completed job
- **THEN** the server returns `200 OK` with `{ "status": "already_completed" }` and does not modify capacity

#### Scenario: Cancel a failed or already-cancelled job
- **WHEN** a client repeats DELETE for a failed or cancelled job
- **THEN** the server returns its terminal status idempotently and does not modify capacity

#### Scenario: Cancel a non-existent job
- **WHEN** a client sends DELETE for a job that does not exist
- **THEN** the server returns `404 Not Found` with `{ "error": "Job not found" }`

#### Scenario: Cancel does not admit replacement work prematurely
- **WHEN** the server is at capacity and one active job receives a cancellation request but has not settled
- **THEN** a replacement diagnosis is rejected until the cancelled workflow settles and releases its reservation

### Requirement: AbortController map for running workflows

The server SHALL maintain a `Map<string, AbortController>` that stores the `AbortController` for each running workflow. When a workflow starts, its `AbortController` SHALL be added to the map. The controller SHALL remain available after a cancellation request and SHALL be removed when the workflow promise settles.

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
