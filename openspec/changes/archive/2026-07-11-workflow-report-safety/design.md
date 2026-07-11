## Context

`generateFinalReport()` in `src/backend/workflows/diagnostic-workflow.ts` is responsible for producing the final diagnosis report when the CMO's multi-round consultation loop ends. It has an elaborate fallback chain:

1. **Structured output** — `cmo.generate()` with `structuredOutput` schema → validates against `diagnosisReportSchema`
2. **Correction retry** — If structured output fails validation, re-prompt with Zod error details
3. **No-structured-output fallback** — Generate without schema constraints, attempt to extract+parse JSON from text
4. **Raw `.object` fallback** — Validate `fallbackResponse.object` against schema
5. **Minimal report** — `createMinimalReport()` with an explanatory message

Every path returns a report **except the very last one** (line 669): if `fallbackResponse.object` is falsy, the function throws. This can happen when the LLM returns an empty response (rate-limited, timeout, or degenerate output). The throw propagates to `runDiagnosis`, which re-throws, and the entire job fails with no report.

## Goals / Non-Goals

**Goals:**
- Ensure `generateFinalReport()` always returns a report — never throws
- Add test coverage for the previously-untested final fallback path
- Maintain the quality of error context in degraded reports

**Non-Goals:**
- Improving LLM output quality (separate concern)
- Changing the fallback chain structure (it's well-designed; only the terminal branch is wrong)
- Fixing the `limitConcurrency` rejection bug (separate issue, Medium severity)

## Decisions

### D1: Replace throw with createMinimalReport

**Decision:** At line 669, replace:
```typescript
throw new Error("Failed to generate a valid diagnosis report after all retries and fallbacks");
```
with:
```typescript
return createMinimalReport(
  "Report generation failed after all retries and fallbacks. No structured output was produced.",
);
```

**Rationale:** The function's design intent is graceful degradation. Every other path returns a minimal report. The throw is an inconsistency that causes total job failure — the worst outcome for a user waiting up to 15 minutes. A minimal report (which includes the patient summary and a disclaimer) is strictly better than no report.

**Alternatives considered:**
- Return `null` and handle upstream → Adds nullable handling complexity throughout the call chain. Minimal report is cleaner.
- Retry the entire fallback chain again → Risk of infinite loops; the LLM already failed through all strategies.

### D2: Enrich the minimal report message

**Decision:** The minimal report message SHALL briefly note which fallback strategies were attempted, so the degraded report is self-documenting.

**Rationale:** When a user receives a minimal report, the message "Report generation failed after all retries and fallbacks" helps them understand it's a system limitation, not a medical conclusion.

## Risks / Trade-offs

- **[Silent failures]** → Replacing the throw means a totally degenerate LLM response produces a minimal report instead of an explicit error. **Mitigation:** The workflow already logs warnings at each fallback stage (`report_validation_retry_failed`, `report_fallback_no_structured_output`). The minimal report itself carries a disclaimer. The job status is `completed` (not `failed`), which is correct — a report was produced.
- **[Minimal report quality]** → A minimal report has no ranked diagnoses, only the patient summary and disclaimer. **Mitigation:** This is the same behavior as all other fallback paths; it's strictly better than throwing.
