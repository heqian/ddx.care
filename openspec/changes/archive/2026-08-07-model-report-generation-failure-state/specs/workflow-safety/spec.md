## MODIFIED Requirements

### Requirement: generateFinalReport always returns a report

The report-generation operation SHALL return a typed report outcome for every non-abort terminal path. Successful generation SHALL return `available` with a validated report. Exhausted or unavailable generation SHALL return `generation_failed`. The operation SHALL only throw when cancellation, timeout, or an unrecoverable application invariant requires the workflow itself to fail.

#### Scenario: All fallbacks exhausted returns generation failure
- **WHEN** structured output, correction, and bounded fallback generation are exhausted
- **THEN** the operation returns a `generation_failed` outcome and does not synthesize a diagnosis

#### Scenario: Generation failure includes a stable explanation
- **WHEN** a `generation_failed` outcome is returned
- **THEN** it includes a stable public error code and fixed user-facing message without raw provider details

#### Scenario: Abort signal still propagates as an error
- **WHEN** the abort signal is triggered by user cancellation or timeout during report generation
- **THEN** the abort condition propagates as a workflow failure and is not caught as a generation fallback
