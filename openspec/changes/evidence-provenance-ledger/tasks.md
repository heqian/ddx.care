## 1. Strict Shared Contracts

- [ ] 1.1 Coordinate the shared contract slice with `consultation-budget-enforcement` and `patient-data-delimiter-escaping`, then replace shared string evidence in `src/shared/report-outcome.ts` with strict `{ statement, sourceRefs[] }` objects whose patient, consultation, and tool references include and resolve through `sourceFragmentId`; do not require either complete behavioral change to land first
- [ ] 1.2 Define strict namespaced IDs, structured actors, lowercase four-disposition request batches/entries with unique IDs and zero-based contiguous positions, synchronously admitted consultation lifecycle, generation-purpose/attempt-phase/zero-based-model-step hierarchy with per-attempt `maxSteps`, three-axis tool execution/transform/delivery, unique source-record definitions and child fragment references, execution quality, runtime assets, and `ProvenanceV1` schemas and inferred types
- [ ] 1.3 Define shared `PromptAssetUsageV1` with a unique usage ID, required attempt linkage, optional consultation linkage, reciprocal tool-call linkage for model-output assets, review invariants for approved/known/string, unreviewed/known/null, and unknown/`"unknown"`, immutable manifest version/hash identity, and execution status constrained to equal the owning attempt
- [ ] 1.4 Nest attempts and request batches under their generation and model steps/prompt usages under their attempt; reject duplicate namespaced IDs, broken foreign keys, status disagreement, and unrelated index-aligned collections
- [ ] 1.5 Require `executionQuality` and `ProvenanceV1` on both completed outcome variants, add `REPORT_INSUFFICIENT_EVIDENCE`, structured evidence, and the fixed traceability notice, and strictly reject legacy or extra-field shapes
- [ ] 1.6 Define the internal `DiagnosisExecutionEnvelopeV1` and strict raw report-generation union in `src/backend/workflows/diagnostic-workflow.ts`, with `runDiagnosis` returning an envelope only for completed `available` or `generation_failed` paths
- [ ] 1.7 Add explicit report-schema, prompt-schema, app/revision, lock, tool, and dataset metadata sources, using literal `unknown` rather than inferred package ranges, provider defaults, or invisible retry counts

## 2. Recorder, Requests, and Consultations

- [ ] 2.1 Implement one sealable per-run in-memory recorder that validates namespaced uniqueness, ownership links, transition order, terminal immutability, current status, and completed-outcome sealing
- [ ] 2.2 Parse CMO requested specialist values as bounded strings and create one `RequestBatch` per structurally valid decision linked to its generation, exact attempt, and producing observed model step
- [ ] 2.3 Record every requested position in order with exactly `admitted|invalid|duplicate|budget_rejected`, a stable reason code, canonical valid ID when applicable, and required privacy-safe digest instead of arbitrary invalid raw value
- [ ] 2.4 Apply same-batch duplicate, registry, round/total-capacity, phase, and abort checks; synchronously admit the ordered prefix and create/charge each `ConsultationRecord` in one no-`await` section before any promise or worker is scheduled
- [ ] 2.5 Enforce consultation transitions `admitted -> started -> succeeded | failed | cancelled` plus direct `admitted -> cancelled` before start, requiring non-empty accepted specialist output for success and keeping exhausted retry or empty-output failures distinct from pre-admission rejection
- [ ] 2.6 Remove the global already-consulted filter so a later explicit request can create a new consultation for a previously successful or failed specialist while duplicates within one request batch remain non-admitted
- [ ] 2.7 Record in-memory cancellation on admitted/started consultation work before propagating the distinct abort error, then discard the recorder after failed job status rather than sealing or persisting it
- [ ] 2.8 Project explicit request disposition and consultation execution fields into progress only after recorder updates, with no provenance or report reconstruction from progress history

## 3. Generation, Model-Step, and Prompt Usage

- [ ] 3.1 Create one generation with purpose `cmo_decision|specialist_consultation|final_report` and one attempt with phase `initial|retry|correction` immediately before every application call to `Agent.generate`, retaining retries/correction under their owning generation
- [ ] 3.2 Pass an explicit finite `maxSteps` to every generation operation and use `prepareStep` to mint one `modelStepId` per application-observed sequential step with Mastra's zero-based position and budget class `non_report|report_initial|report_correction`, rejecting steps beyond that class budget with a stable code
- [ ] 3.3 Finalize only application-observed model steps from Mastra callbacks/returned steps and provider metadata; allow zero-step failed attempts and record hidden provider transport retry count as `unknown`
- [ ] 3.4 Capture configured and provider-resolved model identities, allowlisted settings actually sent or returned, structured-output mode, timestamps, result digest, and stable status/code per attempt without prompts, response text, reasoning, headers, or credentials
- [ ] 3.5 Resolve immutable canonical prompt-manifest identity and active applicable append-only review state separately at attempt start; retain known version/hash when review lookup is unavailable and use the all-unknown identity pair only when manifest identity is unavailable
- [ ] 3.6 Validate that each prompt usage actor, optional consultation, attempt ID, and final execution status agree with its owning attempt and that approval is impossible with unknown version, hash, or review ID

## 4. Tool Execution, Delivery, Retrieval, and Cache

- [ ] 4.1 Extend `createToolEventHooks` to accept recorder plus generation/attempt/step ownership, mint/map one internal `toolCallId`, create its reciprocal model-output asset usage from the attempt-start snapshot before executor invocation, and record lifecycle state before progress or aggregate logging
- [ ] 4.2 Pass a server-owned Mastra `RequestContext` through CMO and specialist generations so tool and retrieval paths can resolve ownership without accepting client-controlled recorder values or fabricating consultation IDs
- [ ] 4.3 Canonicalize/hash returned raw tool results, prepare/hash the exact complete safe or fail-safe envelope, and independently record terminal `executionStatus`, `transformStatus`, and `deliveryStatus` with strict digest nullability and reciprocal model-output asset usage linkage
- [ ] 4.4 Record thrown execution as failed/not-attempted transform with independent fail-safe delivery, typed failure as execution-failed even when transformed/delivered, transform failure as transform-failed even when fail-safe fallback is delivered, cancellation semantics, and usable partial success with stable codes/limitations
- [ ] 4.5 Update `fetchJSON`, `fetchText`, `tool-cache`, and local-dataset internals to report network/cache/local mode, cache state, original fetch time, age, timestamps, and stable source ID while preserving current tool output shapes
- [ ] 4.6 Add allowlisted provenance adapters for every registered medical tool covering privacy-safe public IDs, stable codes, tool/dataset versions, and explicit `unknown` values
- [ ] 4.7 Centrally reject raw URLs, cache keys, arguments, queries, clinical terms, titles, summaries, raw/safe outputs, and free-text errors from tool and retrieval provenance

## 5. Final-Context Source Fragments

- [ ] 5.1 Extend final context packing to emit canonical envelopes with one namespaced `sourceRecordId`/typed owner and an exact `sourceFragmentId`, offsets/unit, and encoded text on every retained patient, consultation, and safe-tool fragment
- [ ] 5.2 Map each retained patient fragment back to exact UTF-16 offsets and a fresh UTF-8 slice hash in the original bounded request field before headings or guard text are added
- [ ] 5.3 Link consultation fragments only to succeeded consultations and tool fragments only to calls with succeeded execution, succeeded transform, delivered exact safe bytes, and matching non-null safe digest
- [ ] 5.4 Require at least one retained bounded representation for every succeeded consultation; if packing cannot satisfy that invariant, skip report generation and complete with `REPORT_INSUFFICIENT_EVIDENCE`
- [ ] 5.5 Freeze the eligible source catalog and exact fragment context before initial report generation, omit unretained patient/tool material, and ensure bounded correction feedback cannot repack catalog fragments away
- [ ] 5.6 Persist fragment ownership, bounds, digests, and stable limitations but never raw fragment text in `ProvenanceV1`

## 6. Report State Machine, Validation, and Formatting

- [ ] 6.1 Remove inline `finalReport` so every report uses one `final_report` generation containing an `initial` attempt and, only when needed, one `correction` attempt
- [ ] 6.2 Run both report attempts with `toolChoice: none`, explicit `maxSteps: 1`, zero-based one-step guards using `report_initial`/`report_correction` budget classes, the same frozen catalog, and no application retry wrapper
- [ ] 6.3 Give the initial attempt a child deadline and internal bounded settlement grace; terminalize/seal and detach unresolved initial work with rejection handlers and complete late-hook suppression before correction starts
- [ ] 6.4 Update report prompts and strict raw schema to emit consultation summaries keyed by `consultationId` and at least one non-empty `{ statement, sourceRefs[] }` item per ranked diagnosis
- [ ] 6.5 Resolve every source fragment through its unique owning source record and verify patient tuple/hash, consultation success/representation, tool execution/transform/delivery, safe digest equality with the complete byte-reused tool envelope, reciprocal model-output asset usage, and optional public ID ownership
- [ ] 6.6 Require every structured consultation summary or consultation claim to exactly match represented succeeded consultations without missing, duplicate, failed, cancelled, or unknown IDs
- [ ] 6.7 Reject the entire initial candidate for any empty, schema, summary, claim, or source defect and send only bounded issue codes/paths to exactly one correction attempt; never remove or sanitize invalid content into an available subset
- [ ] 6.8 Return `REPORT_VALIDATION_FAILED` with no candidate medical content for any invalid/empty correction, while propagating cancellation and timeout as workflow failures without durable provenance
- [ ] 6.9 Make `formatReport` derive the consulted list and nominal/degraded execution quality from the sealed ledger, including request-disposition counts, failed/cancelled consultations, and material tool limitations
- [ ] 6.10 Add the fixed traceability-not-truth notice and ensure rationale, summaries, contradictory evidence, next steps, cross-specialty observations, and immediate actions remain labeled model synthesis rather than source-verified content

## 7. Persistence, API, WebSocket, and Mocks

- [ ] 7.1 Update `JobStore` fixtures and strict round trips for outcome v2 while retaining completed provenance only in the result column under existing `JOB_TTL_MS` scrub-before-delete behavior
- [ ] 7.2 Ensure failed, timed-out, and cancelled workflows mark failed status and discard their in-memory recorder without writing provenance, a failed/cancelled audit ledger, or another durable copy
- [ ] 7.3 Update route completion and workflow logging for the new outcome while limiting provenance-related logs to aggregate counts and stable codes with no IDs, hashes, source references, or full records
- [ ] 7.4 Update WebSocket terminal delivery/replay and associated types so live completion, reconnect replay, and REST polling return the exact same strict completed object
- [ ] 7.5 Update mock available and `generation_failed` paths to produce valid linked envelopes, and update forced workflow failure/cancellation paths to prove no completed provenance is retained
- [ ] 7.6 Confirm progress, audit logs, application logs, tool cache, and all databases contain no duplicate full provenance ledger

## 8. Frontend, Status Presentation, and Export

- [ ] 8.1 Update frontend API types, client validation, status responses, WebSocket messages, and `useJobStream` to accept only the shared strict v2 completed outcome with no legacy adapter
- [ ] 8.2 Update waiting-room status derivation and cards to distinguish request non-admission from consultation execution and use green only for succeeded consultations; preserve degraded presentation after later recovery
- [ ] 8.3 Add an accessible degraded-execution warning before available clinical content and render privacy-safe request counts, failed/cancelled consultation metadata, and material tool limitations without raw errors or queries
- [ ] 8.4 Implement one shared evidence-owned source-label formatter and update `DiagnosisCard`, `ConsultNotes`, and other screen consumers to import it for privacy-safe retained-fragment labels, synthesis identification, and traceability notice
- [ ] 8.5 Coordinate with `export-privacy-and-disclaimer` so its existing frontend export formatter imports the shared evidence-label formatter and strict v2 outcome; do not duplicate export layout/serialization here, and disable legacy Print/Share until the coordinated frontend deploy is ready

## 9. Automated Coverage

- [ ] 9.1 Test request batches for exact position/order, the four lowercase dispositions plus reason codes, valid IDs, required invalid-value digests, duplicates, synchronous pre-scheduling admission, direct admitted-to-cancelled transition, and absence of consultations for rejected entries
- [ ] 9.2 Test consultation lifecycle, retry versus reconsultation, non-empty success, exhausted/empty failure, explicit progress status, cancellation-before-rethrow, and recorder discard on failed workflows
- [ ] 9.3 Test exact generation purposes, attempt phases, zero-based model-step positions/budget classes, distinct `Agent.generate` attempts, zero/multi-step operations, `maxSteps`/`prepareStep` enforcement, model metadata, hidden-retry `unknown`, and final-report one-plus-one limits
- [ ] 9.4 Test `PromptAssetUsageV1` immutable manifest identity, separate active-review snapshot, approved/unreviewed/unknown states, known identity with unavailable review lookup, all-unknown manifest bootstrap, required linkage, and status/actor/consultation agreement
- [ ] 9.5 Extend tool/fetch/cache tests for CMO/specialist ownership, optional step linkage, digest nullability, all execution/transform/delivery combinations including delivered fail-safe fallbacks, exact-byte delivery, source ineligibility, partial limitations, cache/local data, public-ID allowlists, and prohibited-field absence
- [ ] 9.6 Test final context packing for original patient offsets, exact retained digests, omitted-source ineligibility, consultation/tool eligibility, frozen correction context, and `REPORT_INSUFFICIENT_EVIDENCE` when any succeeded consultation is unrepresented
- [ ] 9.7 Test whole-candidate validation for every source kind, malformed ownership/hash/offset/public ID, invisible or undelivered sources, empty evidence, duplicate/missing/unmatched consultation claims, one successful correction, and unsanitized `REPORT_VALIDATION_FAILED` exhaustion
- [ ] 9.8 Test strict schemas and progress-store persistence for both completed variants, nested-link failures, legacy rejection, exact round trips, scrub-before-delete, and no durable provenance for failed/cancelled/timed-out workflows
- [ ] 9.9 Test REST/WebSocket/frontend-client parity and reconnect replay, shared evidence-label parity across screens and the coordinated `export-privacy-and-disclaimer` formatter, degraded recovery, and disabled legacy Print/Share before migration
- [ ] 9.10 Update end-to-end full-flow and error-state coverage for v2 available, insufficient-evidence, validation-exhaustion, degraded execution, transport parity, and absence of report/provenance result on workflow failure

## 10. Documentation, Migration, and Verification

- [ ] 10.1 Update `AGENTS.md` with request/admission separation, linked generations/attempts/observed steps, hidden-retry limits, tool execution versus delivery, retained-fragment eligibility, report attempt bounds, prompt usage, privacy exclusions, and completed-only retention
- [ ] 10.2 Document coordinated deployment and rollback: drain pending work, clear incompatible completed jobs or wait `JOB_TTL_MS`, deploy/roll back backend, frontend strict-v2 screens, and `export-privacy-and-disclaimer` integration together, disable unsafe legacy Print/Share, and never fabricate provenance through a compatibility shim
- [ ] 10.3 Run `bun run lint`, `bun run typecheck`, `bun run test:all`, `bun run test:integration`, and `bun run test:contract`, recording environment-dependent skips separately from failures
