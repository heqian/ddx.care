## Context

The current workflow accepts a CMO request and schedules every valid unique ID, updates consultation state inside asynchronous workers, lets `Agent.generate` choose its sequential step count implicitly, and reaches report generation through several branches. `MAX_SPECIALIST_CONCURRENCY` limits simultaneous workers but not total admitted consultations or application-observed Mastra LLM steps. The current mock path bypasses most orchestration state.

Mastra 1.50.1 defines `maxSteps` as the maximum number of sequential LLM calls in one generation operation and invokes `prepareStep` before each step. That is the enforceable application boundary. Provider SDK or transport retries beneath one observed step are not exposed through this hook and cannot honestly be counted as additional model steps.

This change coordinates one implementation slice with the strict v2 execution envelope from `evidence-provenance-ledger` and the exact untrusted encoder/generic JSON-envelope serializer from `patient-data-delimiter-escaping`. Shared schemas and serializer primitives can land first, but none of the three complete behavioral changes is treated as a prerequisite for another: the recorder, packer, admission controller, minimum-evidence gate, and report state machine are integrated and verified together before the strict v2 release. It refines their shared ownership decisions: request disposition is not consultation execution, an `Agent.generate` operation is not the same unit as one sequential model step, and the report validator retains its initial candidate plus one correction. See `proposal.md` and the delta specs for normative behavior.

## Goals / Non-Goals

**Goals:**
- Give every model-requested entry an authoritative disposition without fabricating consultations for work that was never admitted.
- Enforce per-round/total admissions before concurrency and a workflow-total budget at every application-observed Mastra model step.
- Preserve exactly two model-step and time allocations for the evidence ledger's initial report and one correction.
- Bound the consultation-to-report handoff even when child promises or hooks ignore abort.
- Build source references from exactly the patient fragments retained in model-visible generic JSON envelopes.
- Guarantee every succeeded consultation remains represented in report context.
- Ship `REPORT_INSUFFICIENT_EVIDENCE` only inside the coordinated strict outcome-v2 migration.

**Non-Goals:**
- Counting or preventing provider SDK, HTTP transport, gateway, or failover retries that occur below an application-observed `prepareStep` callback.
- Treating `AttemptRecord`, `ModelStepRecord`, or consultation counts as provider billing metrics.
- Token-based context accounting; final encoded character length remains the local deterministic bound.
- Proving that a retained patient fragment or consultation entails a report claim; the evidence ledger validates traceability, not clinical truth.
- Adding a compatibility adapter for pre-v2 persisted outcomes.

## Decisions

### D1: RequestBatch owns model requests; ConsultationRecord starts at admission

**Decision:** Extend the shared execution recorder with a namespaced `RequestBatch` for each CMO selection result. It records every model-returned array entry in original order and one final disposition:

```ts
type RequestDisposition =
  | "admitted"
  | "invalid"
  | "duplicate"
  | "budget_rejected";

type RequestBatchEntry = {
  requestEntryId: RequestEntryId;
  position: number; // zero-based, unique, and contiguous within the batch
  specialistId?: SpecialistId; // present only after canonical validation
  invalidValueDigest?: `sha256:${string}`; // invalid only
  requestedAt: string;
  requestedBy: LedgerActor;
  disposition: RequestDisposition;
  reasonCode: string;
  dispositionAt: string;
  dispositionActor: LedgerActor;
  consultationId?: ConsultationId; // admitted only
};
```

Every entry receives a unique namespaced `requestEntryId`; `position` is the original zero-based array position and is unique and contiguous within its batch. Invalid entries do not persist raw unvalidated IDs because model output can be patient-influenced. They require `invalidValueDigest`, computed over a bounded canonical representation, plus position/disposition/stable reason code. Duplicate detection uses the first valid occurrence's position internally. Budget-rejected entries retain the validated ID and rejection reason.

Create a `ConsultationRecord` only while atomically admitting an entry. Its state set is `admitted`, `started`, `succeeded`, `failed`, or `cancelled`; there is no consultation `requested` state. The scheduler transitions `admitted -> started` immediately before beginning specialist execution. A started consultation reaches one terminal state. An admitted item cancelled before worker start can transition directly to `cancelled`. Invalid, duplicate, and budget-rejected requests never appear as failed consultations or degraded execution.

**Rationale:** Model intent and application execution are different facts. `RequestBatch` can explain all model output, while the consultation ledger remains an honest account of admitted work.

**Alternative considered:** Create requested consultations for every array item. This makes invalid and capacity-rejected model text look like unavailable clinical execution and pollutes degraded-execution metadata.

### D2: Validate, deduplicate, and synchronously admit one ordered prefix

**Decision:** Keep CMO selection cardinality permissive and do not put `.max()` on `specialistsToConsult`. The CMO prompt still receives the complete live specialist ID list. The structured request schema uses a non-empty bounded string for each `id`, not a generated enum, so a structurally valid unknown ID reaches the application-owned `RequestBatch`. Capture candidate entries into a batch, validate each ID against the same live registry, retain the first valid occurrence of each ID, and preserve relative order. The CMO prompt declares that array order is clinical priority and requires urgent, time-sensitive, and high-information-value specialists first.

For a round, compute:

```text
roundSlots = MAX_SPECIALISTS_PER_ROUND
totalSlots = MAX_TOTAL_SPECIALISTS - admittedConsultationCount
admitCount = min(validUniqueRequestCount, roundSlots, totalSlots)
```

In one synchronous no-`await` loop, mark the ordered prefix admitted, create its consultations, and consume capacity. Mark every remaining valid unique entry `budget_rejected`. Only then pass admitted records to the scheduler. Failed, empty, cancelled, and repeated consultations never refund admission.

Remove the global already-succeeded filter. A new later-round request for the same specialist creates a new batch entry and, if capacity permits, a new consultation. A retry within one consultation keeps the same consultation ID but creates a new attempt.

The CMO receives remaining round/total admissions, non-report model steps, time until consultation cutoff, and succeeded consultation count before each selection operation. `isFinal` is only a request to stop consultation; the decision schema contains no inline report.

**Rationale:** Ordered application admission is deterministic, preserves clinical priority, and does not spend model work repairing an oversized but otherwise useful array.

**Alternative considered:** Schema rejection for an oversized array. It makes the entire decision unavailable and conflates output validity with resource policy.

### D3: Evidence recorder distinguishes Agent.generate attempts from observed model steps

**Decision:** The evidence ledger owns one `GenerationRecord` whose purpose is exactly `cmo_decision`, `specialist_consultation`, or `final_report`; one `AttemptRecord` for each application invocation of `Agent.generate` with phase exactly `initial`, `retry`, or `correction`; and one `ModelStepRecord` for each Mastra sequential LLM step observed through `prepareStep` within that attempt.

An attempt records actor, optional consultation, phase, retry ordinal, status, the exact finite `maxSteps` passed to that call, model/settings metadata, and linked step IDs. A model-step record carries its own namespaced ID, attempt foreign key, Mastra's zero-based step position, budget class (`non_report`, `report_initial`, or `report_correction`), lifecycle, and stable failure/limitation codes. Budget class must agree with generation purpose and attempt phase.

One tool-capable `Agent.generate` can therefore own several model steps, while a failed application retry creates another attempt with its own observed steps. Tool records continue to link to the owning attempt and consultation as defined by the evidence change.

**Rationale:** `Agent.generate` is the application operation and audit boundary, while `maxSteps` and `prepareStep` expose actual sequential loop iterations. Combining them would either undercount tool loops or misrepresent application retries.

**Alternative considered:** Treat every generate call as one step. A tool-capable call can perform multiple sequential LLM calls, so that cap is not enforceable or truthful.

### D4: MAX_TOTAL_MODEL_STEPS is enforced twice at the Mastra boundary

**Decision:** Replace the removed `MAX_TOTAL_PROVIDER_ATTEMPTS` concept with `MAX_TOTAL_MODEL_STEPS=24`. Reserve two units at run creation for report purposes, leaving `MAX_TOTAL_MODEL_STEPS - 2` for CMO decisions, specialists, and their application retries.

Every non-report `Agent.generate` receives:

```text
maxSteps = min(NON_REPORT_MAX_STEPS_PER_CALL, nonReportStepsRemainingSnapshot)
```

`NON_REPORT_MAX_STEPS_PER_CALL` is a small internal safety cap (default design value `5`), not an environment alias. If the snapshot is zero, the application does not call `Agent.generate`. Snapshot `maxSteps` prevents one operation from intentionally exceeding available capacity, but concurrent calls can race after it is computed, so it is not the authoritative global guard.

Every call also receives a `prepareStep` callback. Before each observed step, the callback performs a synchronous, no-`await` acquisition:

1. Reject parent cancellation/timeout.
2. Reject a sealed consultation scope or expired consultation phase.
3. Select the allowed budget class from generation purpose plus attempt phase.
4. Check the shared remaining counter, preserving both report reservations from non-report work.
5. Append a started `ModelStepRecord` and decrement the class atomically.
6. Return step options only after acquisition succeeds.

`onStepFinish` and attempt settlement update the acquired record. A failed, cancelled, empty, or tool-using step is not refunded. Application-level `withRetry` wraps whole attempts; each new `Agent.generate` installs the same controller and receives a new `AttemptRecord`.

Provider SDK/transport retries below one `prepareStep` are explicitly outside this counter. Do not infer them from latency, errors, token usage, or provider metadata. Record an observability limitation in documentation/provenance rather than claiming a stronger cap.

**Rationale:** Per-call `maxSteps` limits local loop shape, while atomic `prepareStep` acquisition closes concurrency races across calls. Both are necessary.

**Alternative considered:** Decrement once before `Agent.generate`. This cannot see sequential tool-loop steps and lets one operation exceed the intended global budget.

### D5: Reserve two report steps and two bounded report time windows

**Decision:** `REPORT_GENERATION_RESERVE_MS=120000` is reserved after consultation settlement. Define internal constants `MIN_REPORT_STEP_WINDOW_MS=30000` and `INITIAL_REPORT_SETTLEMENT_GRACE_MS=5000`, with the grace included inside the initial window and no new environment setting. Startup requires at least two minimum windows plus the internal initial grace. At report start, partition the reserve so the initial attempt's child deadline and grace end before the correction's minimum window. If the initial attempt finishes earlier, validation can start correction immediately, but neither unused time nor an unused correction step returns to consultation work.

The minimum-evidence gate requires both at least `MIN_SUCCESSFUL_CONSULTATIONS=1` settled succeeded consultations and one retained bounded final-context representation for every succeeded consultation. If either condition fails, create `REPORT_INSUFFICIENT_EVIDENCE` without consuming either report step. Otherwise:

- the `final_report` generation's `initial` attempt uses budget class `report_initial`, zero-based position 0, `maxSteps: 1`, `tools: {}`/no active tools, and `toolChoice: "none"`;
- when the shared validator rejects the initial candidate, its `correction` attempt uses budget class `report_correction`, zero-based position 0, and the same one-step/no-tools constraints;
- correction receives bounded issue codes and the frozen eligible catalog, not mutable child context or raw provider errors.

At the initial child deadline, abort the initial attempt and wait no longer than `INITIAL_REPORT_SETTLEMENT_GRACE_MS`. If unresolved, terminalize and seal its attempt/model-step scope, attach detached rejection/settlement handlers, and make every late model/step/progress/log callback a safe no-op before correction starts. The report correction is the one correction already defined by `evidence-provenance-ledger`; this change does not remove it or add another fallback. An initially valid candidate leaves the correction reservation unused.

**Rationale:** Two separately reserved model steps and time windows preserve the existing safe structured repair without allowing consultation work or a hung initial attempt to consume it.

**Alternative considered:** One report call with no correction. That contradicts the evidence validation contract and increases unavailable reports for correctable source defects.

### D6: Unmatched report claims invalidate candidates without mutation

**Decision:** The decision-time `finalReport` remains removed, so all report candidates enter the centralized report validator. Freeze the eligible patient-fragment, succeeded-consultation, and succeeded-tool catalog before `report_initial`.

Apply the evidence change's strict checks to the entire candidate. Unknown, failed, cancelled, duplicate, missing, or unmatched consultation summaries or source references invalidate the candidate. The application never drops a bad summary, rewrites an ID, filters an evidence item, replaces a source, or publishes a sanitized subset. Initial invalidity triggers exactly one correction. Correction invalidity produces `REPORT_VALIDATION_FAILED` with no candidate medical content.

`REPORT_INSUFFICIENT_EVIDENCE` is evaluated before candidate generation and means the execution-owned minimum-evidence policy was not met, either because too few consultations succeeded or because final context packing could not retain a bounded representation for every success. It is distinct from report candidate validation failure.

**Rationale:** Excluding unmatched text can make the remainder appear validated even though the model constructed it from a false execution premise. Whole-candidate rejection preserves the evidence boundary.

**Alternative considered:** Remove unmatched claims after generation. This silently edits model reasoning and can leave diagnoses whose support no longer matches the visible report.

### D7: Consultation settlement grace bounds uncooperative child work

**Decision:** Compute monotonic phase boundaries:

```text
diagnosisDeadline = start + DIAGNOSIS_TIMEOUT_MS
reportStartDeadline = diagnosisDeadline - REPORT_GENERATION_RESERVE_MS
consultationCutoff = reportStartDeadline - CONSULTATION_SETTLEMENT_GRACE_MS
```

At `consultationCutoff`, stop CMO selection, admission, scheduling, and consultation retries; abort a child consultation controller; and begin a bounded grace wait. The parent controller remains reserved for user cancellation and diagnosis timeout. `limitConcurrency` checks both signals before each item, after capacity waits, before worker start, and `prepareStep` checks them before every model step.

Wait at most `CONSULTATION_SETTLEMENT_GRACE_MS=5000`. Work that settles in time records its real terminal state. At grace expiry:

1. Transition every unresolved admitted/started consultation, attempt, model step, and child tool record to `cancelled` with stable cutoff/grace codes.
2. Attach terminal rejection/settlement handlers to still-running promises so they cannot become unhandled.
3. Freeze patient/consultation/tool eligibility for reporting.
4. Seal all consultation-owned recorder scopes against mutation.
5. Stop waiting and begin the report reserve.

The global recorder remains open only for the `final_report` generation's `initial` and optional `correction` attempt scopes, then seals completely with the execution envelope. Hooks carry scope identity. A hook from a sealed child scope returns a safe ignored result: no throw, record change, step acquisition, progress, or log. JobStore progress insertion also remains conditional on pending status as defense in depth.

Parent cancellation or timeout at any point still terminalizes active records and propagates as a failed workflow; it never becomes `generation_failed`.

**Rationale:** Awaiting all child promises indefinitely defeats a time reserve when a provider ignores abort. Phase sealing makes detachment safe and deterministic.

**Alternative considered:** Abort and continue waiting for `Promise.allSettled`. An uncooperative promise can consume the full report reserve.

### D8: Context uses the exact generic JSON envelope, never XML-like wrappers

**Decision:** Keep context as typed source records until packing. Consume the exact generic serializer from `patient-data-delimiter-escaping` without a conceptual alternate shape:

```text
{
  "envelopeVersion":"1",
  "trust":"untrusted",
  "sourceRecordId":"source-record:<opaque-id>",
  "owner":<typed trusted patient|consultation|tool|cmo_directive|failure owner>,
  "fragments":[{
    "sourceFragmentId":"source-fragment:<opaque-id>",
    "startOffset":<trusted UTF-16 offset or null>,
    "endOffset":<trusted UTF-16 offset or null>,
    "offsetUnit":"utf16-code-unit|not_applicable",
    "text":<complete exact encoded JSON string literal>
  }]
}
```

The shared serializer owns JSON punctuation, metadata validation, `sourceRecordId`, typed owner, exact fragment IDs, and `encodeUntrustedText`. This change does not hand-build a variant, interpolate raw strings, add XML/XML-like tags, double-encode payloads, or slice serialized output. Evidence citations use `sourceFragmentId`, never `sourceRecordId`.

Represent patient input as `SourceMappedFragment` values selected from bounded fields before encoding:

```ts
type SourceMappedFragment = {
  field: "medicalHistory" | "conversationTranscript" | "labResults";
  startOffset: number;
  endOffset: number;
  raw: string;
};
```

Offsets use the evidence change's UTF-16 code-unit contract. Generate non-empty complete line fragments, splitting overlong lines into deterministic bounded, surrogate-safe mapped chunks. Select fragments first, serialize them second, then build patient `SourceFragmentV1` records only for selected model-visible fragments by hashing the exact retained `raw` slices. No omitted patient text is eligible for citation.

For labs, reserve complete mapped fragments from both the head and tail, deduplicating overlap and preserving source order in the final catalog. This retains identifying and latest findings without constructing a non-source-mapped head/tail string. Medical history and transcript use deterministic protected fragment priorities.

For each succeeded consultation, select a raw prefix only, ending on a Unicode code-point boundary. Serialize one complete generic consultation-response envelope with static IDs/metadata and bounded truncation metadata. Do not use a tail-only fragment or omit a succeeded consultation in favor of a newer one.

**Rationale:** Selecting mapped raw fragments before encoding keeps model visibility, evidence eligibility, and offsets identical. The one generic serializer prevents trust-boundary drift.

**Alternative considered:** Truncate encoded context and reconstruct offsets afterward. Encoding expansion and slicing make the resulting source map unreliable.

### D9: Dynamic minimum context guarantees every possible success is visible

**Decision:** Remove the fixed `1024` minimum. Add a pure `computeMinimumCmoContextChars(config)` that calls the exact generic serializer and accounts for:

- fixed trusted task/catalog JSON syntax and separators;
- protected patient-fragment envelope overhead, including medical-history head, transcript head, and lab head/tail mapped fragments;
- trusted omission/truncation metadata;
- one worst-case encoded minimum consultation preview envelope for each possible succeeded consultation up to configured `MAX_TOTAL_SPECIALISTS`;
- source-reference metadata needed to expose those fragments to report generation.

Use an internal `MIN_CONSULTATION_PREVIEW_RAW_CHARS=128` and the evidence fragment maximum of 1,024 UTF-16 units. The minimum calculation uses the serializer's measured fixed output plus worst-case JSON escape expansion for protected raw capacities. Configuration validation requires `CMO_CONTEXT_MAX_CHARS` to be at least the computed result and reports both values. Changing serializer syntax, fixed metadata, preview floor, fragment bound, or maximum consultations automatically changes the requirement.

At runtime:

1. Reserve the dynamic minimum for protected patient fragments and one preview per succeeded consultation.
2. Select actual source-mapped patient fragments and consultation prefixes within those reservations.
3. Redistribute unused payload capacity to additional patient fragments and longer consultation prefixes according to deterministic clinical priority.
4. Serialize complete envelopes and assert final length.

Every succeeded consultation is therefore visible even when all `MAX_TOTAL_SPECIALISTS` admissions succeed. If the invariant cannot be satisfied because the configuration or fixed serializer changed, fail startup or report-context construction; never silently omit a success. `SPECIALIST_CONTEXT_MAX_CHARS` uses the same serializer and pre-encoding fragment selection but can retain a prioritized subset according to context mode because it is not the final evidence-catalog context.

**Rationale:** A static minimum becomes wrong when maximum consultations or envelope syntax changes. Dynamic validation makes the guarantee explicit and testable.

**Alternative considered:** Pack newest consultations until full. That can hide a succeeded consultation from synthesis while still allowing it to appear in provenance.

### D10: Strict configuration uses canonical names and coherent relationships

**Decision:** Add one strict positive-safe-integer parser and use it for all numeric controls touched by this design. Missing means default; an explicitly empty value is invalid. Reject signs, whitespace, decimals, exponents, suffixes, zero, negatives, and values above `Number.MAX_SAFE_INTEGER`.

Canonical new/renamed settings are:

| Name | Default | Unit |
| --- | ---: | --- |
| `MAX_SPECIALISTS_PER_ROUND` | `5` | admitted consultations per round |
| `MAX_TOTAL_SPECIALISTS` | `12` | admitted consultations per workflow |
| `MAX_TOTAL_MODEL_STEPS` | `24` | application-observed Mastra sequential LLM steps |
| `MIN_SUCCESSFUL_CONSULTATIONS` | `1` | settled succeeded consultations required for reporting |
| `REPORT_GENERATION_RESERVE_MS` | `120000` | time reserved for initial plus correction report operations |
| `CONSULTATION_SETTLEMENT_GRACE_MS` | `5000` | maximum child-settlement wait before reporting |

Validate with overflow-safe arithmetic:
- `MAX_SPECIALISTS_PER_ROUND <= MAX_TOTAL_SPECIALISTS`;
- `MAX_TOTAL_SPECIALISTS <= MAX_DIAGNOSIS_ROUNDS * MAX_SPECIALISTS_PER_ROUND`;
- `MIN_SUCCESSFUL_CONSULTATIONS <= MAX_TOTAL_SPECIALISTS` and the rounds/per-round product;
- `minimumDecisionSteps = ceil(MIN_SUCCESSFUL_CONSULTATIONS / MAX_SPECIALISTS_PER_ROUND)` and `MAX_TOTAL_MODEL_STEPS >= minimumDecisionSteps + MIN_SUCCESSFUL_CONSULTATIONS + 2` for the minimum required decision rounds, one specialist step per minimum success, and both report reservations;
- `REPORT_GENERATION_RESERVE_MS >= 2 * MIN_REPORT_STEP_WINDOW_MS + INITIAL_REPORT_SETTLEMENT_GRACE_MS`;
- `CONSULTATION_SETTLEMENT_GRACE_MS + REPORT_GENERATION_RESERVE_MS < DIAGNOSIS_TIMEOUT_MS`;
- `CMO_CONTEXT_MAX_CHARS >= computeMinimumCmoContextChars(...)`.

Pass exactly these canonical names plus `CMO_CONTEXT_MAX_CHARS` and `SPECIALIST_CONTEXT_MAX_CHARS` through `docker-compose.yml`. Do not retain aliases for `MAX_TOTAL_PROVIDER_ATTEMPTS` or `SYNTHESIS_TIME_RESERVE_MS`. Document the model-step observability boundary and computed context minimum in `.env.example`, `README.md`, and `AGENTS.md`.

**Rationale:** Strict values can still be mutually impossible. Relationship checks prevent configurations that cannot gather minimum evidence, preserve two report steps/time windows, or represent all possible successful consultations.

**Alternative considered:** Clamp inconsistent values at runtime. Silent clamping makes operator intent and budget telemetry unreliable.

### D11: PHI-free projections and mock adapters share the same state machine

**Decision:** Derive one budget snapshot from authoritative records:

```ts
type ConsultationBudgetSnapshot = {
  round: number;
  phase: "consultation" | "settlement" | "report" | "terminal";
  requested: number;
  invalid: number;
  duplicate: number;
  budgetRejected: number;
  admitted: number;
  started: number;
  modelSteps: number;
  succeeded: number;
  remaining: {
    roundAdmissions: number;
    totalAdmissions: number;
    nonReportModelSteps: number;
    reportModelSteps: number;
  };
  reason: ConsultationBudgetReason;
};
```

Progress and structured logs use the same serializer after recorder mutation. They may include namespaced execution IDs and validated specialist IDs, but never patient fragments, source text/hashes, prompts, directives, responses, tool arguments, diagnoses, raw invalid IDs, or free-text failures. Late sealed-scope hooks emit nothing. ProgressStore persists/publishes only while the job is pending.

Move mock behavior behind the same CMO/specialist/report adapters. A canned operation creates the same request batches, consultations, attempts, synthetic observed model steps, child settlement, generic JSON context/catalog, initial/correction validation, outcome-v2 envelope, and progress projections. Low model-step or context settings fail in mock mode exactly as live orchestration would.

**Rationale:** Separate mock and observability state machines cannot prove budget behavior and tend to leak presentation text into execution facts.

**Alternative considered:** Maintain mock-only counters. They would not exercise `RequestBatch`, reserved report steps, or correction validation.

### D12: REPORT_INSUFFICIENT_EVIDENCE joins the same strict v2 wire migration

**Decision:** Add `REPORT_INSUFFICIENT_EVIDENCE` to `ReportGenerationErrorCode` before the evidence-ledger outcome-v2 rollout. Both completed variants still require execution quality and sealed provenance. The insufficient-evidence variant has no candidate medical report and uses the same completed-job persistence lifecycle.

Update backend envelope/formatter, JobStore validation and fixtures, REST completion/status, WebSocket live/replay, frontend shared-schema parsing, unavailable-report UI, retry action, and mocks in one release branch. Screen and export source labels use the evidence-owned shared formatter. Coordinate the existing `export-privacy-and-disclaimer` frontend formatter instead of duplicating export layout/serialization here. REST and WebSocket expose the exact persisted object. Do not introduce an intermediate v1-plus-error-code shape.

Before deployment, drain pending v1 workflows and clear legacy persisted terminal jobs or wait through `JOB_TTL_MS`. Deploy backend, frontend strict-v2 screens, and the coordinated `export-privacy-and-disclaimer` frontend integration together. Legacy Print/Share must use strict v2/shared evidence labels or remain disabled. Verify available, validation-failed, and insufficient-evidence outcomes over REST and WebSocket, including reconnect replay. Roll back both sides together after the symmetric v2-job drain/expiry rule. No compatibility parser fabricates v2 provenance for legacy data.

**Rationale:** The new error code is part of the strict completed union and cannot safely be rolled out independently of required v2 provenance and frontend parsing.

**Alternative considered:** Let old clients treat the code as an unknown generic failure. Strict schemas reject it, and weakening them would undermine the coordinated provenance migration.

## Risks / Trade-offs

- **[Observed model steps are not provider request counts]** -> Internal provider retries can still consume time or money. **Mitigation:** State the boundary explicitly, retain provider metadata when observable, and never label model-step counts as complete provider attempts.
- **[Two report reservations reduce consultation capacity]** -> Some cases stop consulting with unused correction capacity. **Mitigation:** This is intentional safety isolation; unused report steps are not clinical consultation capacity.
- **[Grace expiry detaches live provider work]** -> A provider operation may continue after the workflow stops waiting. **Mitigation:** Abort first, attach settlement handlers, terminalize and seal child scopes, suppress late hooks/events, and retain the workflow concurrency slot until the outer run promise settles where required by server capacity policy.
- **[Every succeeded consultation consumes context overhead]** -> Larger `MAX_TOTAL_SPECIALISTS` raises the minimum valid CMO context. **Mitigation:** Compute and report the exact requirement at startup; operators must raise context or lower maximum consultations rather than silently hiding successes.
- **[Whole-candidate rejection increases report failures]** -> One unmatched summary can invalidate otherwise useful text. **Mitigation:** Preserve the evidence ledger's bounded correction attempt and prefer unavailable content to a silently edited evidence claim.
- **[Fragment selection limits eligible patient evidence]** -> Omitted input cannot be cited. **Mitigation:** Protect mapped lab head/tail fragments, expose the exact frozen catalog to both report attempts, and never pretend unseen text supported a claim.
- **[Cross-change ownership differs from earlier ledger drafts]** -> Older planning language may mention requested consultations or model attempts only. **Mitigation:** Implement the shared RequestBatch/ConsultationRecord/AttemptRecord/ModelStepRecord decision as one coordinated branch and update strict tests before rollout.

## Migration Plan

1. Apply the evidence-ledger recorder and generic JSON-envelope encoder foundations, incorporating the shared record ownership refinements before implementation proceeds.
2. Add strict canonical configuration, relationship validation, dynamic context minimum calculation, Docker/Compose passthrough, and startup budget logging.
3. Implement RequestBatch admission, consultation state transitions, cross-round reconsultation, explicit per-call `maxSteps`, and atomic `prepareStep` acquisition.
4. Add consultation cutoff, bounded settlement grace, child-scope terminalization/sealing, safe late-hook behavior, and pending-only progress persistence.
5. Replace string context with source-mapped fragment selection, exact generic JSON serialization, model-visible patient catalog construction, protected lab fragments, and guaranteed consultation previews.
6. Integrate minimum-evidence gating with two reserved one-step/no-tools report operations and strict whole-candidate initial/correction validation.
7. Land `REPORT_INSUFFICIENT_EVIDENCE` with the complete backend, persistence, REST, WebSocket, frontend, mock, export-guard, and E2E outcome-v2 changes; do not ship an intermediate contract.
8. Drain/expire legacy jobs, deploy backend and frontend together, verify all v2 outcome paths over both transports, and use the symmetric drain rule for rollback.
