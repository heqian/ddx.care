## MODIFIED Requirements

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
