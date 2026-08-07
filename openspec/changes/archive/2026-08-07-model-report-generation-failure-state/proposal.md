## Why

When report generation fails, the system currently creates a fake ranked diagnosis with 0% confidence and `Routine` urgency, then marks the job completed. A technical outage must not be represented as a medical conclusion or reassuring urgency classification.

## What Changes

- **BREAKING**: Replace the always-successful diagnosis report contract with a discriminated report outcome that distinguishes an available report from generation failure.
- Represent exhausted generation fallbacks as `generation_failed`, not as a diagnosis entry.
- Preserve a safe public error code and user guidance without exposing raw provider errors.
- Render a dedicated unavailable-report state that cannot be confused with diagnostic results.
- Keep cancellation and timeout as terminal job failures rather than report outcomes.

## Capabilities

### New Capabilities
- `report-availability-state`: Defines available and unavailable report outcomes across workflow, persistence, API, and frontend boundaries.

### Modified Capabilities
- `safe-report-fallback`: Replaces the routine minimal-diagnosis fallback with a non-diagnostic generation-failure outcome.
- `workflow-safety`: Changes the terminal fallback guarantee from "always returns a report" to "always returns a typed outcome," except for cancellation and timeout.

## Impact

- Backend workflow output schemas and fallback generation
- Job completion/result serialization and API response types
- Frontend API types, `ResultsView`, and failure presentation
- Existing fallback tests that currently require `Routine` urgency
- API consumers must handle the new discriminated result shape
