## MODIFIED Requirements

### Requirement: Minimal valid report constructed on generation failure

The system SHALL provide a terminal fallback that constructs a valid `generation_failed` report outcome when all validation and retry attempts fail. Despite the historical requirement name, this fallback SHALL NOT construct a `DiagnosisReport` or cast unvalidated output into one.

The generated outcome SHALL include:
- `status`: `"generation_failed"`
- `errorCode`: A stable public code that does not contain provider internals
- `message`: A fixed user-facing explanation that report generation was unavailable
- `retryable`: Whether a later retry may succeed
- `safetyGuidance`: Generic guidance to seek qualified professional or emergency help when appropriate

The generated outcome SHALL NOT include diagnoses, confidence, urgency, or treatment recommendations.

#### Scenario: All report generation strategies fail
- **WHEN** report generation exhausts all bounded strategies
- **THEN** the function returns a schema-valid `generation_failed` outcome instead of constructing or casting a diagnosis report

#### Scenario: Generation failure outcome passes validation
- **WHEN** the terminal fallback is created with any internal error context
- **THEN** the public outcome schema validates and excludes the internal error detail

#### Scenario: Generation failure renders in frontend
- **WHEN** the frontend receives a `generation_failed` outcome
- **THEN** it renders the unavailable-report state and no diagnosis card or urgency badge
