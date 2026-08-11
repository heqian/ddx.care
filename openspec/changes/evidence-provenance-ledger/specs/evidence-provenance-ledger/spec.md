## Purpose

Provides a privacy-minimized, execution-owned account of admitted consultations and application-observed model/tool work, then limits evidence citations to exact bounded source fragments retained in the final model context. It supports audit and comparison of completed outcomes without claiming invisible provider retries, source entailment, clinical truth, or deterministic replay.

## ADDED Requirements

### Requirement: Workflow stages exchange one authoritative completed-outcome envelope

The diagnostic workflow SHALL produce a strict, versioned execution envelope containing the raw report-generation outcome and strict `ProvenanceV1`, and the formatting stage SHALL accept that envelope rather than a report candidate alone. The recorder SHALL be written directly by request disposition, admission, `Agent.generate`, application-observed model-step, tool lifecycle, model-delivery, and context-packing paths. Progress events, logs, and model-authored text SHALL NOT be used to reconstruct provenance.

The envelope SHALL define unique namespaced `generationId`, `attemptId`, `modelStepId`, `requestBatchId`, `requestEntryId`, `consultationId`, `toolCallId`, `promptAssetUsageId`, `sourceRecordId`, and `sourceFragmentId` values in their owning collections. Foreign-key references, including multiple fragments referring to one source record, SHALL reuse those definitions rather than count as duplicate definitions. Duplicate definitions, wrong namespaces, broken links, invalid lifecycle order, or records not aligned to their owning generation SHALL fail strict validation.

#### Scenario: Completed outcome reaches formatting
- **WHEN** diagnosis reaches an `available` or `generation_failed` completed outcome
- **THEN** `formatReport` receives one envelope containing the raw outcome and the sealed execution provenance for that workflow run

#### Scenario: Progress is incomplete
- **WHEN** a progress event is missing, duplicated, delayed, or presentation-only
- **THEN** request, consultation, generation, model-step, tool, source, and report data remain determined only by the execution recorder

#### Scenario: Execution links are inconsistent
- **WHEN** an attempt points to an unknown generation, a model step points to another attempt, or any namespaced ID is reused
- **THEN** strict envelope validation fails and no `available` outcome is emitted

### Requirement: Request batches preserve requests and admission dispositions

Every structurally parseable CMO consultation decision SHALL create a `RequestBatch` linked to the CMO decision generation, the exact `Agent.generate` attempt, and the application-observed model step that produced the decision. Every entry SHALL have a unique namespaced `requestEntryId`; positions SHALL be the original zero-based array positions and SHALL be unique and contiguous within the batch. The batch SHALL record every requested array position in order, including valid specialist IDs, invalid IDs, and duplicates. A valid canonical ID SHALL be stored directly. An invalid value SHALL be represented only by a bounded privacy-safe digest plus stable `reasonCode`, not copied as arbitrary clinical text.

Each request entry SHALL receive exactly one lowercase disposition from `admitted`, `invalid`, `duplicate`, or `budget_rejected`, plus stable `reasonCode`, timestamp, and workflow actor. Missing registered agent, round/total capacity, closed round, cutoff, and pre-admission cancellation details SHALL be reason codes under the applicable shared disposition. Only `admitted` entries SHALL link a `consultationId`; only `invalid` entries SHALL carry the required invalid-value digest.

After validation/deduplication, admission SHALL synchronously select the ordered prefix that fits round and total capacity. In one no-`await` section before any promise or worker is scheduled, each selected entry SHALL become `admitted`, consume capacity, and create its `ConsultationRecord`. Its transition history SHALL begin at `admitted`, normally move to `started`, then exactly one terminal status: `succeeded`, `failed`, or `cancelled`; direct `admitted -> cancelled` SHALL be valid for cutoff or cancellation before worker start. Rejected, invalid, duplicate, or budget-rejected entries SHALL remain request-entry dispositions and SHALL never create a failed consultation.

#### Scenario: CMO requests an invalid specialist ID
- **WHEN** a parseable request entry does not match a canonical registered specialist ID
- **THEN** the request batch records its position, privacy-safe invalid-value digest, disposition `invalid`, and stable invalid-ID reason code without creating a consultation

#### Scenario: CMO repeats a specialist in one batch
- **WHEN** the same valid specialist ID occurs more than once in one request batch
- **THEN** the batch records every entry, considers only the first eligible occurrence for admission, marks later occurrences `duplicate` with a stable reason code, and creates no consultation for those duplicates

#### Scenario: Valid request is not admitted
- **WHEN** a valid request cannot be admitted because the agent is unavailable, capacity/round state rejects it, or cancellation occurs before synchronous admission
- **THEN** the request entry receives the corresponding non-admission disposition and no consultation record exists

#### Scenario: Valid request is admitted
- **WHEN** a valid unique request is in the synchronously admitted ordered prefix
- **THEN** the entry receives `admitted`, links a new `consultationId`, consumes capacity before scheduling, and the new consultation lifecycle begins at `admitted`

#### Scenario: Admitted request is cancelled before worker start
- **WHEN** cutoff or cancellation occurs after synchronous admission but before asynchronous specialist work starts
- **THEN** the charged consultation transitions directly `admitted -> cancelled` and is not rewritten as a non-admitted request

### Requirement: Generations, Agent.generate attempts, and observed model steps are linked and bounded

A `generationId` SHALL identify one logical workflow generation with purpose exactly `cmo_decision`, `specialist_consultation`, or `final_report`. Each `attemptId` SHALL identify exactly one application invocation of `Agent.generate` within that generation and SHALL have phase exactly `initial`, `retry`, or `correction`. Application-level CMO/specialist retries SHALL use phase `retry`; the optional second attempt under `final_report` SHALL use phase `correction`. Attempts SHALL NOT reuse an attempt ID.

Each application-observed Mastra sequential LLM step/provider call within an `Agent.generate` attempt SHALL receive a unique `modelStepId`, Mastra's zero-based step position, budget class exactly `non_report`, `report_initial`, or `report_correction`, timestamps, execution status, and observable provider/model metadata. Budget class SHALL be consistent with the owning generation purpose and attempt phase. Each attempt SHALL record the exact finite `maxSteps` passed to its own call, because retries and concurrent snapshots may differ. The attempt SHALL contain its model steps and prompt usages, and its owning generation SHALL contain its attempts, request batches, and generation-level attempt/tool policy; these records SHALL NOT be maintained as unrelated index-aligned arrays.

Every attempt SHALL pass an explicit finite `maxSteps`, and `prepareStep` SHALL enforce the same model-step budget while assigning the next `modelStepId`. Crossing the budget SHALL stop the attempt with a stable application code. Provenance SHALL describe only `Agent.generate` operations and Mastra steps/provider calls observed by the application. Transport retries performed invisibly inside a provider adapter SHALL NOT be counted, assigned IDs, or claimed as observed; when their count is unavailable it SHALL remain `unknown`.

#### Scenario: Application retries Agent.generate
- **WHEN** application retry policy invokes `Agent.generate` again for the same logical specialist generation
- **THEN** the generation contains two distinct attempts with distinct attempt IDs and each attempt contains only its own observed model steps

#### Scenario: Agent performs sequential tool-use steps
- **WHEN** one `Agent.generate` operation performs multiple application-observed Mastra model steps
- **THEN** each observed step has a distinct `modelStepId` linked to that attempt and the explicit step budget caps the sequence

#### Scenario: Provider adapter retries transport internally
- **WHEN** a provider adapter retries a request without exposing a new Mastra step or provider call to application hooks
- **THEN** provenance records no invented attempt or model step and does not claim an observable retry count

### Requirement: Tool provenance distinguishes execution from model delivery

The workflow SHALL maintain one tool ledger for specialist-owned and CMO-owned calls. Every tool record SHALL link its `generationId` and required `attemptId`, optional `consultationId`, and `modelStepId` when the application can associate the call with an observed step. Absence of an observable model-step association SHALL be explicit and SHALL NOT be guessed.

Each terminal tool record SHALL include three independent axes: `executionStatus` (`succeeded`, `failed`, or `cancelled`), `transformStatus` (`not_attempted`, `succeeded`, or `failed`), and `deliveryStatus` (`not_attempted`, `delivered`, or `not_delivered`). It SHALL also include start/completion times, nullable SHA-256 `rawResultDigest`, nullable SHA-256 `safeModelOutputDigest`, privacy-safe public record IDs, retrieval/cache metadata, tool/dataset versions, stable typed execution/transform/delivery codes, and limitation codes. `rawResultDigest` SHALL be non-null exactly when the executor returned a canonical result, including typed failure, and null when execution threw or was cancelled before a result. `safeModelOutputDigest` SHALL be non-null exactly when canonical safe or fail-safe bytes were prepared. `deliveryStatus: delivered` SHALL require a non-null safe digest and attachment of those exact bytes to a subsequent model request.

A thrown tool error SHALL remain `executionStatus: failed` and use `transformStatus: not_attempted`; the shared fail-safe serializer MAY prepare and deliver a canonical fallback, with independent safe digest and delivery status. A typed failure SHALL remain execution-failed even when its bounded failure transform succeeds and is delivered. A successful execution whose tool transform or bounding fails SHALL retain `executionStatus: succeeded` and use `transformStatus: failed`; a canonical fail-safe fallback MAY be prepared/delivered without changing that failed transform state. Cancellation SHALL remain execution-cancelled. A usable partial result SHALL be execution- and transform-succeeded with explicit limitations rather than complete coverage. Every tool call SHALL link exactly one `tool.<toolId>.model-output` usage by `modelOutputAssetUsageId`, and that usage SHALL point back by `toolCallId`. A tool source SHALL be citation-eligible only when execution succeeded, transform succeeded, exact safe envelope bytes were delivered and reused in final context, their digest matches the retained source record's complete-envelope hash, and at least one related source fragment was retained. Fail-safe fallback content SHALL always be ineligible.

Retrieval records SHALL identify stable source/dataset IDs, network/cache/local mode, hit/miss/disabled status, original source fetch time, cache age, and explicit `unknown` values without URLs or cache keys. Tool provenance SHALL contain no raw arguments, query strings, condition terms, drug names, diagnosis names, titles, summaries, raw results, safe model output, or free-text provider errors.

#### Scenario: Tool executes and safe output is delivered
- **WHEN** a tool returns successfully and its safe bounded model-output transformation is delivered
- **THEN** execution and transform are `succeeded`, delivery is `delivered`, both digests are recorded, and the tool can become eligible only if a matching final-context source fragment is retained

#### Scenario: Tool throws
- **WHEN** tool execution throws before producing a result
- **THEN** execution is `failed`, transform is `not_attempted`, a canonical fail-safe fallback may independently be prepared/delivered, the typed execution code is recorded, and the tool is ineligible as a source

#### Scenario: Model-output transformation fails
- **WHEN** raw tool execution succeeds but safe model-output transformation or bounding fails
- **THEN** execution remains `succeeded`, transform is `failed`, fail-safe fallback delivery is recorded independently, and the tool is ineligible as a source

#### Scenario: CMO-owned tool lacks a consultation
- **WHEN** the CMO invokes a tool during a decision generation
- **THEN** the tool links the CMO generation and attempt, plus model step when observable, without fabricating a consultation ID

### Requirement: Evidence eligibility is based on retained model-visible source fragments

Before initial report generation, the workflow SHALL build and freeze the eligible source catalog from the exact bounded fragments retained after final context packing. Every canonical generic envelope SHALL have one namespaced `sourceRecordId` and typed owner. `ProvenanceV1.sourceRecords` SHALL define that ID once with its owner, complete model-visible envelope hash, and child fragment IDs; multiple `sourceFragments` MAY reference that one record. Each item in the envelope's `fragments` array SHALL carry the exact namespaced `sourceFragmentId`, offsets/unit, and encoded text for one catalog member. Each persisted fragment SHALL retain that source-record link, source kind, owning patient/consultation/tool identity, model-visible content digest, retained bounds, and limitation codes. Raw fragment content SHALL be supplied to the final model but SHALL NOT be persisted in `ProvenanceV1`.

Patient fragments SHALL map their retained model-visible text to `medicalHistory`, `conversationTranscript`, or `labResults` offsets in the original bounded field. Their hash SHALL cover the exact original-field slice, and only slices actually retained in final context SHALL be citable. A consultation fragment SHALL link a `succeeded` consultation and the bounded representation actually retained for report synthesis. A tool fragment SHALL link a tool whose execution and bounded model delivery both succeeded and SHALL represent only the retained safe model output.

Every succeeded consultation SHALL have at least one bounded consultation fragment in the frozen final context before report generation starts. If context packing cannot retain a representation for every succeeded consultation, the workflow SHALL not ask the model for unseen consultation summaries and SHALL complete with `generation_failed` and stable `REPORT_INSUFFICIENT_EVIDENCE`. Tool and patient sources omitted by packing are simply ineligible and SHALL not appear in the catalog.

#### Scenario: Patient slice is retained
- **WHEN** a bounded patient-field slice survives final context packing
- **THEN** its catalog entry preserves original bounded-field offsets and hash and can be cited by its retained source fragment

#### Scenario: Patient slice is omitted
- **WHEN** a patient slice does not survive final context packing
- **THEN** it is absent from the eligible catalog and any candidate reference to it is invalid

#### Scenario: Succeeded consultation cannot be represented
- **WHEN** final context packing cannot retain any bounded representation for one succeeded consultation
- **THEN** report generation does not start and the completed outcome is `generation_failed` with `REPORT_INSUFFICIENT_EVIDENCE`

#### Scenario: Delivered tool output is omitted from final context
- **WHEN** a tool executed and delivered safe output to its invoking model but no related fragment is retained for final report synthesis
- **THEN** the tool remains recorded but is not citation-eligible

### Requirement: Final report generation is a bounded two-state correction machine

CMO round decisions SHALL contain consultation requests and an `isFinal` decision only; they SHALL NOT contain an inline final report. Every final report SHALL be produced by one generation whose purpose is `final_report`, with one structured attempt whose phase is `initial`. If and only if the initial attempt is empty, throws, violates strict schema, contains invalid consultation summaries/claims, or contains invalid source references, the workflow SHALL perform exactly one attempt whose phase is `correction`. No application retry wrapper SHALL add further report attempts.

Both report attempts SHALL use `toolChoice: none`, explicit `maxSteps: 1`, and a `prepareStep` guard that allows exactly one application-observed model step with zero-based position and budget class `report_initial` or `report_correction`. Both SHALL receive the same frozen eligible source catalog; correction feedback SHALL be bounded so catalog fragments are not repacked away.

The initial attempt SHALL have a child deadline and internal bounded settlement grace inside its allocated report window. If it remains unresolved, the workflow SHALL terminalize and seal the initial attempt/model-step scope, attach detached settlement handlers, and suppress every late callback or mutation from that scope before correction starts. The correction's reserved step and time SHALL remain intact. Parent cancellation or diagnosis timeout SHALL still fail the whole workflow and prevent correction.

Every ranked diagnosis SHALL contain at least one non-empty `{ statement, sourceRefs[] }` item. Every structured consultation summary or consultation claim SHALL match a succeeded consultation represented in the frozen catalog, without duplicates or omissions. Every source reference SHALL match an eligible retained fragment and its owning patient, consultation, or tool record. Any unmatched, failed, cancelled, undelivered, invisible, malformed, duplicate, or omitted structured claim/reference SHALL invalidate the entire candidate. The workflow SHALL NOT remove, exclude, rewrite, filter, or sanitize invalid items into an available report.

If the correction candidate has any defect, the outcome SHALL be `generation_failed` with `REPORT_VALIDATION_FAILED` and no candidate medical content. Source validation SHALL apply only to supporting-evidence references; rationale and other narrative remain model synthesis. Citations establish traceability to model-visible execution content, not entailment, accuracy, or clinical truth.

#### Scenario: Initial report is valid
- **WHEN** the initial structured attempt passes strict schema, exact consultation-claim matching, and all source-reference checks
- **THEN** it becomes the available candidate and no correction attempt runs

#### Scenario: Initial report contains one unmatched claim
- **WHEN** any consultation summary, structured consultation claim, or source reference is unmatched or ineligible
- **THEN** the entire initial candidate is rejected and exactly one correction attempt runs without exposing a sanitized subset

#### Scenario: Correction remains invalid
- **WHEN** the correction candidate contains any schema, claim, or source-reference defect
- **THEN** the outcome is `generation_failed` with `REPORT_VALIDATION_FAILED` and contains no candidate medical report

#### Scenario: Report attempt tries to invoke a tool or extra step
- **WHEN** the final report model attempts tool use or another sequential model step
- **THEN** `toolChoice: none`, `maxSteps: 1`, and the step guard prevent it and the attempt cannot silently exceed the state machine

### Requirement: Consulted specialists and degraded execution are derived without erasing history

The available report's `specialistsConsulted` SHALL contain all and only succeeded consultations represented in the frozen catalog. Identity, consultation ID, round, and execution success SHALL come from the ledger. `keyFindings` SHALL come only from the candidate summary exactly matched to that consultation and SHALL be labeled as model synthesis rather than source-verified text.

Completed outcomes SHALL include execution-quality status `nominal` or `degraded`, stable warning codes, failed/cancelled admitted consultation metadata, material cited-tool limitations, and request-batch non-admission counts/codes. Any failed admitted consultation SHALL make execution quality degraded even if a separate later reconsultation succeeds. Request rejection SHALL remain a request disposition, not a failed consultation.

Waiting UI status SHALL come from explicit projected request/consultation execution fields. Only succeeded consultations can use green. Failed and cancelled consultations SHALL use non-green states, and mixed failure-plus-later-success history SHALL remain visibly degraded. Available degraded reports and all downstream print/share/export projections SHALL preserve the warning.

#### Scenario: Admitted consultation fails
- **WHEN** a consultation reaches `failed` and report generation later completes
- **THEN** it is excluded from the succeeded consulted list, included in degraded metadata, and never shown green

#### Scenario: Non-admitted request is displayed or audited
- **WHEN** a request entry is invalid, duplicate, or otherwise not admitted
- **THEN** it remains a request disposition and is never presented as a failed consultation

#### Scenario: Later reconsultation succeeds
- **WHEN** a new consultation for the same specialist succeeds after an earlier consultation failed
- **THEN** the new success appears separately, the earlier failure remains recorded, and execution quality remains degraded

### Requirement: PromptAssetUsageV1 and ProvenanceV1 expose only linked observable facts

The shared strict schema SHALL define `PromptAssetUsageV1` with required namespaced `promptAssetUsageId`, required `promptId`, required `version`, required `contentHash`, `reviewStatus` (`approved`, `unreviewed`, or `unknown`), required `reviewId`, structured actor, required `attemptId`, optional `consultationId`, optional `toolCallId`, and `executionStatus`. `approved` SHALL require known version/hash and an opaque string review ID; `unreviewed` SHALL require known version/hash and `reviewId: null`; `unknown` SHALL require `reviewId: "unknown"`. `executionStatus` SHALL equal the final status of the linked `Agent.generate` attempt; actor and optional consultation SHALL also match that attempt. Non-tool assets SHALL have one usage per `(attemptId, promptId)`. `toolCallId` SHALL appear only for a `tool.<toolId>.model-output` usage and SHALL form a one-to-one reciprocal link with that tool record's `modelOutputAssetUsageId`; repeated calls SHALL create distinct usages, and thrown, cancelled, or non-delivered calls SHALL retain their usage without claiming delivery. Tool usages SHALL be created from the attempt-start identity/review snapshot when the tool-call ID is minted before executor invocation.

`version` and `contentHash` SHALL come from immutable exact canonical UTF-8 bytes of the versioned prompt manifest entry, without runtime normalization or hashing an instantiated patient-bearing prompt. At attempt start, `reviewStatus` and `reviewId` SHALL be resolved separately from the active applicable append-only review records and retained unchanged as the execution snapshot; they SHALL NOT be copied from or stored as mutable identity in the manifest. `approved` SHALL require known version, hash, and review ID. When manifest identity is known but review lookup is unavailable, version/hash SHALL remain known while review status and review ID are `unknown`. Version/hash SHALL both be `unknown` only when manifest identity is unavailable. Reviewer names and credentials SHALL not be copied into report provenance.

Strict `ProvenanceV1` SHALL contain prompt-schema metadata and a linked generation ledger. Each generation SHALL contain its explicit application-attempt/tool policy, attempts, and request batches. Each attempt SHALL contain its exact `maxSteps`, observed model steps, and `PromptAssetUsageV1` records. Tool records SHALL link into that hierarchy by generation/attempt, reciprocal model-output asset usage, and model step when available. Provenance SHALL NOT use unlinked parallel attempt, step, request-batch, or prompt arrays.

Attempt and model-step metadata SHALL distinguish configured model identity from provider-resolved `response.modelId`, record allowlisted settings actually sent or returned, and use `unknown` for unobserved values. Strict runtime assets SHALL include report schema, prompt schema, app, dependency lock, invoked tools, and accessed datasets with explicit version/hash/revision or `unknown`. Provider request bodies, instantiated prompts, response text, reasoning, headers, credentials, invisible transport retries, and arbitrary provider metadata SHALL not be persisted.

#### Scenario: Known prompt identity has an active approval
- **WHEN** an attempt uses known canonical manifest identity and active-review lookup resolves an applicable approved append-only review record
- **THEN** its `PromptAssetUsageV1` records exact manifest version/hash, invariant review ID, `approved`, actor, attempt, optional consultation, and the attempt's final execution status

#### Scenario: Known prompt identity has unavailable review lookup
- **WHEN** canonical manifest version/hash are known but active-review lookup is unavailable at attempt start
- **THEN** usage preserves the known identity with review status and review ID `unknown` rather than erasing manifest identity

#### Scenario: Prompt manifest is not bootstrapped
- **WHEN** canonical prompt manifest identity is unavailable, regardless of review-lookup availability
- **THEN** version, content hash, and review ID are `unknown`, review status is `unknown`, and no approval is claimed

#### Scenario: Prompt usage status disagrees with attempt
- **WHEN** a prompt usage reports an execution status different from its linked attempt
- **THEN** strict provenance validation fails

#### Scenario: Model setting is not observable
- **WHEN** a setting or invisible provider retry count was neither sent nor returned through application-observed APIs
- **THEN** provenance records `unknown` rather than an inferred value

### Requirement: Only completed outcomes persist provenance and drive downstream export

Only completed `available` and `generation_failed` report outcomes SHALL contain and persist `ProvenanceV1` and execution quality. The progress store SHALL validate and persist the exact strict completed outcome, REST polling SHALL return it directly, WebSocket completion SHALL replay the same object, and the frontend SHALL parse that same schema without a legacy adapter.

When the workflow itself fails, times out, or is cancelled, its in-memory request, consultation, generation, model-step, tool, source-fragment, and prompt-usage records SHALL be discarded after the job is marked failed. No provenance result, failed/cancelled audit ledger, or second durable copy SHALL be written for that workflow. Provenance-related logs SHALL contain only aggregate counts and stable codes, never record IDs, hashes, source references, raw content, or full ledger objects.

Completed provenance SHALL remain only in the job outcome and follow existing terminal `JOB_TTL_MS` scrub-before-delete behavior. One evidence-owned shared formatter SHALL derive privacy-safe patient, consultation, and tool source labels from the validated source reference and provenance; screen and export consumers SHALL import that formatter and SHALL NOT reconstruct labels independently. `export-privacy-and-disclaimer` remains the sole owner of report export layout, truncation, disclaimers, and serialization, and SHALL consume the shared evidence labels rather than being duplicated here. No server-side export copy is retained by this change.

Outcome-v2 backend/frontend parsing, screen consumers, and the `export-privacy-and-disclaimer` frontend integration SHALL deploy together after the coordinated drain. Evidence v2 SHALL NOT be exposed through legacy Print/Share; deployment SHALL remain blocked unless those consumers use the strict v2 outcome and shared label formatter or the affected legacy actions are disabled.

The v2 strict migration SHALL remain coordinated: backend/frontend deploy and roll back together, legacy or v2 persisted completed jobs are cleared or allowed to expire for `JOB_TTL_MS`, and no permissive adapter fabricates missing provenance.

#### Scenario: Completed generation failure is persisted
- **WHEN** report synthesis returns `generation_failed` without failing the workflow
- **THEN** the completed outcome persists strict provenance and execution quality under `JOB_TTL_MS`

#### Scenario: Workflow cancellation is marked failed
- **WHEN** cancellation aborts the workflow
- **THEN** the job has failed status, the in-memory recorder is discarded, and no durable provenance or cancelled audit ledger is created

#### Scenario: REST and WebSocket return completion
- **WHEN** a completed job is read through REST and WebSocket replay
- **THEN** both transports provide the exact same strict completed outcome

#### Scenario: Degraded report is printed or shared
- **WHEN** a user prints, shares, or exports a validated degraded report
- **THEN** the downstream output preserves privacy-safe source labels, the degraded warning, and the traceability-not-truth notice

#### Scenario: Legacy persisted outcome is encountered
- **WHEN** the new strict parser encounters a legacy completed outcome without required v2 fields
- **THEN** it rejects the outcome rather than fabricating or adapting provenance
