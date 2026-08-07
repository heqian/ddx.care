## Context

The workflow output currently requires a diagnosis report, so every generation path is forced to manufacture a schema-valid report. The terminal fallback uses a fake diagnosis to satisfy that schema. Mastra structured-output validation is strict by default and throws on invalid output, so the fallback contract must handle exceptions as well as malformed objects.

## Goals / Non-Goals

**Goals:**
- Make report availability explicit at every backend and frontend boundary.
- Preserve bounded recovery attempts without manufacturing medical content.
- Separate safe public errors from internal provider diagnostics.
- Avoid a database migration where the existing JSON result can carry the union.

**Non-Goals:**
- Changing cancellation or timeout semantics.
- Adding provider failover.
- Preserving the existing nested frontend response shape beyond what is needed for this union.
- Returning partial diagnostic prose after validation has failed.

## Decisions

### 1. Use one discriminated `ReportOutcome` union

The workflow, persisted result, API type, WebSocket completion message, and frontend all use the same union:

```ts
type ReportOutcome =
  | { status: "available"; report: DiagnosisReport; generatedAt: string; disclaimer: string }
  | {
      status: "generation_failed";
      errorCode: string;
      message: string;
      retryable: boolean;
      safetyGuidance: string;
    };
```

A shared Zod schema is the runtime source of truth. This prevents handwritten frontend interfaces from drifting.

### 2. Treat job completion and report availability as separate concepts

The persisted job remains `completed` when processing settled successfully enough to return a retrievable `generation_failed` outcome. Job `failed` remains reserved for timeout, cancellation, and unrecoverable workflow failures. This avoids a SQLite status migration and lets clients distinguish transport/execution failure from unavailable medical content.

### 3. Simplify fallback generation

Use an initial structured generation and one corrected structured generation. If both fail, return `generation_failed`. Do not use greedy JSON extraction or stringify Zod implementation objects as a schema prompt. Reducing fallback cleverness is safer than trying to recover unvalidated medical prose.

### 4. Map internal errors to stable public codes

Provider and validation details are logged internally after sanitization. Public outcomes use a small code set such as `REPORT_PROVIDER_UNAVAILABLE`, `REPORT_VALIDATION_FAILED`, and `REPORT_EMPTY_RESPONSE`. Messages are fixed and contain no URL, model response, stack, or patient-derived query.

### 5. Results UI branches on outcome before accessing report data

Only `available` renders report components or enables print/export. `generation_failed` renders an error heading, retry action when applicable, and professional-evaluation guidance. It does not reuse urgency or confidence components.

## Risks / Trade-offs

- [Breaking response shape affects in-flight browser sessions] -> Deploy backend and frontend together; jobs are short-lived and no external API consumers are documented.
- [Fewer fallback strategies reduce report yield] -> Prefer an explicit unavailable state over a higher rate of unvalidated medical output.
- [Completed plus generation_failed can confuse operators] -> Metrics and logs record both job terminal status and report outcome status.

## Migration Plan

1. Add the shared union schema and frontend rendering support.
2. Update workflow formatting and WebSocket/status types to emit `available` for existing successful reports.
3. Replace `createMinimalReport` with the generation-failure outcome.
4. Replace tests that expect routine urgency with union contract tests.
5. Deploy frontend and backend as one release; existing stored jobs may be cleared because their default retention is one hour.
6. Roll back only as a coordinated frontend/backend release; do not restore the fake routine diagnosis fallback.
