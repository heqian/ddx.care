## MODIFIED Requirements

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