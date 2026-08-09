## Context

The final report's `specialistsConsulted` and `keyFindings` are CMO-generated strings (`src/backend/workflows/diagnostic-workflow.ts:201-217`, `948-954`, `1203-1225`). The actual `allConsultedSpecialists` set is added to before generation succeeds (`diagnostic-workflow.ts:997-1003`), and failures are converted to consultation text (`1068-1082`), so a failed specialist is marked consulted and cannot be retried. The final output records only `generatedAt` (`diagnostic-workflow.ts:1227`), with no model, prompt, schema, or tool version metadata. There is no execution-owned ledger.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Distinguish actual execution from model claims.
- Make failed/empty specialists retry-eligible and visible in degraded-evidence metadata.
- Make every evidence claim traceable.
- Record reproducible provenance.

**Non-Goals:**
- Full deterministic replay (provider nondeterminism makes exact replay impossible; provenance enables comparison, not bit-identical reproduction).
- Encrypting provenance metadata.
- Changing the report's clinical content format beyond adding references.

## Decisions

### D1: In-workflow ledger

**Decision:** Introduce a `ConsultationLedger` array of `{ specId, round, status, responseRef?, failureReason?, toolCallIds[] }`. Add entries at `requested` before the call, update to `succeeded`/`failed`/`cancelled` after. The ledger is in-memory per workflow and is included in non-PHI provenance metadata.

**Rationale:** Deriving the consulted list from execution events prevents the CMO from inventing consultations. In-memory avoids a schema migration for the POC.

### D2: Mark consulted only after success

**Decision:** Move `allConsultedSpecialists.add(specId)` from before generation (`diagnostic-workflow.ts:1000`) to after a non-empty validated response. Failed/empty specialists are recorded as `failed` and remain eligible for later rounds.

**Rationale:** The current pre-add permanently blocks a failed specialty. Post-success add preserves retry eligibility.

### D3: Evidence references

**Decision:** Extend the report schema so each supporting-evidence string MAY carry an optional `sourceRef` (consultation ID, tool-call ID, or source URL + retrieval time). The CMO is instructed to cite sources; the workflow validates that cited consultation IDs exist in the succeeded ledger and flags unmatched references.

**Rationale:** Traceability lets reviewers verify claims. The CMO is asked to cite; the workflow validates, so hallucinated references are detectable.

### D4: Provenance metadata

**Decision:** Add a `provenance` object to the report outcome: `{ resolvedModels: { cmo, specialists }, modelSettings, promptVersion, schemaVersion, toolVersions, generatedAt }`. Prompt/schema/tool versions are constants exported from `config.ts`.

**Rationale:** Without version metadata, a report generated under an old prompt cannot be distinguished from one under a new prompt. Constants make version drift explicit.

## Risks / Trade-offs

- **[Ledger is in-memory and lost on crash]** → A crashed workflow loses the ledger, but the job is marked failed on restart anyway. **Mitigation:** Acceptable for the POC; durable provenance follows the PostgreSQL migration.
- **[Evidence references add schema complexity]** → The report schema grows. **Mitigation:** `sourceRef` is optional, so older reports still validate.
- **[CMO may not cite sources reliably]** → The CMO might omit references. **Mitigation:** Unreferenced claims are not rejected (the CMO may reason from patient data) but are flagged as unreferenced in metadata.

## Migration Plan

1. Deploy backend; the ledger and provenance take effect immediately.
2. The report outcome gains `provenance`; older clients ignore unknown fields.
3. Rollback: revert to CMO-derived consulted list (unsafe but backward-compatible).

## Open Questions

- Should `sourceRef` be a structured object or a string? (Leaning: structured `{ type, id, url?, retrievedAt? }` for machine readability.)
- Should unmatched CMO-claimed consultations reject the report or just flag? (Leaning: flag and log; rejection could suppress a usable report.)