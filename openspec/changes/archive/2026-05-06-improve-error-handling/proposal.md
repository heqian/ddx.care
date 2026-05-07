## Why

LLM and tool failures are common in production — models return malformed JSON, external APIs timeout, and Zod schema validation rejects structured output. The current error handling swallows tool errors (returning empty data to agents), uses unsafe type casts as fallbacks, retries all errors uniformly regardless of whether retrying helps, and injects raw internal error messages into agent context. This leads to degraded diagnosis quality, potential frontend rendering crashes, and no visibility into failure patterns.

## What Changes

- **Tool error transparency**: Tools return structured error information to agents instead of empty results, so agents can reason about missing data (e.g., "PubMed is unavailable" vs. "no articles found").
- **Safe report fallback**: Replace unsafe `as DiagnosisReport` casts with construction of a valid minimal report containing a disclaimer, preventing downstream frontend crashes.
- **Error classification**: Distinguish retriable errors (timeouts, rate limits, transient failures) from non-retriable errors (schema validation failures, permanent API errors) so `withRetry` only retries when it might help.
- **Improved correction prompts**: Include the malformed LLM output and specific fix guidance in retry prompts, so the model can see what it did wrong.
- **Structured error types**: Introduce typed error classes (e.g., `ToolError`, `ParseError`, `LLMTimeoutError`) for consistent telemetry and log analysis.
- **Context-safe error messages**: Sanitize error strings before injecting them into agent context history, removing internal details and capping length.

## Capabilities

### New Capabilities
- `error-classification`: Typed error classes and retriable vs. non-retriable error classification for LLM calls, tool invocations, and schema validation
- `tool-error-transparency`: Structured error returns from tools that inform agents why data is missing rather than returning empty results
- `safe-report-fallback`: Construction of valid minimal DiagnosisReport objects when all generation/validation attempts fail, instead of unsafe type casts

### Modified Capabilities
- `tool-use-logging`: Extend logging to include structured error types and classification for better telemetry

## Impact

- **Backend workflow** (`src/backend/workflows/diagnostic-workflow.ts`): `withRetry` gains error classification, `generateFinalReport` gets safe fallback, correction prompts include malformed output
- **Backend tools** (`src/backend/tools/`): All tools return structured error objects instead of swallowing failures
- **Backend fetch utility** (`src/backend/tools/utils/fetch.ts`): Returns typed errors with classification
- **Frontend** (`src/frontend/`): No changes needed — safe fallback reports ensure existing rendering works
- **Tests**: New tests for error types, classification logic, and safe fallback construction
