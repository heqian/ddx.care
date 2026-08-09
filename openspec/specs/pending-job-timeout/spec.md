## Purpose

Ensures active (pending) diagnostic jobs are never silently deleted by TTL cleanup, replacing silent deletion with an explicit timeout that cancels and fails the job so capacity, status, and cancellation remain consistent.

## ADDED Requirements

### Requirement: Pending jobs are timed out, not TTL-deleted

A configurable `PENDING_JOB_TIMEOUT_MS` (default: `DIAGNOSIS_TIMEOUT_MS` plus a 120-second settlement margin) SHALL govern the maximum lifetime of a pending job. When a pending job's `createdAt` exceeds `PENDING_JOB_TIMEOUT_MS`, the system SHALL abort its workflow (if still running), mark the job `failed` with a public reason indicating timeout, and release its capacity reservation. TTL cleanup SHALL NOT delete pending jobs.

#### Scenario: Pending job exceeds pending timeout
- **WHEN** a pending job's age exceeds `PENDING_JOB_TIMEOUT_MS` and a timeout sweep runs
- **THEN** the job is aborted, marked `failed("Diagnosis timed out")`, its capacity is released by settlement, and status/cancel endpoints return the failed state

#### Scenario: Pending job within timeout is not deleted by TTL
- **WHEN** `JOB_TTL_MS` is shorter than `PENDING_JOB_TIMEOUT_MS` and TTL cleanup runs while a job is still pending
- **THEN** the pending job is not deleted or scrubbed and remains accessible

#### Scenario: Pending timeout exceeds workflow timeout by default
- **WHEN** no `PENDING_JOB_TIMEOUT_MS` is configured
- **THEN** the default is `DIAGNOSIS_TIMEOUT_MS` plus a settlement margin, so a workflow running to its full timeout can still settle before pending expiry

### Requirement: Pending timeout validation relates to workflow timeout

`validateConfig()` SHALL reject `PENDING_JOB_TIMEOUT_MS` values that are less than `DIAGNOSIS_TIMEOUT_MS`, because a pending timeout shorter than the workflow timeout would fail jobs that are still within their allowed runtime.

#### Scenario: Pending timeout shorter than workflow timeout is rejected
- **WHEN** `PENDING_JOB_TIMEOUT_MS=60000` and `DIAGNOSIS_TIMEOUT_MS=900000`
- **THEN** startup fails with a configuration error explaining the relationship

#### Scenario: Pending timeout equal to workflow timeout is accepted
- **WHEN** `PENDING_JOB_TIMEOUT_MS=900000` and `DIAGNOSIS_TIMEOUT_MS=900000`
- **THEN** configuration validation passes