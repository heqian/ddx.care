## 1. Shared Dependencies and Canonical Configuration

- [ ] 1.1 Coordinate and land the strict v2 recorder contracts with `evidence-provenance-ledger`, incorporating `RequestBatch`, admission-only `ConsultationRecord`, per-`Agent.generate` `AttemptRecord`, and per-observed-step `ModelStepRecord` ownership in the same implementation slice rather than requiring the complete evidence change first
- [ ] 1.2 Coordinate and land the exact `encodeUntrustedText`, generic untrusted JSON-envelope serializer, and byte-reused tool-envelope contract with `patient-data-delimiter-escaping` in that slice; do not require its complete report workflow first or add an XML/XML-like/hand-built variant
- [ ] 1.3 Add a strict positive-safe-integer environment parser that rejects empty provided values, signs, whitespace, decimals, exponents, suffixes, zero, negatives, and values above `Number.MAX_SAFE_INTEGER` without partial `parseInt` acceptance
- [ ] 1.4 Add canonical defaults `MAX_SPECIALISTS_PER_ROUND=5`, `MAX_TOTAL_SPECIALISTS=12`, `MAX_TOTAL_MODEL_STEPS=24`, `MIN_SUCCESSFUL_CONSULTATIONS=1`, `REPORT_GENERATION_RESERVE_MS=120000`, and `CONSULTATION_SETTLEMENT_GRACE_MS=5000`
- [ ] 1.5 Remove all planning/implementation aliases and references for `MAX_TOTAL_PROVIDER_ATTEMPTS` and `SYNTHESIS_TIME_RESERVE_MS` rather than maintaining backward compatibility for unshipped settings
- [ ] 1.6 Migrate existing round, concurrency, application-retry, diagnosis-timeout, and specialist/CMO context numeric settings touched by the budget to the strict parser
- [ ] 1.7 Add overflow-safe relationship validation for per-round versus total admissions, total admissions versus reachable rounds, minimum successes versus both total and rounds/per-round capacity, and `MAX_TOTAL_MODEL_STEPS >= ceil(MIN_SUCCESSFUL_CONSULTATIONS / MAX_SPECIALISTS_PER_ROUND) + MIN_SUCCESSFUL_CONSULTATIONS + 2`
- [ ] 1.8 Define internal `INITIAL_REPORT_SETTLEMENT_GRACE_MS=5000` and validate it plus two bounded report windows inside `REPORT_GENERATION_RESERVE_MS`, the consultation-grace/report-reserve deadline relation, and the dynamically computed CMO context minimum
- [ ] 1.9 Add `REPORT_INSUFFICIENT_EVIDENCE` to the strict report outcome-v2 error-code union with execution quality and sealed provenance but no candidate medical report content
- [ ] 1.10 Pass exactly the canonical budget/context environment names through `docker-compose.yml` with defaults matching application configuration and no removed aliases

## 2. RequestBatch Admission and Consultation Lifecycle

- [ ] 2.1 Define strict namespaced `RequestBatch` entries with unique `requestEntryId`, zero-based unique contiguous original `position`, exactly `admitted|invalid|duplicate|budget_rejected`, stable `reasonCode`, timestamps/actors, and required privacy-safe invalid-value digest without raw invalid text
- [ ] 2.2 Update the CMO decision contract so `specialistsToConsult` has no cardinality `.max()`, each ID is a non-empty bounded string rather than enum, `isFinal` is only a consultation-stop signal, and inline `finalReport` is removed
- [ ] 2.3 Update CMO instructions and each round task with remaining round/total admissions, non-report model steps, consultation time, succeeded count, and the requirement to order urgent/high-information-value specialists first
- [ ] 2.4 Keep the complete live registry ID list in CMO instructions/correction guidance; capture every bounded-string entry into its batch, validate against that same registry, and record invalid positions/digests/reason codes without raw invalid strings
- [ ] 2.5 Deduplicate valid IDs within the batch by retaining the first occurrence, priority position, and context directive while marking every later occurrence `duplicate`
- [ ] 2.6 Synchronously select the ordered prefix allowed by round and total capacity, mark the suffix `budget_rejected`, and create a `ConsultationRecord` only for each admitted entry before any promise or worker is scheduled
- [ ] 2.7 Implement consultation transitions `admitted -> started -> succeeded|failed|cancelled` plus `admitted -> cancelled` before start, forbidding `requested`, post-terminal transition, and consultation creation for non-admitted entries
- [ ] 2.8 Charge every admitted consultation permanently across failure, empty output, cancellation, application retries, and later repetition without reopening round/total capacity
- [ ] 2.9 Remove global prior-success exclusion so failed, cancelled, and successful specialists can be explicitly reconsulted in later rounds with a new batch entry and new consultation when capacity permits

## 3. Attempt and Observable Model-Step Enforcement

- [ ] 3.1 Create one generation with exact purpose `cmo_decision|specialist_consultation|final_report` and one evidence-ledger `AttemptRecord` with phase `initial|retry|correction` around every `Agent.generate` call
- [ ] 3.2 Link each tool-capable attempt to its actor, optional consultation, retry ordinal, exact finite `maxSteps`, configured/resolved model metadata, actual settings, prompt assets, status, and child model-step IDs without storing prompts or response text
- [ ] 3.3 Implement a per-run model-step controller that reserves exactly two of `MAX_TOTAL_MODEL_STEPS` for `report_initial` and `report_correction` and exposes only the remaining units to consultation-phase work
- [ ] 3.4 Set an explicit positive `maxSteps` on every non-report `Agent.generate`, bounded by the internal per-call cap and the current non-report remaining snapshot; do not invoke a call when that snapshot is zero
- [ ] 3.5 Install `prepareStep` on every generation call and atomically check signals, phase/scope, exact budget class, and remaining capacity before creating a `ModelStepRecord` with Mastra's zero-based position and permitting the step
- [ ] 3.6 Keep the `prepareStep` check-and-acquire section synchronous with no `await` so concurrent CMO/specialist calls cannot overshoot the global model-step cap
- [ ] 3.7 Link `onStepFinish`, tool hooks, and attempt settlement to the acquired model-step record and retain failed/cancelled steps without refunding units
- [ ] 3.8 Refactor application retry handling so each retry creates a new `AttemptRecord`, installs its own explicit `maxSteps`/`prepareStep`, and consumes only the model steps actually observed through that callback
- [ ] 3.9 Document and record the limitation that invisible provider SDK, gateway, failover, or transport retries below one observed step are neither separately counted nor claimed to be prevented

## 4. Bounded Consultation Settlement and Cancellation

- [ ] 4.1 Compute monotonic diagnosis deadline, report-start deadline, and consultation cutoff using both `REPORT_GENERATION_RESERVE_MS` and `CONSULTATION_SETTLEMENT_GRACE_MS`
- [ ] 4.2 Add a child consultation controller distinct from the parent cancellation/timeout controller and abort it at consultation cutoff without making the report phase observe a parent abort
- [ ] 4.3 Stop CMO selection, admission, scheduling, and consultation application retries at cutoff and check both signals before each scheduler item, after concurrency waits, before worker start, and inside every non-report `prepareStep`
- [ ] 4.4 Wait for child work only until the settlement-grace deadline rather than indefinitely awaiting `Promise.allSettled`
- [ ] 4.5 At grace expiry, terminalize every unresolved admitted/started consultation, attempt, model step, and child tool record as cancelled with stable cutoff/grace codes
- [ ] 4.6 Attach rejection/settlement handlers to detached promises, freeze report eligibility, and seal consultation-owned recorder scopes while leaving the recorder open only for reserved report records
- [ ] 4.7 Make every specialist/tool/step/progress/log hook from a sealed child scope return a safe no-op without mutation, step consumption, event publication, throw, or PHI-bearing warning
- [ ] 4.8 Preserve parent user cancellation and diagnosis timeout through consultation, grace, initial report, and correction paths as failed workflows rather than `generation_failed` outcomes
- [ ] 4.9 Make progress-store insertion and pub/sub conditional on pending job status so late work cannot persist or publish after completed/failed settlement

## 5. Source-Mapped Generic JSON Context

- [ ] 5.1 Replace concatenated context history with typed bounded patient fields, source-mapped patient fragments, individual succeeded consultation responses, directives, failures, and trusted omission metadata
- [ ] 5.2 Use the exact shared generic envelope schema for every source: envelope-level `sourceRecordId`/typed owner and exact fragment-level `sourceFragmentId`, offsets/unit, and encoded text; add no alternate JSON or XML-like shape
- [ ] 5.3 Generate deterministic non-empty complete line fragments with exact UTF-16 offsets, surrogate-safe 1,024-unit chunks for overlong lines, and raw values retained only in workflow memory until encoding
- [ ] 5.4 Select patient fragments before encoding and build `PatientSourceRef` catalog entries only from the exact retained model-visible slices and hashes; omitted text must produce no eligible reference
- [ ] 5.5 Preserve lab evidence through deterministic complete mapped head and tail fragments, deduplicate overlap, retain exact source order/catalog offsets, and omit lower-priority middle fragments before encoding
- [ ] 5.6 Give medical history and conversation transcript deterministic protected mapped-fragment quotas and redistribute only remaining encoded capacity after all mandatory envelopes are reserved
- [ ] 5.7 Select a Unicode-safe raw prefix for every succeeded consultation, serialize one bounded generic consultation envelope with truncation metadata, and never use tail-only selection or omit a succeeded consultation from report context
- [ ] 5.8 Add `MIN_CONSULTATION_PREVIEW_RAW_CHARS=128` and compute the minimum CMO context from exact fixed serializer/catalog/notice overhead, worst-case protected patient fragment encoding, and one minimum preview for each configured `MAX_TOTAL_SPECIALISTS`
- [ ] 5.9 Validate `CMO_CONTEXT_MAX_CHARS` against the computed requirement at startup with configured/required values in the error, and update the calculation automatically when fixed metadata, fragment bounds, preview floor, or maximum consultations change
- [ ] 5.10 Pack mandatory fragments/previews first, redistribute remaining characters deterministically, encode complete envelopes, and assert final dynamic context length without slicing encoded strings, JSON tokens, mappings, notices, or envelopes
- [ ] 5.11 Rework specialist prior context to use the same pre-encoding fragment selection and generic serializer within `SPECIALIST_CONTEXT_MAX_CHARS`, excluding duplicated patient data and permitting a prioritized subset according to context mode

## 6. Evidence Gate, Initial Report, and One Correction

- [ ] 6.1 Centralize CMO `isFinal`, empty admission, round exhaustion, admission exhaustion, non-report model-step exhaustion, and consultation cutoff behind the same settlement and evidence-gate path
- [ ] 6.2 After child-scope sealing, run the minimum-evidence gate over terminal succeeded count and final-context representability; return strict v2 `REPORT_INSUFFICIENT_EVIDENCE` without consuming either report step when below `MIN_SUCCESSFUL_CONSULTATIONS` or any succeeded consultation lacks a retained bounded representation
- [ ] 6.3 Freeze the eligible model-visible patient-fragment, succeeded-consultation, and tool catalog before reporting; require tool execution/transform success, delivered exact envelope bytes, reciprocal asset linkage, and matching non-null safe digest/source-record envelope hash, and prevent later child hooks from changing it
- [ ] 6.4 Partition `REPORT_GENERATION_RESERVE_MS` into two bounded windows and an internal initial-attempt settlement grace so the initial child deadline, grace, terminalization/sealing, and detachment complete before correction time
- [ ] 6.5 Run the `final_report` generation's `initial` attempt with budget class `report_initial`, zero-based step 0, `maxSteps: 1`, no tools, and the strict schema; suppress all late callbacks after its scope is sealed
- [ ] 6.6 Validate the complete initial candidate against schema, every succeeded consultation summary, and the frozen source catalog; treat every unknown/failed/cancelled/missing/duplicate/unmatched claim as whole-candidate invalidity
- [ ] 6.7 Never exclude, rewrite, sanitize, remap, or partially publish an unmatched consultation summary or source reference from an initial or correction candidate
- [ ] 6.8 After the bounded initial handoff, run exactly one `correction` attempt with budget class `report_correction`, zero-based step 0, `maxSteps: 1`, no tools, frozen catalog, and bounded encoded issue feedback
- [ ] 6.9 Accept a fully valid correction; otherwise return `REPORT_VALIDATION_FAILED` with no candidate medical content, while propagating parent abort/timeout as workflow failure
- [ ] 6.10 Leave an unused correction model step/time allocation reserved and unavailable to consultation work when the initial candidate is valid

## 7. PHI-Free Observability and Mock Parity

- [ ] 7.1 Add a typed budget snapshot with phase, round, requested/invalid/duplicate/budget-rejected/admitted/started/model-step/succeeded counts, remaining admission/model-step classes, and a closed reason code
- [ ] 7.2 Project the same snapshot into progress and structured logs only after recorder mutation, allowing execution IDs and validated specialist IDs but excluding raw invalid IDs, patient/source data, hashes, prompts, directives, responses, tools arguments, diagnoses, and free-text errors
- [ ] 7.3 Emit snapshots for batch disposition, admission, consultation start/terminal settlement, model-step acquisition/denial, cutoff, grace expiry, evidence gate, initial/correction settlement, and terminal outcome
- [ ] 7.4 Route mock CMO, specialist, settlement, context/catalog, initial report, correction, and failure adapters through the same request/consultation/attempt/model-step recorder and budget controller
- [ ] 7.5 Make mock mode obey low admission/model-step/context settings, exercise unmatched-initial correction without sanitization, and produce strict v2 insufficient-evidence and validation-failed outcomes

## 8. REPORT_INSUFFICIENT_EVIDENCE Outcome-V2 Migration

- [ ] 8.1 Update strict shared backend/frontend outcome-v2 types and schemas so `REPORT_INSUFFICIENT_EVIDENCE` is accepted only on the completed `generation_failed` variant with required execution quality and sealed provenance
- [ ] 8.2 Update the internal execution envelope and formatter to construct the insufficient-evidence variant from the sealed recorder without a raw report candidate or fabricated clinical fields
- [ ] 8.3 Update `JobStore` strict validation, persistence round-trip fixtures, scrub-before-delete coverage, and startup reads for all v2 available/validation-failed/insufficient-evidence outcomes
- [ ] 8.4 Add persisted-job migration coverage that rejects pre-v2 outcomes and verifies the deployment drain/clear/`JOB_TTL_MS` expiry procedure rather than adapting or fabricating v2 fields
- [ ] 8.5 Update REST completion and `GET /v1/status/:jobId` types/tests to return the exact persisted insufficient-evidence v2 object with existing private/no-store behavior
- [ ] 8.6 Update WebSocket completion, live delivery, terminal reconnect replay, shared message types, and tests to return the exact same insufficient-evidence v2 object as REST
- [ ] 8.7 Update frontend API client/runtime parsing, job context, stream/polling hooks, and fixtures to accept the new code only within the strict v2 union and reject legacy/intermediate shapes
- [ ] 8.8 Update `ResultsView` and unavailable-report UI to render no diagnoses, consultation findings, confidence, urgency, or report export controls for insufficient evidence while preserving generic safety guidance and appropriate retry behavior
- [ ] 8.9 Coordinate with `export-privacy-and-disclaimer`: its existing frontend formatter imports the evidence-owned source-label formatter/strict v2 outcome and blocks insufficient evidence; do not duplicate export formatting here, and disable legacy Print/Share until migrated
- [ ] 8.10 Update mock available, `REPORT_VALIDATION_FAILED`, `REPORT_INSUFFICIENT_EVIDENCE`, forced workflow failure, and cancellation fixtures to use valid v2 envelopes across backend and frontend tests
- [ ] 8.11 Update REST-token and WebSocket-ticket integration coverage to verify authenticated status/replay transport of insufficient-evidence v2 without changing capability security semantics
- [ ] 8.12 Update E2E full-flow, error-state, refresh/reconnect, and retry coverage for insufficient evidence, validation exhaustion, no clinical content/export, and REST/WebSocket parity
- [ ] 8.13 Document and test one coordinated v2 deployment: drain pending v1 jobs, clear/expire legacy outcomes, deploy backend, frontend strict-v2 screens, and `export-privacy-and-disclaimer` integration together, migrate or disable legacy Print/Share, verify all completed paths, and use symmetric rollback drain

## 9. Comprehensive Budget, Concurrency, Cancellation, and Context Tests

- [ ] 9.1 Expand `tests/config.test.ts` for every canonical default/override, removed-name absence, rejected strict integer form, overflow-safe relationship, two report steps/windows, grace/deadline relation, and dynamic CMO context minimum
- [ ] 9.2 Add RequestBatch tests for complete entry ownership, required privacy-safe invalid-value digest/raw exclusion, first-occurrence deduplication, context-directive/priority retention, deterministic capacity suffix rejection, and no consultation for non-admitted entries
- [ ] 9.3 Add consultation lifecycle tests for synchronous admission charge, start timing, every terminal path, cancellation before start, terminal immutability, failure non-refund, and successful/failed cross-round reconsultation
- [ ] 9.4 Add generation/attempt/model-step tests for exact purpose, phase, zero-based position and budget class, one attempt per `Agent.generate`, multiple steps per tool loop, retry separation, foreign keys, and lifecycle
- [ ] 9.5 Add `maxSteps`/`prepareStep` tests for every generation-purpose/attempt-phase/budget-class combination, atomic concurrent acquisition, exact non-report exhaustion, preservation of two report units, no call at zero capacity, and no refunds
- [ ] 9.6 Add an explicit test proving an invisible simulated provider retry does not create an invented `ModelStepRecord` or a false claim that transport retries are globally capped
- [ ] 9.7 Add fake-clock settlement tests for cutoff calculation, child abort, scheduler/prepareStep checks, settle-within-grace, unresolved-at-grace terminalization, detached rejection handling, child-scope sealing, and safe late hooks
- [ ] 9.8 Add report tests for below/exact minimum success, no report-step use below minimum, initial success, initial child timeout that settles within grace, initial work detached/sealed after grace with late-hook suppression, valid correction with preserved step/time, invalid correction exhaustion, reserved-step non-reassignment, and parent abort propagation
- [ ] 9.9 Add context tests for exact generic serializer use, absence of XML-like tags, pre-encoding source selection, UTF-16 mappings, overlong line chunks, worst-case escape expansion, mapped lab head/tail retention, catalog/model visibility equality, and no post-encoding slicing
- [ ] 9.10 Add tests with `MAX_TOTAL_SPECIALISTS` succeeded consultations proving every one has a bounded prefix-only visible envelope and that below-minimum `CMO_CONTEXT_MAX_CHARS` fails with the dynamic required value
- [ ] 9.11 Expand progress-store/logger tests for every snapshot reason, PHI-free invalid/failure handling, sealed-scope no-op behavior, and no persisted/published post-terminal events
- [ ] 9.12 Add mock parity tests for low admissions, low model steps, dynamic context failure, settlement cutoff, initial correction, insufficient evidence, strict v2 persistence, and event ordering

## 10. Documentation and Verification

- [ ] 10.1 Update `.env.example`, `README.md`, and `AGENTS.md` with canonical names/defaults, admission versus attempt versus model-step units, `maxSteps`/`prepareStep` enforcement, invisible provider-retry limitation, two report reservations, grace/sealing behavior, and dynamic context minimum
- [ ] 10.2 Document RequestBatch/ConsultationRecord ownership, report candidate invalidation, source-visible fragment catalog semantics, generic JSON-only context, and the same-v2 `REPORT_INSUFFICIENT_EVIDENCE` deployment/rollback procedure
- [ ] 10.3 Run `bun run lint`, `bun run typecheck`, backend unit tests, frontend tests, REST-token tests, WebSocket-ticket tests, Playwright E2E, integration tests, and contract tests after implementation, recording environment-dependent skips separately from failures
- [ ] 10.4 Run strict OpenSpec verification after implementation and confirm no removed provider-attempt/synthesis-reserve aliases, single-report language, XML context wrappers, or compatibility parser remains
