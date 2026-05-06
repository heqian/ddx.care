## ADDED Requirements

### Requirement: Job TTL default increased to 60 minutes

The default value of `JOB_TTL_MS` SHALL be `60 * 60 * 1000` (60 minutes) instead of the previous `30 * 60 * 1000` (30 minutes). This provides sufficient margin for workflows that run up to 15 minutes, plus time for clients to retrieve results after completion.

#### Scenario: Job result available 45 minutes after creation
- **WHEN** a job is created at T=0 and completes at T=14m
- **THEN** the job result is still available at T=45m (within the 60-minute TTL)

#### Scenario: Job result expired after 61 minutes
- **WHEN** a job is created at T=0 and the cleanup interval runs at T=61m
- **THEN** the job is removed from the database

### Requirement: Stale pending jobs marked as failed on server startup

On server startup, before accepting connections, the system SHALL call `progressStore.markStalePending()` which updates all jobs with `status = "pending"` to `status = "failed"` with error message "Server restarted — job interrupted". This prevents clients from waiting indefinitely for a job that will never complete.

#### Scenario: Server restarts with pending jobs
- **WHEN** the server starts and there are 3 jobs with `status = "pending"` in SQLite
- **THEN** all 3 jobs are updated to `status = "failed"` with error "Server restarted — job interrupted"

#### Scenario: Server starts with no pending jobs
- **WHEN** the server starts and there are no pending jobs
- **THEN** `markStalePending()` runs without error and no jobs are modified

### Requirement: Rate limit recording moved after validation

The `rateLimiter.record(ip)` call SHALL be executed after successful request body parsing and Zod validation, not before. This ensures that malformed or oversized requests do not consume rate-limit slots.

#### Scenario: Malformed JSON request does not consume rate limit
- **WHEN** a client sends `POST /v1/diagnose` with invalid JSON body
- **THEN** the response is `400 Bad Request` and the client's rate-limit counter is NOT incremented

#### Scenario: Valid request does consume rate limit
- **WHEN** a client sends `POST /v1/diagnose` with a valid JSON body that passes Zod validation
- **THEN** the request is processed and the client's rate-limit counter IS incremented

#### Scenario: Oversized payload does not consume rate limit
- **WHEN** a client sends `POST /v1/diagnose` with a `Content-Length` exceeding `MAX_PAYLOAD_BYTES`
- **THEN** the response is `413 Payload Too Large` and the client's rate-limit counter is NOT incremented (but the concurrent workflow slot IS freed)

### Requirement: Inactivity timer paused during diagnosis

The `useAutoLogout` hook SHALL accept a `paused` prop. When `paused` is `true`, the inactivity timer SHALL be reset to the full duration and SHALL NOT start counting down. When `paused` transitions from `true` to `false`, the timer SHALL start counting down from the beginning.

#### Scenario: Timer paused on waiting screen
- **WHEN** the route screen is `"waiting"` and a diagnosis is in progress
- **THEN** the auto-logout timer does not fire, and no inactivity warning is shown

#### Scenario: Timer resumes after leaving waiting screen
- **WHEN** the route screen changes from `"waiting"` to `"input"`
- **THEN** the auto-logout timer starts counting down from the full 10-minute duration

### Requirement: JOB_TTL_MS configurable via environment variable

`JOB_TTL_MS` SHALL be configurable via the `JOB_TTL_MS` environment variable, consistent with other config values. The default SHALL be `3600000` (60 minutes).

#### Scenario: Custom TTL via environment
- **WHEN** `JOB_TTL_MS=7200000` is set in the environment
- **THEN** jobs are cleaned up after 2 hours instead of the default 60 minutes