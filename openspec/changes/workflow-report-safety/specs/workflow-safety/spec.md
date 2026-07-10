## ADDED Requirements

### Requirement: generateFinalReport always returns a report

The `generateFinalReport()` function SHALL never throw an exception. All failure paths — including the terminal case where no structured output, no parseable text, and no `.object` are available — SHALL return a minimal report via `createMinimalReport()` with an explanatory message. The function SHALL only throw if the abort signal is triggered (user cancellation or timeout).

#### Scenario: All fallbacks exhausted returns minimal report
- **WHEN** the CMO's structured output fails validation, the correction retry fails, the no-structured-output fallback produces no parseable text, and `fallbackResponse.object` is falsy
- **THEN** `generateFinalReport()` returns a `createMinimalReport()` result with a message explaining that all fallbacks were exhausted, and does not throw

#### Scenario: Minimal report includes explanatory message
- **WHEN** the terminal fallback path is reached
- **THEN** the returned minimal report's message field includes text indicating report generation failed after all retries and fallbacks

#### Scenario: Abort signal still propagates as an error
- **WHEN** the abort signal is triggered during `generateFinalReport()` (user cancellation or timeout)
- **THEN** the abort error propagates as before — this is not a report-generation failure and SHALL NOT be caught as a fallback case
