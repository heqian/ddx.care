## Context

The interaction tool resolves each drug through RxNav, retrieves one OpenFDA label per drug, and searches label prose for literal names or identifiers. Lookup and label failures are caught per drug and converted to `null`, after which an empty interaction array is reported as a successful negative. The shared tool result envelope can represent failures, but it has no partial-coverage semantics.

## Goals / Non-Goals

**Goals:**
- Make the checked and unchecked portions of every request observable.
- Prevent unavailable evidence from becoming a negative assertion.
- Preserve interaction findings found before a partial failure.
- Make workflow progress reflect semantic failure and partial completion.

**Non-Goals:**
- Certifying OpenFDA label search as a comprehensive interaction database.
- Selecting or integrating a paid DDI provider in this change.
- Assigning clinical severity beyond what the source explicitly supports.
- Retrying indefinitely when public APIs are unavailable.

## Decisions

### 1. Return a semantic status and coverage ledger

Successful tool execution returns a valid result even if source coverage is unavailable:

```ts
{
  ok: true,
  data: {
    interactionStatus: "found" | "none_found" | "unknown",
    coverage: "complete" | "partial" | "unavailable",
    checks: Array<{
      input: string,
      resolvedName?: string,
      status: "checked" | "unresolved" | "failed",
      errorCode?: string
    }>,
    interactions: Interaction[],
    source: { name: string, limitation: string }
  }
}
```

`ok: false` is reserved for an internal failure that prevents the tool from producing a valid coverage ledger at all. This keeps expected upstream unavailability explicit and machine-readable.

### 2. Derive negative status only from complete coverage

`none_found` is computed only when every requested drug is checked successfully. Empty findings with partial or unavailable coverage produce `unknown`. The legacy `noInteractionsFound` boolean is removed to eliminate contradictory combinations.

### 3. Keep partial positive evidence

If one checked label identifies an interaction while another input fails, the tool returns `found` with partial coverage. Agents receive both the finding and the coverage warning.

### 4. Interpret result semantics in progress handling

Tool progress examines `ok`, `coverage`, and `interactionStatus`, not only Mastra's transport-level `isError`. Events use `success`, `partial`, or `failed` semantics, and summaries unwrap `data` before reading fields.

### 5. Make source limitations part of the model-facing result

The output states that label-text matching is supporting evidence, not comprehensive clearance. Specialist instructions prohibit treating `none_found` as permission to prescribe without clinical verification.

## Risks / Trade-offs

- [More unknown results reduce apparent usefulness] -> Accurate uncertainty is preferable to a false negative; retain partial positive findings.
- [Tool output becomes larger] -> Limit check records to requested drugs and use stable error codes rather than raw upstream errors.
- [Internal consumers expect noInteractionsFound] -> Update all consumers atomically and use schema validation to catch stale assumptions.

## Migration Plan

1. Add the new output schema and coverage-ledger tests.
2. Refactor lookup helpers to return typed outcomes instead of `undefined` or `null`.
3. Update tool execution and progress summaries.
4. Update specialist instructions and tests, removing failure-as-negative expectations.
5. Deploy as one backend release because tool consumers are in-process.
