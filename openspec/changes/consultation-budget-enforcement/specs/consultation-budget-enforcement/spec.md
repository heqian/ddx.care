## Purpose

Provides execution-ledger-backed admission, observable model-step, report-time, settlement, evidence, and source-aligned JSON context budgets for bounded diagnostic orchestration.

## ADDED Requirements

### Requirement: Request batches and consultation records have non-overlapping ownership

For every CMO specialist-selection result, the workflow SHALL create a `RequestBatch` that owns every model-requested entry in original order. Each entry SHALL have a unique namespaced `requestEntryId`; positions SHALL be the original zero-based array positions and SHALL be unique and contiguous within the batch. Each entry SHALL end with exactly one disposition: `admitted`, `invalid`, `duplicate`, or `budget_rejected`, with stable `reasonCode`, timestamps/actors, and an admitted `consultationId` only when applicable. Invalid model text SHALL NOT be copied into PHI-free execution telemetry; an `invalid` entry SHALL retain a privacy-safe digest of its bounded canonical raw value, position, and reason code without retaining the raw identifier.

A `ConsultationRecord` SHALL be created only when a batch entry is synchronously admitted. Its lifecycle states SHALL be `admitted`, `started`, and one terminal state `succeeded`, `failed`, or `cancelled`; it SHALL NOT have a `requested` state. Starting asynchronous specialist work transitions `admitted -> started`. Normal settlement transitions `started -> terminal`, while cancellation before work starts may transition `admitted -> cancelled`. Invalid, duplicate, and budget-rejected entries SHALL never create failed or synthetic consultation records.

#### Scenario: Invalid and duplicate requests remain batch-owned
- **WHEN** a CMO batch contains one invalid ID and a later duplicate of a valid ID
- **THEN** both entries remain represented in the `RequestBatch` with `invalid` and `duplicate` dispositions and neither creates a consultation

#### Scenario: Admission creates the consultation
- **WHEN** a validated unique request is within available capacity
- **THEN** the application atomically marks the entry `admitted`, creates exactly one `ConsultationRecord` beginning in `admitted`, and consumes one consultation slot before asynchronous scheduling

#### Scenario: Capacity rejection creates no consultation
- **WHEN** a validated unique request falls outside the admitted ordered prefix
- **THEN** its batch entry is `budget_rejected`, no `ConsultationRecord` exists for it, and it is not later represented as a failed consultation

### Requirement: Consultation admission is deterministic, priority-preserving, and non-refundable

`MAX_SPECIALISTS_PER_ROUND` (default `5`) SHALL cap admissions in one round and `MAX_TOTAL_SPECIALISTS` (default `12`) SHALL cap consultation admissions across the workflow. After ID validation and within-round deduplication, the application SHALL preserve the CMO array order as declared clinical priority and synchronously admit the longest ordered prefix that fits both remaining capacities. The CMO SHALL receive remaining round admissions, total admissions, non-report model steps, consultation time, succeeded-evidence count, and the instruction to place urgent, time-sensitive, and high-information-value requests first.

An admitted consultation consumes its round and total unit permanently, including when it fails, is cancelled, returns empty output, or is later repeated. Deduplication applies only within one batch. A failed, cancelled, or succeeded specialist remains eligible for a clinically justified later-round reconsultation; that request receives a new batch entry and, if admitted, a new consultation and a new charge.

#### Scenario: Total capacity is tighter than round capacity
- **WHEN** five round slots remain but only two total consultation slots remain for requests `[A, B, C]`
- **THEN** `A` and `B` are admitted in that order and `C` is batch-owned as `budget_rejected`

#### Scenario: Admitted failure does not reopen capacity
- **WHEN** an admitted consultation fails after starting
- **THEN** its admission remains counted and a later reconsultation requires another available admission unit

#### Scenario: Successful specialist is reconsulted later
- **WHEN** a specialist succeeds in round 1 and is explicitly requested for a new question in round 2
- **THEN** the round-2 request remains eligible and creates a distinct charged consultation when capacity is available

### Requirement: Application-observed Mastra model steps are globally capped

The evidence execution recorder SHALL own one generation whose purpose is exactly `cmo_decision`, `specialist_consultation`, or `final_report`; one `AttemptRecord` for each application call to `Agent.generate` with phase exactly `initial`, `retry`, or `correction`; and one `ModelStepRecord` for each sequential LLM step observed through Mastra's `prepareStep`. Every model step SHALL have Mastra's zero-based position and budget class exactly `non_report`, `report_initial`, or `report_correction`, consistent with its generation/attempt. `MAX_TOTAL_MODEL_STEPS` (default `24`) SHALL cap those records across the workflow.

Every `Agent.generate` call SHALL receive an explicit positive `maxSteps` no greater than its purpose-specific cap and currently available step class. Immediately before each application-observed sequential LLM step, `prepareStep` SHALL synchronously and atomically check the parent/phase signal, acquire the appropriate workflow-global model-step unit, and create its `ModelStepRecord` before allowing the step. Concurrent operations SHALL share the same no-`await` acquisition section. When no eligible unit remains, the step SHALL not start. Failure, cancellation, empty output, tool use, or an application-level retry SHALL not refund a recorded model step.

The budget SHALL describe only application-observed Mastra sequential LLM steps. Provider SDK retries, transport retries, failover, or other internal provider activity that does not invoke `prepareStep` SHALL NOT be claimed as separately counted or prevented by `MAX_TOTAL_MODEL_STEPS`; provenance and operator documentation SHALL disclose this observability boundary.

#### Scenario: One Agent.generate performs several sequential steps
- **WHEN** a tool-capable specialist operation executes three Mastra steps within one `Agent.generate`
- **THEN** one `AttemptRecord` links to three distinct `ModelStepRecord` entries and three global model-step units are consumed

#### Scenario: Concurrent prepareStep callbacks reach the limit
- **WHEN** concurrent agent operations request the final available non-report model step
- **THEN** atomic acquisition permits exactly one callback and every other callback fails before starting another sequential LLM step

#### Scenario: Provider retries invisibly
- **WHEN** a provider SDK or transport layer internally retries without another application-observed `prepareStep`
- **THEN** the workflow records no invented additional model step and does not claim that the internal retry was capped

### Requirement: Report generation retains one correction inside a two-step reserve

Exactly two units from `MAX_TOTAL_MODEL_STEPS` SHALL be reserved from workflow start for budget classes `report_initial` and `report_correction`; CMO decisions, consultations, and retries SHALL NOT consume them. Report generation SHALL also receive the full `REPORT_GENERATION_RESERVE_MS` (default `120000`) after consultation settlement. The initial and correction windows SHALL each be bounded, and internal `INITIAL_REPORT_SETTLEMENT_GRACE_MS=5000` included in the initial window SHALL ensure the initial operation cannot consume correction's minimum time allocation. This internal constant is not an environment setting.

The CMO round-decision contract SHALL contain no inline `finalReport`; `isFinal` SHALL only stop consultation. After consultation settlement and final context packing, the execution-owned minimum-evidence gate SHALL require at least `MIN_SUCCESSFUL_CONSULTATIONS` (default `1`) succeeded records and one retained bounded final-context representation for every succeeded consultation. If either condition fails, the workflow SHALL use neither reserved report step and SHALL return `generation_failed` with `REPORT_INSUFFICIENT_EVIDENCE`. Otherwise it SHALL freeze the eligible catalog and run `report_initial` with `maxSteps: 1`, no active tools, and tool choice `none`. The initial candidate SHALL pass the evidence ledger's complete schema, consultation-summary, and source-reference validator. Any defect, including an unknown, failed, cancelled, missing, duplicate, or unmatched consultation/source claim, SHALL invalidate the whole candidate and consume the one correction path. The application SHALL NOT delete, rewrite, exclude, or sanitize an unmatched claim into an available report.

When correction is required, the `final_report` generation's `correction` attempt SHALL use the second reserved step with budget class `report_correction`, zero-based position 0, `maxSteps: 1`, no active tools, tool choice `none`, the frozen eligible catalog, and bounded validation issues. Before it starts, an unresolved initial attempt SHALL be aborted at its child deadline, waited only through the internal grace, terminalized/sealed, detached with settlement handlers, and prevented from making any late record/budget/progress/log/catalog/report mutation. A valid correction may become available. An empty or invalid correction SHALL return `REPORT_VALIDATION_FAILED` with no candidate medical content. If the initial candidate is valid, the correction step remains unused and SHALL NOT be reassigned to consultation work.

#### Scenario: Minimum evidence is not met
- **WHEN** settled succeeded consultations are below `MIN_SUCCESSFUL_CONSULTATIONS` or packing cannot retain a bounded representation for every success
- **THEN** neither report operation starts and the strict outcome is `REPORT_INSUFFICIENT_EVIDENCE` without clinical report content

#### Scenario: Initial report is valid
- **WHEN** `report_initial` uses one step and its candidate passes all evidence validation
- **THEN** the candidate may become available and the reserved correction step remains unused rather than being refunded

#### Scenario: Initial report contains an unmatched claim
- **WHEN** `report_initial` contains a consultation summary or source reference that does not match the frozen eligible catalog
- **THEN** the entire initial candidate is rejected and one correction is attempted; no unmatched claim is excluded or sanitized

#### Scenario: Correction remains invalid
- **WHEN** `report_correction` is empty, malformed, or still has an unmatched claim
- **THEN** the outcome is `generation_failed` with `REPORT_VALIDATION_FAILED` and exposes no candidate report content

### Requirement: Consultation settlement has a bounded grace period before report reserve

The consultation-admission cutoff SHALL occur at `diagnosisDeadline - REPORT_GENERATION_RESERVE_MS - CONSULTATION_SETTLEMENT_GRACE_MS`. At that cutoff the workflow SHALL stop requesting, admitting, scheduling, and retrying consultation work; abort the child consultation signal; and wait no longer than `CONSULTATION_SETTLEMENT_GRACE_MS` (default `5000`) for child promises and hooks to settle. Parent cancellation or timeout during this period SHALL continue to propagate as a failed workflow and SHALL prevent report generation.

When the grace period ends, the application SHALL terminalize every unresolved admitted/started consultation, attempt, model step, and child tool record as cancelled with stable cutoff/grace codes; attach rejection handlers to still-running promises; freeze the eligible evidence catalog; and seal consultation-owned recorder scopes against further mutation. The recorder SHALL remain open only for the reserved report attempt/step records and SHALL be fully sealed after the report outcome is recorded. Late specialist, tool, step, progress, or logging hooks from sealed child scopes SHALL be ignored safely without throwing, changing records, consuming model-step units, publishing progress, or altering the report catalog.

#### Scenario: Child work settles within grace
- **WHEN** an in-flight consultation responds to the child abort and settles before the grace deadline
- **THEN** its terminal execution state is recorded before the catalog is frozen and report reserve begins

#### Scenario: Child work outlives grace
- **WHEN** an aborted consultation promise or hook has not settled at the grace deadline
- **THEN** the workflow stops waiting, terminalizes and seals its child records, safely detaches the promise, and begins the report phase without accepting later mutation

#### Scenario: Late hook arrives after sealing
- **WHEN** an old specialist or tool hook runs after its consultation-owned recorder scope is sealed
- **THEN** the hook is a safe no-op for ledger, budgets, evidence, progress, and logs and cannot disturb report generation

### Requirement: CMO context uses retained source-mapped fragments and exact generic JSON envelopes

CMO and specialist dynamic context SHALL use only the exact generic untrusted JSON-envelope serializer defined by `patient-data-delimiter-escaping`: envelope-level `sourceRecordId` and typed owner plus fragment-level exact `sourceFragmentId`, UTF-16 offsets/unit, and encoded text. This context packer SHALL NOT introduce an alternate JSON shape, XML, or XML-like tags. It SHALL keep patient fields and individual consultation responses typed and raw until packing. Evidence citations SHALL use the exact fragment ID, never the record ID.

The packer SHALL first select source-mapped raw fragments and only then encode complete generic JSON envelopes. Patient fragments SHALL retain field identity and exact offsets into the bounded input. The report's patient evidence catalog SHALL be built only from the retained fragments that are actually model-visible in the frozen report context; omitted patient text SHALL have no eligible source reference. Lab preservation SHALL select complete mapped head and tail line fragments, including deterministic bounded chunks for overlong lines, so both identifying and latest lab facts can remain visible. Other patient fields SHALL use deterministic mapped fragments according to their protected quotas. A tool source SHALL be retained only as the exact complete canonical safe envelope previously delivered by `toModelOutput`, without re-encoding or reserialization. Its fragments SHALL be eligible only when the tool record has `executionStatus: succeeded`, `transformStatus: succeeded`, `deliveryStatus: delivered`, and a non-null `safeModelOutputDigest` equal to the retained source record's complete-envelope hash; fail-safe fallback output remains ineligible.

Every succeeded consultation SHALL have a model-visible generic JSON envelope in the CMO report context. Consultation payload selection SHALL be prefix-only on a Unicode code-point boundary and SHALL include bounded truncation metadata when shortened; it SHALL not replace the prefix with a tail-only or newest-only sample. The packer MAY allocate additional payload by priority after reserving the minimum representation for every succeeded consultation, but SHALL never omit an entire succeeded consultation from report context.

The implementation SHALL compute `MIN_CMO_CONTEXT_MAX_CHARS` dynamically from the exact serializer's fixed context/catalog/notice overhead, protected patient-fragment envelopes, worst-case encoded minimum consultation preview, and configured `MAX_TOTAL_SPECIALISTS`. Startup SHALL require `CMO_CONTEXT_MAX_CHARS >= MIN_CMO_CONTEXT_MAX_CHARS` and SHALL report the computed required value. No fixed value such as 1024 SHALL define the minimum. Final encoded context SHALL never exceed `CMO_CONTEXT_MAX_CHARS`, and no encoded string, JSON token, envelope, source mapping, or notice SHALL be sliced after serialization.

#### Scenario: Patient text is omitted by the packer
- **WHEN** a patient line fragment is not selected before encoding
- **THEN** it is absent from model-visible context and absent from the eligible patient evidence catalog

#### Scenario: Labs exceed their protected allocation
- **WHEN** lab results contain more mapped complete line fragments than fit
- **THEN** deterministic complete head and tail fragments remain visible with exact source offsets and lower-priority middle fragments are omitted before encoding

#### Scenario: All configured consultations succeed
- **WHEN** the number of succeeded consultations equals `MAX_TOTAL_SPECIALISTS`
- **THEN** each consultation has at least its bounded prefix-only JSON representation in report context and the final context remains within `CMO_CONTEXT_MAX_CHARS`

#### Scenario: Configured context is below the dynamic minimum
- **WHEN** `CMO_CONTEXT_MAX_CHARS` is less than the minimum computed for current fixed overhead and `MAX_TOTAL_SPECIALISTS`
- **THEN** startup fails with both configured and required values before any diagnosis begins

### Requirement: Budget configuration is strict, coherent, and passed through canonically

The numeric settings `MAX_SPECIALISTS_PER_ROUND`, `MAX_TOTAL_SPECIALISTS`, `MAX_TOTAL_MODEL_STEPS`, `MIN_SUCCESSFUL_CONSULTATIONS`, `REPORT_GENERATION_RESERVE_MS`, `CONSULTATION_SETTLEMENT_GRACE_MS`, `MAX_DIAGNOSIS_ROUNDS`, `MAX_SPECIALIST_CONCURRENCY`, `AGENT_GENERATE_MAX_RETRIES`, `DIAGNOSIS_TIMEOUT_MS`, `SPECIALIST_CONTEXT_MAX_CHARS`, and `CMO_CONTEXT_MAX_CHARS` SHALL be parsed as strict positive safe integers. Signs, whitespace, decimals, exponents, suffixes, zero, negatives, empty provided values, and unsafe integers SHALL fail startup rather than being partially parsed.

Validation SHALL require `MAX_SPECIALISTS_PER_ROUND <= MAX_TOTAL_SPECIALISTS`, `MAX_TOTAL_SPECIALISTS <= MAX_DIAGNOSIS_ROUNDS * MAX_SPECIALISTS_PER_ROUND`, `MIN_SUCCESSFUL_CONSULTATIONS <= MAX_TOTAL_SPECIALISTS`, and `MIN_SUCCESSFUL_CONSULTATIONS <= MAX_DIAGNOSIS_ROUNDS * MAX_SPECIALISTS_PER_ROUND`. It SHALL compute `minimumDecisionSteps = ceil(MIN_SUCCESSFUL_CONSULTATIONS / MAX_SPECIALISTS_PER_ROUND)` and require `MAX_TOTAL_MODEL_STEPS >= minimumDecisionSteps + MIN_SUCCESSFUL_CONSULTATIONS + 2` for the minimum required CMO decisions, one specialist step per minimum success, and two reserved report steps. It SHALL also require `REPORT_GENERATION_RESERVE_MS >= 2 * MIN_REPORT_STEP_WINDOW_MS + INITIAL_REPORT_SETTLEMENT_GRACE_MS`, `CONSULTATION_SETTLEMENT_GRACE_MS + REPORT_GENERATION_RESERVE_MS < DIAGNOSIS_TIMEOUT_MS`, and `CMO_CONTEXT_MAX_CHARS` to meet the dynamic minimum.

Production Docker/Compose SHALL pass exactly the canonical names `MAX_SPECIALISTS_PER_ROUND`, `MAX_TOTAL_SPECIALISTS`, `MAX_TOTAL_MODEL_STEPS`, `MIN_SUCCESSFUL_CONSULTATIONS`, `REPORT_GENERATION_RESERVE_MS`, `CONSULTATION_SETTLEMENT_GRACE_MS`, `CMO_CONTEXT_MAX_CHARS`, and `SPECIALIST_CONTEXT_MAX_CHARS`, without aliases for removed `MAX_TOTAL_PROVIDER_ATTEMPTS` or `SYNTHESIS_TIME_RESERVE_MS`.

#### Scenario: Round and evidence settings are impossible
- **WHEN** minimum successes or total consultations exceed the admission capacity reachable across configured rounds
- **THEN** startup fails with a relationship-specific error

#### Scenario: Two report steps cannot be reserved
- **WHEN** `MAX_TOTAL_MODEL_STEPS` cannot cover the minimum evidence path plus both report steps
- **THEN** startup fails rather than allowing consultation work to consume report capacity

#### Scenario: Docker receives canonical overrides
- **WHEN** an operator sets canonical budget values and starts the production Compose service
- **THEN** the service receives those exact environment names and no removed alias silently changes behavior

### Requirement: Structured observability and mock behavior use the same ownership and limits

Budget events and logs SHALL be PHI-free projections of `RequestBatch`, consultation, attempt, and model-step records. They SHALL expose cumulative numeric requested, invalid, duplicate, budget-rejected, admitted, started, model-step, and succeeded counts; remaining round admissions, total admissions, non-report model steps, and reserved report steps; round; phase; and bounded reason. They SHALL NOT include patient fragments, source text, context directives, prompts, consultation responses, tool arguments, diagnoses, raw invalid IDs, or free-text errors. Events SHALL be committed after recorder mutation, and no event SHALL persist or publish after job terminal state or child-scope sealing.

Mock mode SHALL use the same request-batch admission, consultation lifecycle, `AttemptRecord`, synthetic `ModelStepRecord`, report reserve/correction, settlement, context/catalog, evidence validation, outcome-v2, and event code paths. It SHALL obey low step/admission/context limits and produce `REPORT_INSUFFICIENT_EVIDENCE` when the minimum evidence path cannot be reached.

#### Scenario: Invalid model request is observed
- **WHEN** a CMO request contains invalid model output that could include patient-derived text
- **THEN** telemetry increments a bounded invalid count/reason without retaining the raw invalid value

#### Scenario: Mock initial report needs correction
- **WHEN** the mock initial candidate has an unmatched consultation claim
- **THEN** it consumes the synthetic `report_initial` step, runs one synthetic `report_correction` step, and never sanitizes the initial candidate

### Requirement: REPORT_INSUFFICIENT_EVIDENCE participates in the strict outcome-v2 migration

`REPORT_INSUFFICIENT_EVIDENCE` SHALL be added to the same strict report outcome v2 delivered by `evidence-provenance-ledger`, not released as an intermediate or compatibility shape. Backend formatting, completed-job persistence, REST polling, WebSocket live completion/replay, frontend runtime parsing/unavailable presentation, mocks, and E2E flows SHALL agree that this completed `generation_failed` variant contains execution quality and sealed provenance but no candidate medical report content. Screen and export source labels SHALL use the evidence-owned shared formatter; `export-privacy-and-disclaimer` remains the owner of export layout/serialization.

Legacy persisted outcomes lacking strict v2 fields SHALL be drained, expired, or cleared according to the coordinated v2 migration and SHALL be rejected rather than adapted. Backend, frontend strict-v2 screens, and the `export-privacy-and-disclaimer` frontend integration SHALL deploy and roll back together; legacy Print/Share SHALL be migrated or disabled. REST and WebSocket SHALL return the exact same persisted v2 object.

#### Scenario: Insufficient evidence completes over both transports
- **WHEN** a job completes with `REPORT_INSUFFICIENT_EVIDENCE`
- **THEN** REST and WebSocket provide the same strict v2 outcome and the frontend renders only unavailable-report and safety/retry guidance

#### Scenario: Legacy persisted job remains during rollout
- **WHEN** the v2 parser encounters a pre-v2 persisted outcome
- **THEN** it rejects the outcome instead of fabricating execution records, evidence, or the new error code
