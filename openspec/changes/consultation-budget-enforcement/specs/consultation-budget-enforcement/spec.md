## Purpose

Bounds specialist consultations per round and across a whole diagnosis, and enforces a hard CMO context budget, so an over-broad CMO request cannot consume the workflow timeout, bloat context, or cause recent findings to be discarded.

## ADDED Requirements

### Requirement: Per-round specialist cap is enforced

The CMO structured-output schema SHALL enforce a `MAX_SPECIALISTS_PER_ROUND` (default 5) maximum on the `specialistsToConsult` array. When the CMO returns more than the cap, the workflow SHALL truncate the list (preserving the highest-priority entries) or request a corrected response, and SHALL emit a progress event noting the truncation.

#### Scenario: CMO requests within the cap
- **WHEN** the CMO requests 3 specialists and `MAX_SPECIALISTS_PER_ROUND=5`
- **THEN** all 3 are consulted

#### Scenario: CMO requests over the cap
- **WHEN** the CMO requests 8 specialists and `MAX_SPECIALISTS_PER_ROUND=5`
- **THEN** only 5 are consulted (highest-priority by CMO order) and a progress event notes the truncation

### Requirement: Total specialist budget is enforced

A `MAX_TOTAL_SPECIALISTS` (default 12) SHALL cap cumulative specialist consultations across all rounds. Once the cumulative count reaches the budget, the workflow SHALL stop requesting new specialists and SHALL force final report generation.

#### Scenario: Total budget reached mid-workflow
- **WHEN** 12 specialists have been consulted across rounds and the CMO requests more
- **THEN** the workflow forces final report generation and does not consult additional specialists

#### Scenario: Total budget not reached
- **WHEN** fewer than `MAX_TOTAL_SPECIALISTS` specialists have been consulted
- **THEN** the workflow continues normally

### Requirement: CMO context budget is a hard limit

`buildCmoContext` SHALL enforce `maxChars` as a hard limit on the complete assembled context, including the base patient summary, by truncating or summarizing patient sections independently. The first two entries (case header and patient summary) SHALL NOT be exempt from the budget. Newest consultation results SHALL be preserved over older ones when truncation is required.

#### Scenario: Oversized patient summary is truncated to fit the budget
- **WHEN** the patient summary alone exceeds `CMO_CONTEXT_MAX_CHARS`
- **THEN** the assembled context is no longer than `maxChars` and includes a truncation notice

#### Scenario: Newest rounds are preserved when budget is tight
- **WHEN** context history exceeds `maxChars` and multiple rounds exist
- **THEN** the newest round results are included and older rounds are omitted with a notice

### Requirement: Specialist context packs newest consultations first

`buildSpecialistContext` SHALL keep patient data separate from consultation history and SHALL pack newest consultations first within `SPECIALIST_CONTEXT_MAX_CHARS`. The prior-round consultation results SHALL NOT be displaced by a duplicate patient-data prefix.

#### Scenario: Later specialist receives prior findings
- **WHEN** a round-2 specialist is built with prior-round results totaling 1,500 characters and `SPECIALIST_CONTEXT_MAX_CHARS=2000`
- **THEN** the prior findings are included and are not displaced by patient data

#### Scenario: Prior findings exceed the specialist context budget
- **WHEN** prior findings exceed `SPECIALIST_CONTEXT_MAX_CHARS`
- **THEN** the newest findings are preserved and older findings are truncated with a notice