## MODIFIED Requirements

### Requirement: Job TTL default increased to 60 minutes

The default value of `JOB_TTL_MS` SHALL be `60 * 60 * 1000` (60 minutes) instead of the previous `30 * 60 * 1000` (30 minutes). This provides sufficient margin for workflows that run up to 15 minutes, plus time for clients to retrieve results after completion. TTL expiry SHALL apply only to terminal jobs (`completed`, `failed`); pending jobs SHALL be governed by `PENDING_JOB_TIMEOUT_MS` and SHALL NOT be deleted by TTL cleanup.

#### Scenario: Job result available 45 minutes after creation
- **WHEN** a terminal job was created at T=0 and completed at T=14m
- **THEN** the job result is still available at T=45m (within the 60-minute TTL)

#### Scenario: Terminal job result expired after 61 minutes
- **WHEN** a terminal job was created at T=0 and the cleanup interval runs at T=61m
- **THEN** the job is scrubbed and removed from the database

#### Scenario: Pending job is not TTL-deleted
- **WHEN** a job is still pending and TTL cleanup runs after `JOB_TTL_MS` has elapsed since `createdAt`
- **THEN** the pending job is not deleted or scrubbed and remains accessible via status and cancellation endpoints

### Requirement: Stale pending jobs marked as failed on server startup

On server startup, before accepting connections, the system SHALL call `progressStore.markStalePending()` which updates all jobs with `status = "pending"` to `status = "failed"` with error message "Server restarted — job interrupted". This prevents clients from waiting indefinitely for a job that will never complete. The system SHALL also run expired-terminal cleanup immediately so jobs that expired during downtime are removed before serving requests.

#### Scenario: Server restarts with pending jobs
- **WHEN** the server starts and there are 3 jobs with `status = "pending"` in SQLite
- **THEN** all 3 jobs are updated to `status = "failed"` with error "Server restarted — job interrupted"

#### Scenario: Server starts with no pending jobs
- **WHEN** the server starts and there are no pending jobs
- **THEN** `markStalePending()` runs without error and no jobs are modified

#### Scenario: Expired terminal jobs removed on startup
- **WHEN** the server starts and there are terminal jobs older than `JOB_TTL_MS` that expired during downtime
- **THEN** those jobs are scrubbed and removed before the server accepts connections

### Requirement: TTL cleanup scrubs result, progress, and error before deletion

Before deleting an expired terminal job, the system SHALL run an `UPDATE` that sets `result = NULL`, `progress = '[]'`, and `error = NULL` in the same transaction as the subsequent `DELETE`. This reduces recoverability of PHI-derived report data, progress events, and provider error messages from disk images where SQLite has not yet reclaimed pages.

#### Scenario: Expired terminal job is scrubbed before deletion
- **WHEN** cleanup runs on an expired completed job whose `result`, `progress`, and `error` columns contain data
- **THEN** all three columns are nulled/reset in the same transaction before the row is deleted

#### Scenario: Failed job error is scrubbed before deletion
- **WHEN** cleanup runs on an expired failed job whose `error` column contains a provider error message
- **THEN** the `error` column is nulled before the row is deleted

### Requirement: Terminal TTL validation relates to workflow timeout

`validateConfig()` SHALL reject `JOB_TTL_MS` values that are less than `DIAGNOSIS_TIMEOUT_MS`, because a terminal TTL shorter than the workflow timeout could delete a job that completed near the timeout before the client can retrieve it.

#### Scenario: Terminal TTL shorter than workflow timeout is rejected
- **WHEN** `JOB_TTL_MS=300000` and `DIAGNOSIS_TIMEOUT_MS=900000`
- **THEN** startup fails with a configuration error explaining the relationship

#### Scenario: Terminal TTL longer than workflow timeout is accepted
- **WHEN** `JOB_TTL_MS=3600000` and `DIAGNOSIS_TIMEOUT_MS=900000`
- **THEN** configuration validation passes