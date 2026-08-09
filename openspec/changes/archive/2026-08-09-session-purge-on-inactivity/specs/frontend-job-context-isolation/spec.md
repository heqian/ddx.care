## MODIFIED Requirements

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