## Purpose

Prevents credentials, progress, and results from one diagnosis job being reused or displayed in the context of another job.

## Requirements

### Requirement: Client diagnosis state is keyed by job ID
The client SHALL bind each job token, request payload reference, stream status, progress history, terminal error, and result to the job ID that produced it.

#### Scenario: Two jobs exist in one browser session
- **WHEN** the user starts a second diagnosis after completing the first
- **THEN** each job retains separate credentials and state under its own job ID

#### Scenario: Active route changes to another job
- **WHEN** browser navigation changes the active job ID
- **THEN** the client selects only that job's context and does not reuse global state from the previous job

### Requirement: Results render only for the matching route

The client SHALL display a diagnostic result only when the result job ID exactly matches the active results-route job ID. The client SHALL NOT embed job tokens or WebSocket tickets in URL path segments. Capability-bearing navigations SHALL use `history.replaceState` so credentials do not persist in browser history, sync, or screenshots. Deep-link sharing, if supported, SHALL use a separate short-lived share capability distinct from the read/cancel capability.

#### Scenario: In-memory result belongs to a different job
- **WHEN** the active route references job A but the most recently received result belongs to job B
- **THEN** job B's result is not rendered and the client loads or reports the state of job A

#### Scenario: User navigates backward across completed cases
- **WHEN** browser history moves from job B's results to job A's results
- **THEN** only job A's result may appear under job A's route

#### Scenario: Token is not present in URL path
- **WHEN** the client navigates to a results route
- **THEN** the URL path does not contain the job token or WebSocket ticket

#### Scenario: Capability URL is not retained in history
- **WHEN** the client navigates using a capability-bearing route
- **THEN** the history entry is replaced rather than pushed, so the capability is not recoverable via back navigation

### Requirement: Submission and retry update job identity atomically
Every successful submission or retry SHALL store the returned job ID and token together before starting streaming or navigation. Previous terminal state SHALL NOT carry into the new job.

#### Scenario: Retry returns a new token
- **WHEN** a failed diagnosis is retried successfully
- **THEN** the new job context uses the new job ID and its matching token, with pending status and no stale error

#### Scenario: Retry response arrives after navigation away
- **WHEN** the user leaves the retry flow before the response completes
- **THEN** the response does not replace the active route or another job's context

### Requirement: Same-session refresh restores minimum job credentials
The client SHALL persist the minimum job ID, token, and expiry metadata needed to recover a pending or completed job within the same browser session. Expired, cancelled, reset, or explicitly cleared contexts SHALL be removed. The client SHALL NOT retain credentials after the inactivity purge. The inactivity purge SHALL clear job tokens, WebSocket tickets, and history entries referencing job IDs. The auto-logout timer SHALL remain active during waiting and results screens with an extended timeout so unattended screens still trigger the purge.

#### Scenario: Waiting page is refreshed
- **WHEN** the browser reloads a waiting route for an unexpired job
- **THEN** the client restores that job's token and resumes authenticated status recovery

#### Scenario: Stored job context has expired
- **WHEN** a route references a job whose stored context is past its expiry
- **THEN** the client removes the context and shows an authorization-expired state without sending a stale token

#### Scenario: Inactivity purge clears job credentials
- **WHEN** the inactivity purge fires
- **THEN** job tokens, WebSocket tickets, and history entries referencing job IDs are removed

#### Scenario: Unattended waiting screen triggers purge
- **WHEN** a waiting screen is left unattended for the extended timeout
- **THEN** the purge fires and job credentials are cleared

### Requirement: Stale asynchronous responses cannot regress job state
Status transitions SHALL be monotonic per job, and responses from obsolete requests SHALL be ignored after the active job or request generation changes.

#### Scenario: Pending poll resolves after completed response
- **WHEN** an older pending poll resolves after the same job has reached completed status
- **THEN** the completed state is preserved

#### Scenario: Previous job response resolves after route change
- **WHEN** a request for job A resolves after the active route changes to job B
- **THEN** the response may update job A's stored context but cannot alter job B's visible state

### Requirement: Capability tokens are excluded from browser paths
Waiting and results route paths SHALL contain the job ID only. Job capability tokens SHALL NOT be written into the URL, browser history state serialized to the URL, or document title.

#### Scenario: Results navigation occurs
- **WHEN** a job completes and the client navigates to its results
- **THEN** the path contains the job ID and no capability token