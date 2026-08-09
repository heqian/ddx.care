## Why

The final report's `specialistsConsulted`, `keyFindings`, and all supporting evidence are model-generated strings, not reconciled against actual execution. A CMO can claim a consultation that never happened or cite unsupported findings. The final output records only `generatedAt`; it omits resolved model/provider, model settings, prompt/schema version, tool/source version, and evidence identifiers. Failed specialists are added to `allConsultedSpecialists` before generation succeeds, so a transient failure permanently removes that specialty while synthesis continues without a degraded-evidence status. Hallucinated consultations and unsupported evidence are indistinguishable from real execution, and reports cannot be faithfully audited or reproduced after prompt/model changes.

## What Changes

- **Execution-owned consultation ledger**: the workflow SHALL maintain a ledger of requested, succeeded, failed, and cancelled consultations derived from execution records, not from CMO-generated text.
- **Reconciled consulted list**: the report's `specialistsConsulted` SHALL be derived from the ledger's succeeded consultations, not from CMO free text.
- **Evidence references**: supporting evidence in the report SHALL reference source IDs (consultation IDs, tool-call IDs, URLs/record IDs, retrieval times) so each claim is traceable.
- **Failed specialists are not marked consulted**: a specialist SHALL be marked consulted only after a non-empty validated response; failed specialists SHALL be reported as failed and SHALL remain retry-eligible.
- **Provenance metadata**: the report SHALL carry non-PHI provenance metadata: resolved model IDs, model settings, prompt/schema version, tool versions, and `generatedAt`.

## Capabilities

### New Capabilities

- `evidence-provenance-ledger`: Maintains an execution-owned ledger of consultations and tool calls, reconciles the final report against it, and records provenance metadata so claims are traceable and reports are reproducible.

### Modified Capabilities

- `workflow-safety`: Failed specialists SHALL be tracked as failed (not consulted), SHALL remain retry-eligible, and SHALL be reported in final metadata; aborts SHALL be rethrown immediately and not recorded as ordinary failures.

## Impact

- **Backend**: `src/backend/workflows/diagnostic-workflow.ts` (ledger, reconciliation, failure tracking, provenance), `src/shared/report-outcome.ts` (provenance fields), `src/backend/agents/factory.ts` (version metadata), `src/backend/config.ts` (prompt/schema version constants).
- **Tests**: `tests/workflow.test.ts` (ledger, reconciliation, failed-specialist tracking, provenance).
- **Documentation**: `AGENTS.md` (provenance and auditability).