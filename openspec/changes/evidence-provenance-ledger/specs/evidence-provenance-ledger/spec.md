## Purpose

Maintains an execution-owned ledger of consultations and tool calls, reconciles the final report against actual execution, and records provenance metadata so hallucinated consultations and unsupported evidence are detectable and reports are reproducible after prompt or model changes.

## ADDED Requirements

### Requirement: Execution-owned consultation ledger

The workflow SHALL maintain a ledger recording, for each consultation: the specialist ID, round, status (`requested`, `succeeded`, `failed`, `cancelled`), the response reference (or failure reason), and the tool calls invoked during that consultation. The ledger SHALL be derived from execution events, not from CMO-generated text.

#### Scenario: Successful consultation is recorded as succeeded
- **WHEN** a specialist returns a non-empty validated response
- **THEN** the ledger records status `succeeded` with a reference to the response

#### Scenario: Failed consultation is recorded as failed
- **WHEN** a specialist call exhausts retries or returns an empty response
- **THEN** the ledger records status `failed` with the failure reason and the specialist is not marked consulted

#### Scenario: Cancelled consultation is recorded as cancelled
- **WHEN** an abort occurs during a specialist call
- **THEN** the ledger records status `cancelled` and the abort is rethrown, not treated as an ordinary failure

### Requirement: Final report reconciles consulted specialists against the ledger

The report's `specialistsConsulted` SHALL be derived from the ledger's `succeeded` consultations. CMO-generated specialist names that do not match a succeeded ledger entry SHALL be flagged or excluded.

#### Scenario: CMO claims a consultation that did not happen
- **WHEN** the CMO's final report lists a specialist not present in the succeeded ledger
- **THEN** the unmatched entry is flagged or excluded and the discrepancy is logged

#### Scenario: Consulted list matches the ledger
- **WHEN** the CMO's final report lists exactly the succeeded ledger specialists
- **THEN** the report's consulted list is accepted

### Requirement: Evidence references source IDs

Supporting evidence in the report SHALL reference source IDs — consultation IDs, tool-call IDs, upstream URLs or record IDs, and retrieval times — so each claim is traceable to patient input, a successful consultation, or a tool source.

#### Scenario: Evidence references a tool call
- **WHEN** a ranked diagnosis cites supporting evidence
- **THEN** the evidence entry includes a reference to the tool-call ID and source URL that produced it

#### Scenario: Evidence references a consultation
- **WHEN** supporting evidence originates from a specialist's analysis
- **THEN** the evidence entry references the consultation ID

### Requirement: Provenance metadata is recorded

The report SHALL carry non-PHI provenance metadata: resolved model IDs and settings, prompt and schema versions, tool versions, and `generatedAt`. This metadata SHALL be stored with the report outcome and SHALL be available for audit without exposing PHI.

#### Scenario: Report includes provenance metadata
- **WHEN** a report is finalized
- **THEN** the outcome includes resolved model IDs, model settings, prompt/schema version, tool versions, and `generatedAt`

#### Scenario: Provenance does not include PHI
- **WHEN** provenance metadata is inspected
- **THEN** it contains no patient input, drug names, or diagnoses