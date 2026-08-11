## ADDED Requirements

### Requirement: Degraded consultation execution remains explicit and retryable

The workflow SHALL keep CMO requests, admission dispositions, admitted consultation execution, application-level generation attempts, application-observed model steps, and progress presentation distinct. Invalid, duplicate, unavailable, over-budget, closed-round, or pre-admission-cancelled requests SHALL remain non-admission entries in their `RequestBatch` and SHALL NOT create a `ConsultationRecord` or failed consultation.

A consultation SHALL be created synchronously on ordered-prefix admission before scheduling and SHALL transition `admitted` to `started` to exactly one of `succeeded`, `failed`, or `cancelled`; direct `admitted -> cancelled` SHALL be allowed for cutoff/cancellation before worker start. It SHALL be succeeded and included in the consulted list only after its application-level generation returns non-empty accepted content. Exhausted application retries and empty accepted content after start SHALL be failed and SHALL NOT be converted into consultation text that appears successful. A failed consultation SHALL remain eligible for a new later-round consultation, and an already successful specialist SHALL remain eligible for an explicitly requested later-round reconsultation. Each logical generation, `Agent.generate` operation, and application-observed sequential model step SHALL retain distinct linked IDs.

Every `Agent.generate` operation SHALL have an explicit finite `maxSteps`, and `prepareStep` SHALL enforce the same application-observed step budget. The workflow SHALL NOT claim that transport retries hidden inside a provider adapter are separate attempts or model steps. The final report initial and correction operations SHALL each use `toolChoice: none` and `maxSteps: 1` and SHALL not be bypassed by an inline CMO report.

An abort during an admitted or started consultation SHALL mark its in-memory consultation, attempt, and observable active step cancelled before the existing cancellation-or-timeout error propagates. Cancellation SHALL NOT become an ordinary consultation failure or a `generation_failed` report. When the whole workflow fails or is cancelled, those in-memory execution records SHALL be discarded after status failure and SHALL NOT become a durable audit ledger. A completed report that follows one or more failed admitted consultations SHALL include degraded-execution metadata and an accessible warning. Failed or cancelled work SHALL never use the green succeeded presentation, and later success SHALL not erase earlier admitted failure.

#### Scenario: Request is rejected before admission
- **WHEN** a request is invalid, duplicate, unavailable, over budget, closed by the round, or cancelled before admission
- **THEN** it receives a non-admission disposition, creates no consultation, and is never presented as a failed consultation

#### Scenario: Specialist call succeeds
- **WHEN** an admitted specialist attempt returns a non-empty accepted response
- **THEN** that consultation is succeeded and can appear in the consulted-specialist list

#### Scenario: Specialist call exhausts retries
- **WHEN** all attempts for a consultation fail
- **THEN** the consultation is failed, remains eligible for a later-round consultation, is excluded from the succeeded consulted list, and is disclosed if an available report is produced

#### Scenario: Specialist returns an empty response
- **WHEN** a specialist generation returns no accepted response content
- **THEN** the consultation is failed rather than succeeded and is not represented as completed analysis

#### Scenario: Successful specialist is requested again
- **WHEN** a later CMO round explicitly requests a specialist that already has a succeeded consultation
- **THEN** the workflow can admit a new consultation with a new consultation ID and a linked generation containing new attempt and model-step IDs under existing bounds

#### Scenario: Model-step budget is reached
- **WHEN** an `Agent.generate` operation reaches its explicit application-observed step budget
- **THEN** `maxSteps` and `prepareStep` prevent another observed step and the operation records a stable application budget code

#### Scenario: Consultation is aborted
- **WHEN** user cancellation or timeout aborts an admitted or started consultation
- **THEN** its in-memory active execution records become cancelled before the existing distinct abort error propagates, no completed report replaces the abort, and no durable provenance ledger is written for the failed workflow

#### Scenario: Reconsultation recovers usable evidence
- **WHEN** an earlier consultation failed and a separate later consultation for the same specialist succeeds
- **THEN** the later consultation can appear as succeeded while the earlier failure remains in degraded metadata and is never displayed as green
