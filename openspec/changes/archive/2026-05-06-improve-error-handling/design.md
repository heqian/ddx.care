## Context

The diagnostic workflow orchestrates 36 specialist agents calling 20+ medical API tools, with LLM structured output validated against Zod schemas. Errors occur at three layers:

1. **Tool layer** — External API timeouts, rate limits, 404s. Currently swallowed via `.catch(() => ({}))`, agents can't distinguish "no data" from "API down."
2. **Agent layer** — LLM returns malformed JSON or non-JSON text. `withRetry` retries all errors uniformly with exponential backoff, even non-retriable ones like schema validation failures.
3. **Report layer** — Final report generation has 4 fallback strategies, but the last resort is an unsafe `as DiagnosisReport` type cast that may produce an invalid object for the frontend.

The system already has `withRetry` with exponential backoff, `parseFailureCount` circuit breaker, and AbortController propagation. This design builds on those patterns.

## Goals / Non-Goals

**Goals:**
- Agents can reason about why tool data is missing (API down vs. no results)
- Every code path that reaches the frontend produces a structurally valid report
- Retries only fire when retrying might actually help
- Errors are classified and logged with structured types for production monitoring
- Error messages injected into agent context are sanitized (no internal URLs, capped length)

**Non-Goals:**
- Circuit breaker pattern for individual external APIs (separate future work)
- Dead letter queue or persistent error store (errors are already captured in progress store)
- Retry with smaller/trimmed context (complex, low immediate ROI)
- Frontend changes (safe fallback reports render with existing components)
- Changing the correction prompt to include malformed output (simple one-liner, included in tasks but not a design-level decision)

## Decisions

### D1: Typed error classes in `src/backend/utils/errors.ts`

Create a small error hierarchy:

```
AppError (base)
├── RetriableError
│   ├── LLMTimeoutError
│   ├── APITimeoutError
│   └── RateLimitError
├── NonRetriableError
│   ├── SchemaValidationError
│   └── PermanentAPIError
└── ToolError (wraps source + error)
```

`withRetry` catches all errors but only retries if `error instanceof RetriableError` or if the error is unclassified (backward compatible — unknown errors still retry). `NonRetriableError` immediately propagates.

**Rationale**: Using `instanceof` checks keeps the retry logic simple and doesn't require changing every call site. Unclassified errors still retry (safe default).

**Alternative considered**: Error code strings (`error.code === 'RETRIABLE'`) — rejected because TypeScript can't enforce exhaustiveness and it's easier to miss a case.

### D2: Tools return `ToolResult<T>` instead of raw data

Introduce a discriminated union:

```typescript
type ToolResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; retriable: boolean }
```

Tools that currently return data directly wrap their output. Tools that currently `.catch(() => ({}))` return `{ ok: false, error: "reason", retriable: boolean }`. The Mastra tool executor's `description` field guides the LLM to interpret `{ ok: false }` as "data unavailable, reason given."

**Rationale**: Mastra tools return their result to the agent as text. A structured `{ ok: false, error: "PubMed API timeout" }` in the tool result tells the agent why data is missing, letting it reason about incomplete information. The `retriable` flag is informational for the LLM (the actual retry is handled at the workflow level).

**Alternative considered**: Throw from tools on error and catch at workflow level — rejected because Mastra tool errors terminate the tool call, and the agent loses the context of *which* tool failed and *why*.

### D3: Safe fallback report construction

Replace `return response.object as DiagnosisReport` with a `createMinimalReport(errorContext)` function:

```typescript
function createMinimalReport(context: string): DiagnosisReport {
  return {
    chiefComplaint: "Unable to generate complete diagnosis",
    patientSummary: "Report generation encountered errors",
    specialistsConsulted: [],
    rankedDiagnoses: [{
      diagnosisName: "Diagnosis incomplete — generation error",
      confidencePercentage: 0,
      urgency: "Routine" as const,
      rationale: `Automated diagnosis could not be completed: ${context}`,
      supportingEvidence: "N/A — report generation failed",
      contradictoryEvidence: "N/A",
      suggestedNextSteps: "Please retry the diagnosis or consult a physician directly",
    }],
    crossSpecialtyObservations: "",
    recommendedImmediateActions: "Retry the diagnostic analysis",
  };
}
```

This is always valid per the Zod schema, so `formatReport` and the frontend won't crash.

**Rationale**: An honest "generation failed" report is better than a randomly-shaped object that might lack required fields. The user sees a clear message instead of a broken UI.

**Alternative considered**: Throw and let the API return 500 — rejected because the user already waited through the full diagnosis process; a clear error report is a better UX than a generic server error.

### D4: Sanitize error messages before context injection

When specialist calls fail, the error message is currently pushed raw into `contextHistory`. Add a `sanitizeForContext(message)` function that:
- Caps at 200 characters
- Removes URLs (may contain API keys in query params)
- Removes file paths
- Replaces with: `"Specialist ${id} unavailable: ${sanitizedMessage}"`

Applied at the single point where specialist errors enter context history (line ~919 in `diagnostic-workflow.ts`).

### D5: Error classification in `withRetry`

Extend `withRetry` to accept an optional `shouldRetry?: (error: unknown) => boolean` predicate. When provided, it's called before deciding to retry. When not provided, existing behavior (retry everything except abort) is preserved.

The workflow passes a classifier function that checks `instanceof RetriableError` vs `instanceof NonRetriableError`. This avoids changing the `withRetry` signature for existing callers (backward compatible).

## Risks / Trade-offs

**[ToolResult changes touch all 20+ tools]** → Mitigation: Incremental rollout. Each tool can be migrated independently. Tools that don't return `ToolResult` still work — the agent just sees raw data. No breaking change.

**[Error classes add a new module to maintain]** → Mitigation: Small surface area (3 base classes, ~5 concrete types). No external dependencies. If the hierarchy grows, refactor then.

**[Safe fallback report masks the real error from users]** → Mitigation: The error is still logged server-side and stored in progress events. The report includes the error context in `rationale`. The progress stream already shows error events to the frontend.

**[`shouldRetry` predicate makes `withRetry` harder to reason about]** → Mitigation: Default behavior unchanged. Predicate is opt-in. Without it, `withRetry` works exactly as before.
