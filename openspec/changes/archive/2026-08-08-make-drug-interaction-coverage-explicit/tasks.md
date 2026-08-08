## 1. Coverage Contract

- [x] 1.1 Define interaction status, aggregate coverage, per-drug check, and source limitation schemas
- [x] 1.2 Remove the ambiguous `noInteractionsFound` field from the tool output contract
- [x] 1.3 Add schema tests that reject `none_found` with partial or unavailable coverage

## 2. Tool Execution

- [x] 2.1 Refactor drug identity lookup to return checked, unresolved, or failed outcomes
- [x] 2.2 Refactor label retrieval to retain typed per-drug failure details without raw URLs
- [x] 2.3 Build the complete coverage ledger for every requested drug
- [x] 2.4 Derive `found`, `none_found`, or `unknown` only from findings and aggregate coverage
- [x] 2.5 Preserve positive findings when other drugs have partial coverage

## 3. Agent and Progress Integration

- [x] 3.1 Update tool descriptions and agent instructions with negative-result and source limitations
- [x] 3.2 Update tool result summaries to unwrap the result data and report coverage
- [x] 3.3 Update progress and audit handling to distinguish success, partial coverage, and failure

## 4. Verification

- [x] 4.1 Replace tests that treat network and 503 errors as successful negative checks
- [x] 4.2 Add tests for unresolved drugs, mixed success, total outage, known interactions, and complete negatives
- [x] 4.3 Add a clinician-reviewed known-pair corpus for positive and negative regression checks
- [x] 4.4 Add workflow tests proving agents receive and preserve unknown or partial coverage warnings
- [x] 4.5 Run `bun run lint`, `bun run typecheck`, backend tests, and live tool integration tests when credentials and network access are available
