## MODIFIED Requirements

### Requirement: Concurrency slot release is guarded against double-decrement

The concurrency limiter SHALL maintain the exact set of job IDs that currently own workflow capacity. Reserving capacity SHALL add a specific job ID atomically if capacity is available. Releasing capacity SHALL remove that job ID only if it currently owns a reservation. Pruning rate-limit history SHALL NOT clear active workflow ownership.

#### Scenario: Workflow reserves and releases capacity normally
- **WHEN** a validated diagnosis reserves capacity for a job and that workflow later settles
- **THEN** the job ID is removed exactly once and active workflow count decreases by one

#### Scenario: Duplicate release for the same job
- **WHEN** release is requested more than once for a settled job ID
- **THEN** every request after the first is a no-op and cannot affect another workflow

#### Scenario: Release requested for an unknown job
- **WHEN** release is requested for a job ID that does not own capacity
- **THEN** active workflow ownership remains unchanged

#### Scenario: Rate-limit pruning runs during active work
- **WHEN** rate-limit history is pruned while workflows are running
- **THEN** all active job reservations remain present and counted

#### Scenario: Capacity is full
- **WHEN** the number of active job IDs equals the configured workflow limit
- **THEN** no additional job can reserve capacity until an owning workflow settles
