## Why

The CMO prompt recommends 2–5 specialists per case, but the structured output array has no `.max()`, so the CMO can request all 36 specialists in a single round. The application executes every valid requested ID. Concurrency limits only simultaneous work, not total calls, so an over-broad request can consume the 15-minute budget before synthesis, expand context dramatically, and delay an urgent report. Separately, the configured CMO context limit deliberately preserves an oversized base of up to roughly 150,000 characters when `contextHistory.length <= 2`, bypassing the intended 60,000-character cap and risking provider rejection or implicit truncation that loses later findings.

## What Changes

- **Per-round specialist cap**: the CMO output schema SHALL enforce a configurable `MAX_SPECIALISTS_PER_ROUND` (default 5) maximum on `specialistsToConsult`. Requests exceeding the cap SHALL be truncated by clinical priority or rejected with a correction prompt.
- **Total specialist budget**: a configurable `MAX_TOTAL_SPECIALISTS` (default 12) SHALL cap cumulative specialist consultations across all rounds. Once reached, the workflow SHALL force final report generation.
- **Hard CMO context budget**: `buildCmoContext` SHALL enforce `maxChars` as a hard limit on the full assembled context, including the base patient summary, by truncating or summarizing patient sections independently so the newest consultations and critical labs survive.
- **Specialist context packing fix**: `buildSpecialistContext` SHALL keep patient data separate from consultation history and SHALL pack newest consultations first so prior-round findings are not discarded in favor of a duplicate patient-data prefix.

## Capabilities

### New Capabilities

- `consultation-budget-enforcement`: Enforces per-round and total specialist consultation caps and a hard CMO context budget so an over-broad CMO cannot consume the workflow timeout, bloat context, or lose recent findings.

### Modified Capabilities

- `agent-orchestration-fixes`: The CMO output schema SHALL constrain the number of specialists per round; the workflow SHALL cap cumulative consultations across rounds.

## Impact

- **Backend**: `src/backend/workflows/diagnostic-workflow.ts` (schema `.max()`, budget tracking, `buildCmoContext` hard limit, `buildSpecialistContext` packing), `src/backend/agents/chief-medical-officer.ts` (prompt reflects the cap), `src/backend/config.ts` (new `MAX_SPECIALISTS_PER_ROUND`, `MAX_TOTAL_SPECIALISTS`).
- **Tests**: `tests/workflow.test.ts` (budget enforcement, context packing, truncation).
- **Documentation**: `AGENTS.md`, `.env.example`.