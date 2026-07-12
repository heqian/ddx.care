## ADDED Requirements

### Requirement: Job data scrubbed before deletion

When `cleanupExpired()` removes expired jobs, it SHALL first null out the `result` column and reset the `progress` column to `'[]'` for each expired job, then perform the `DELETE`. This reduces recoverability of PHI-derived data from disk images where SQLite has not yet reclaimed the pages.

#### Scenario: Expired job data is scrubbed before deletion
- **WHEN** `cleanupExpired()` runs and a job has expired (createdAt older than `JOB_TTL_MS`)
- **THEN** the job's `result` is set to `NULL` and `progress` is set to `'[]'` before the row is deleted

#### Scenario: Non-expired jobs are unaffected
- **WHEN** `cleanupExpired()` runs and a job is within its TTL
- **THEN** the job's data is not modified
