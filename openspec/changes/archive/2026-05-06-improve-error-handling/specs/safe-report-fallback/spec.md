## ADDED Requirements

### Requirement: Minimal valid report constructed on generation failure

The system SHALL provide a `createMinimalReport(errorContext: string): DiagnosisReport` function that constructs a valid `DiagnosisReport` conforming to the Zod schema. This function SHALL be used in place of unsafe type casts (`as DiagnosisReport`) in `generateFinalReport` when all validation and retry attempts fail.

The generated report SHALL include:
- `chiefComplaint`: A fixed message indicating generation failure
- `patientSummary`: A fixed message indicating incomplete analysis
- `specialistsConsulted`: An empty array
- `rankedDiagnoses`: A single diagnosis entry with `confidencePercentage: 0`, `urgency: "Routine"`, and a `rationale` containing the `errorContext`
- `crossSpecialtyObservations`: An empty string
- `recommendedImmediateActions`: A suggestion to retry

#### Scenario: All report generation strategies fail
- **WHEN** `generateFinalReport` exhausts all 4 fallback strategies (structured output, correction prompt, manual JSON extraction, raw object)
- **THEN** the function returns `createMinimalReport(errorSummary)` instead of casting the raw object

#### Scenario: Minimal report passes Zod validation
- **WHEN** `createMinimalReport` is called with any error context string
- **THEN** `diagnosisReportSchema.safeParse(report)` returns `{ success: true }`

#### Scenario: Minimal report renders in frontend
- **WHEN** the frontend receives a minimal report from the API
- **THEN** the `ResultsView` renders it as a single diagnosis card with 0% confidence, "Routine" urgency, and the error context in the rationale field

### Requirement: Correction prompts include malformed output

When the final report's first Zod validation fails and a correction prompt is generated, the prompt SHALL include the malformed output (truncated to 500 characters) so the LLM can see what it produced and correct it.

#### Scenario: Correction prompt includes previous output
- **WHEN** `diagnosisReportSchema.safeParse()` fails on the first attempt
- **THEN** the correction prompt includes the stringified malformed object (truncated to 500 chars) alongside the Zod error list

#### Scenario: Malformed output too long is truncated
- **WHEN** the malformed LLM output is 2000 characters long
- **THEN** only the first 500 characters are included in the correction prompt with a `[truncated]` suffix
