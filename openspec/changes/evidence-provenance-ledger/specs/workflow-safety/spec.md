## MODIFIED Requirements

### Requirement: Workflow abort distinguishes cancellation from timeout

When the workflow abort fires, the error handler SHALL inspect `abortController.signal.reason` and SHALL throw a distinct error for user cancellation versus timeout. Abort errors during specialist calls SHALL be rethrown immediately and SHALL NOT be recorded as ordinary specialist failures; the consultation ledger SHALL record status `cancelled` for such calls. A specialist SHALL be marked consulted only after a non-empty validated response; a failed or empty specialist SHALL be recorded as `failed`, SHALL remain retry-eligible in a later round, and SHALL be reported in the final report's degraded-evidence metadata.

#### Scenario: User cancellation during a specialist call
- **WHEN** an abort fires while a specialist is generating
- **THEN** the abort is rethrown immediately, the ledger records `cancelled`, and the specialist is not marked consulted

#### Scenario: Timeout during a specialist call
- **WHEN** the workflow timeout fires during a specialist call
- **THEN** the error handler throws a timeout-specific error and the ledger records `cancelled`

#### Scenario: Specialist fails and is retried later
- **WHEN** a specialist call exhausts retries
- **THEN** the specialist is recorded as `failed`, remains retry-eligible in a subsequent round, and the final report notes the failed consultation in degraded-evidence metadata

#### Scenario: Specialist returns an empty response
- **WHEN** a specialist returns an empty response
- **THEN** the specialist is recorded as `failed` (not `succeeded`) and is not marked consulted