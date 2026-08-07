## Purpose

Defines an explicit boundary between usable diagnostic reports and technical generation failures so outages cannot appear as medical conclusions.

## ADDED Requirements

### Requirement: Workflow results use a discriminated report outcome
Every settled diagnostic workflow SHALL return exactly one report outcome: `available` with a validated report, or `generation_failed` with a stable public error code, retryability indicator, user-facing message, and generic safety guidance.

#### Scenario: Valid report is available
- **WHEN** report generation produces an output that passes schema and safety validation
- **THEN** the workflow returns `{ status: "available", report: ... }`

#### Scenario: Generation strategies are exhausted
- **WHEN** all bounded structured and fallback generation strategies fail
- **THEN** the workflow returns `{ status: "generation_failed", ... }` without a report object

### Requirement: Generation failure contains no diagnostic assertions
A `generation_failed` outcome SHALL NOT contain ranked diagnoses, confidence values, urgency classifications, specialist findings presented as conclusions, or recommended treatment actions.

#### Scenario: Provider outage occurs during an emergency case
- **WHEN** the provider outage prevents report generation
- **THEN** the result contains generic seek-professional-help guidance and no `Routine` classification

### Requirement: Generation failure is presented separately from workflow cancellation
User cancellation and workflow timeout SHALL remain terminal job failures. They SHALL NOT be converted into `generation_failed` report outcomes.

#### Scenario: User cancels during report generation
- **WHEN** the workflow abort signal indicates user cancellation
- **THEN** the job is marked cancelled or failed with the cancellation code and no report outcome is produced

#### Scenario: Workflow reaches its timeout
- **WHEN** the diagnosis timeout aborts the workflow
- **THEN** the job is marked failed with the timeout code and no report outcome is produced

### Requirement: Frontend distinguishes unavailable reports
The client SHALL render `generation_failed` as a dedicated unavailable-report state and SHALL NOT render diagnosis cards, confidence badges, urgency badges, or report export controls.

#### Scenario: Unavailable outcome reaches the results route
- **WHEN** the status endpoint returns a `generation_failed` outcome
- **THEN** the client displays retry and professional-evaluation guidance without displaying diagnostic content
