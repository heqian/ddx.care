## 1. Consultation Ledger

- [ ] 1.1 Add a `ConsultationLedger` type and per-workflow array in `src/backend/workflows/diagnostic-workflow.ts`
- [ ] 1.2 Record `requested` before each specialist call, `succeeded` after a non-empty response, `failed` on exhaustion/empty, and `cancelled` on abort
- [ ] 1.3 Move `allConsultedSpecialists.add(specId)` to after a non-empty validated response so failed specialists remain retry-eligible
- [ ] 1.4 Rethrow abort errors immediately in the specialist catch block and record `cancelled` in the ledger

## 2. Reconciliation

- [ ] 2.1 After final report generation, derive `specialistsConsulted` from the succeeded ledger entries
- [ ] 2.2 Flag or exclude CMO-claimed specialists not present in the succeeded ledger and log the discrepancy

## 3. Evidence References

- [ ] 3.1 Extend the report schema so supporting evidence MAY carry a `sourceRef` (consultation ID, tool-call ID, source URL, retrieval time)
- [ ] 3.2 Validate that cited consultation IDs exist in the succeeded ledger; flag unmatched references

## 4. Provenance Metadata

- [ ] 4.1 Add prompt/schema/tool version constants to `src/backend/config.ts`
- [ ] 4.2 Add a `provenance` object to the report outcome in `src/shared/report-outcome.ts` with resolved models, settings, versions, and `generatedAt`
- [ ] 4.3 Populate provenance during `formatReport` and ensure it contains no PHI

## 5. Tests

- [ ] 5.1 Add `tests/workflow.test.ts` cases: succeeded consultation recorded; failed specialist recorded as `failed` and retry-eligible; empty response recorded as `failed`; abort recorded as `cancelled`
- [ ] 5.2 Add a test asserting the final consulted list is derived from the ledger and unmatched CMO claims are flagged
- [ ] 5.3 Add a test asserting provenance metadata is present and PHI-free
- [ ] 5.4 Add a test asserting evidence references validate against the ledger

## 6. Documentation and Verification

- [ ] 6.1 Update `AGENTS.md` to document the ledger, reconciliation, evidence references, and provenance
- [ ] 6.2 Run `bun run lint`, `bun run typecheck`, and `bun run test`