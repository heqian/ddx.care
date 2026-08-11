## Context

See `proposal.md` for motivation and the delta specs for normative behavior.

`runDiagnosis` currently returns a report-generation outcome directly, and `formatReport` receives no execution context. The CMO can return `finalReport` inline from a round decision or from a later report-generation call; both use free-text `specialistsConsulted` and string `supportingEvidence`. The workflow filters requests through `allConsultedSpecialists`, adds a specialist before generation succeeds, converts failures into consultation text, and emits the same `specialist_complete` progress event for success and failure. Requested, rejected, admitted, retried, and reconsulted work therefore cannot be distinguished reliably.

`createToolEventHooks` currently projects tool lifecycle data only into progress and logs. It uses Mastra's provider tool-call ID when available, records display arguments, and classifies results, but it does not own a durable workflow record. `fetchJSON` and `fetchText` return cached or network data without exposing per-call cache facts; `getCached` retains `fetched_at` internally. CMO calls use the same hooks as specialist calls, but there is no workflow-level owner-aware tool ledger.

The shared `reportOutcomeSchema` is strict. `JobStore.complete()` validates and stores that exact result, REST status returns it directly, WebSocket completion replays it, and the frontend parses it again. This is useful for enforcement but means the new shape cannot be rolled out one side at a time and cannot read legacy persisted outcomes. Mastra 1.50.1 provides application-visible capture points including per-execution tool hooks, `RequestContext`, `context.agent.toolCallId`, `prepareStep`, returned sequential `steps`, request `modelSettings`, and provider `response.modelId` when exposed. It does not guarantee visibility into transport retries performed internally by a provider adapter.

Prompt review metadata is owned by the related `clinician-reviewed-prompts` change. This design consumes its prompt version and review linkage when available and records `unknown` otherwise; it does not claim that an absent review occurred.

## Goals / Non-Goals

**Goals:**
- Make execution status authoritative and independent of model text, progress delivery, or log parsing.
- Carry one strict execution envelope from analysis through formatting and into the completed outcome.
- Preserve every CMO request and non-admission disposition without manufacturing consultation failures.
- Align logical generations, `Agent.generate` operations, application-observed model steps, request batches, prompt usages, and budgets through explicit links.
- Make every ranked diagnosis include structured, resolvable supporting evidence.
- Limit citations to exact retained source fragments visible to the final report model.
- Preserve admitted failed, cancelled, retried, and reconsulted execution in completed outcomes without presenting failure as success.
- Record privacy-minimized prompt, model, tool, retrieval, cache, dataset, schema, app, and dependency-lock provenance.
- Keep REST, WebSocket, persistence, mock behavior, UI, and exports on one strict versioned contract.

**Non-Goals:**
- Proving that a source entails an evidence statement or that a diagnosis is clinically correct.
- Applying source-verification claims to rationale, consultation summaries, contradictory evidence, next steps, cross-specialty observations, or immediate actions.
- Persisting raw patient input, prompts, consultation responses, tool results, query terms, or URLs in provenance.
- Claiming observation of provider transport retries hidden inside an adapter.
- Deterministic replay. Provider behavior and external datasets can change even with complete observable metadata.
- A durable audit ledger for workflows that fail, time out, or are cancelled.
- A second durable provenance database, longer retention, or a compatibility adapter for legacy outcomes.
- Implementing the clinician prompt-review process itself.

## Decisions

### D1: One in-memory recorder and completed-outcome envelope

**Decision:** `runDiagnosis` owns an in-memory `ExecutionRecorder`. Execution paths update it before emitting progress. A non-abort report terminal path returns a strict `DiagnosisExecutionEnvelopeV1`; `formatReport` accepts only that envelope.

```ts
type DiagnosisExecutionEnvelopeV1 = {
  envelopeVersion: "1";
  reportGeneration: RawReportGenerationOutcome;
  provenance: ProvenanceV1;
};
```

`RawReportGenerationOutcome` is the internal available-candidate or `generation_failed` union. `ProvenanceV1` is sealed only when the workflow will complete with a report outcome. `formatReport` validates the envelope, derives public report fields, and emits the strict completed outcome without reading progress or logs.

Cancellation, timeout, or unrecoverable workflow failure never returns this envelope. The error path marks the job failed, discards the recorder, and persists no provenance or failed/cancelled execution ledger. Existing minimal failed status/error and presentation progress can remain for UI behavior, but they are not promoted into an audit record. Provenance-related logging is limited to aggregate counts and stable codes.

The recorder also exposes a lossy progress projection. It commits execution state first and emits presentation status second. Missing or duplicated progress cannot alter final provenance.

**Rationale:** A single recorder prevents drift. Sealing only for completed outcomes gives report audits useful degraded history while deliberately avoiding a durable cancellation/failure audit copy.

### D2: RequestBatch owns pre-admission accounting

**Decision:** CMO decision output accepts bounded strings for requested IDs, then workflow admission validates canonical specialist identity. Every structurally parseable decision produces one request batch linked to the exact CMO generation, `Agent.generate` attempt, and final application-observed model step that produced it.

```ts
type RequestBatchId = `request-batch:${string}`;
type RequestEntryId = `request-entry:${string}`;

type RequestEntryV1 = {
  requestEntryId: RequestEntryId;
  position: number;
  specialistId?: SpecialistId;
  invalidValueDigest?: `sha256:${string}`;
  requestedAt: string;
  requestedBy: LedgerActor;
  disposition: "admitted" | "invalid" | "duplicate" | "budget_rejected";
  reasonCode: string;
  dispositionAt: string;
  dispositionActor: LedgerActor;
  consultationId?: ConsultationId;
};

type RequestBatchV1 = {
  requestBatchId: RequestBatchId;
  generationId: GenerationId;
  attemptId: AttemptId;
  modelStepId: ModelStepId;
  round: number;
  entries: RequestEntryV1[];
};
```

Every requested position is retained. `specialistId` is present only after canonical validation. `invalidValueDigest` is present only for `invalid`, is required for that disposition, and is SHA-256 over a bounded canonical representation of the invalid value; the raw value is never persisted. The first valid occurrence can proceed to admission. Later same-batch occurrences receive `duplicate`. Registry availability, round/total capacity, closed-phase, and pre-admission abort details use stable `reasonCode` values under the four shared dispositions.

After validation and deduplication, the workflow synchronously selects the ordered prefix that fits round and total capacity. In one no-`await` admission section, each selected entry becomes `admitted`, consumes capacity, and creates its `ConsultationRecord` before any promise or worker is scheduled. Remaining valid entries become `budget_rejected`. If cutoff or cancellation occurs after admission but before worker start, the consultation transitions directly from `admitted` to `cancelled`; it is not rewritten as non-admitted and its capacity is not refunded.

```ts
type ConsultationExecutionStatus =
  | "admitted"
  | "started"
  | "succeeded"
  | "failed"
  | "cancelled";

type ConsultationRecord = {
  consultationId: ConsultationId;
  requestBatchId: RequestBatchId;
  requestEntryId: RequestEntryId;
  generationId: GenerationId;
  specialistId: SpecialistId;
  round: number;
  executionStatus: ConsultationExecutionStatus;
  transitions: Array<{
    status: ConsultationExecutionStatus;
    at: string;
    actor: LedgerActor;
  }>;
  rawResponseDigest: `sha256:${string}` | "unknown";
  failureCode: string | "none";
  limitationCodes: string[];
  sourceFragmentIds: SourceFragmentId[];
};
```

Allowed consultation transitions are `admitted -> started -> succeeded|failed|cancelled` and direct `admitted -> cancelled` for pre-start cutoff or cancellation. Admission rejection is never represented in this type. A consultation succeeds only for non-empty accepted specialist output. Application retries live under the linked generation. Explicit later-round requests can create new consultations for a previously failed or successful specialist; only duplicates within one request batch are suppressed.

**Rationale:** Request intent and execution outcome answer different questions. Separating them prevents invalid or duplicate model output from inflating clinical failure metadata.

### D3: Generation ledger nests attempts, observed steps, request batches, and budgets

**Decision:** The recorder uses three distinct execution identities:

```ts
type GenerationId = `generation:${string}`;
type AttemptId = `attempt:${string}`;
type ModelStepId = `model-step:${string}`;
type ConsultationId = `consultation:${string}`;
type ToolCallId = `tool-call:${string}`;
type PromptAssetUsageId = `prompt-asset-usage:${string}`;
type SourceRecordId = `source-record:${string}`;
type SourceFragmentId = `source-fragment:${string}`;

type LedgerActor =
  | { type: "workflow"; id: "diagnostic-workflow" }
  | { type: "agent"; id: "chiefMedicalOfficer" | SpecialistId };

type SourceRecordOwner =
  | { type: "patient"; field: "medicalHistory" | "conversationTranscript" | "labResults" }
  | { type: "consultation"; consultationId: ConsultationId }
  | { type: "tool"; toolCallId: ToolCallId }
  | { type: "cmo_directive"; generationId: GenerationId }
  | { type: "failure"; generationId: GenerationId };
```

A generation is one logical workflow purpose. One specialist consultation has one generation even when application retry policy calls `Agent.generate` more than once. Final report synthesis has one generation with an initial attempt and, if required, one correction attempt.

```ts
type GenerationRecordV1 = {
  generationId: GenerationId;
  purpose: "cmo_decision" | "specialist_consultation" | "final_report";
  actor: LedgerActor;
  consultationId?: ConsultationId;
  budget: {
    maxAgentGenerateAttempts: number;
    toolChoice: "auto" | "none" | "required";
  };
  attempts: AttemptRecordV1[];
  requestBatches: RequestBatchV1[];
};

type AttemptRecordV1 = {
  attemptId: AttemptId;
  generationId: GenerationId;
  phase: "initial" | "retry" | "correction";
  executionStatus: "started" | "succeeded" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string | "unknown";
  resultDigest: `sha256:${string}` | "unknown";
  failureCode: string | "none";
  configuredModelId: string | "unknown";
  resolvedModelId: string | "unknown";
  providerId: string | "unknown";
  providerTransportRetryCount: "unknown";
  maxSteps: number;
  settings: ModelSettingsRecord;
  modelSteps: ModelStepRecordV1[];
  promptAssets: PromptAssetUsageV1[];
};

type ModelStepRecordV1 = {
  modelStepId: ModelStepId;
  attemptId: AttemptId;
  position: number; // zero-based Mastra step number
  budgetClass: "non_report" | "report_initial" | "report_correction";
  executionStatus: "started" | "succeeded" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string | "unknown";
  resolvedModelId: string | "unknown";
  finishReason: string | "unknown";
  resultDigest: `sha256:${string}` | "unknown";
  failureCode: string | "none";
};
```

Each `attemptId` is minted immediately before exactly one application call to `Agent.generate`. `phase` is `initial` for the first CMO/specialist/report call, `retry` only for an application-level retry under the same CMO or specialist generation, and `correction` only for the second attempt under `final_report`. The attempt records the exact finite `maxSteps` passed to that call; generation-level policy does not substitute for this per-attempt snapshot. `prepareStep` mints one `modelStepId` for each application-observed sequential step, records Mastra's zero-based step number and the budget class derived from generation purpose plus attempt phase, and rejects any step beyond that class budget. Returned Mastra `steps` and provider response metadata finalize only those observed records. An operation that fails before an observed model call can contain zero steps.

Application retry policy creates another attempt under the same generation. Provider transport retries hidden inside an adapter are neither attempts nor model steps; the provenance count remains `unknown`. Request batches are nested only under their producing CMO generation, and prompt usages/model steps are nested only under their attempt. Strict validation uses IDs for links rather than relying on array positions across independent collections.

**Rationale:** This hierarchy matches what the application can actually observe and places retry and step budgets beside the work they govern.

### D4: Tool records separate execution from bounded model delivery

**Decision:** Tool calls live in one workflow-level ledger because CMO-owned calls have no consultation. Each record links to its generation and attempt, and to the observed model step when Mastra exposes that association.

```ts
type ToolCallRecordV1 = {
  toolCallId: ToolCallId;
  toolId: string;
  actor: LedgerActor;
  generationId: GenerationId;
  attemptId: AttemptId;
  modelStepId: ModelStepId | "unknown";
  consultationId?: ConsultationId;
  executionStatus: "succeeded" | "failed" | "cancelled";
  transformStatus: "not_attempted" | "succeeded" | "failed";
  deliveryStatus: "not_attempted" | "delivered" | "not_delivered";
  startedAt: string;
  completedAt: string | "unknown";
  rawResultDigest: `sha256:${string}` | null;
  safeModelOutputDigest: `sha256:${string}` | null;
  executionCode: string | "none";
  transformCode: string | "none";
  deliveryCode: string | "none";
  publicRecordIds: Array<{ namespace: string; id: string }>;
  retrievals: RetrievalRecordV1[];
  limitationCodes: string[];
  sourceFragmentIds: SourceFragmentId[];
  modelOutputAssetUsageId: PromptAssetUsageId;
  toolVersion: string | "unknown";
  datasetVersion: string | "unknown";
};

type RetrievalRecordV1 = {
  sourceId: string;
  observedAt: string;
  completedAt: string | "unknown";
  mode: "network" | "cache" | "local_dataset" | "unknown";
  cacheStatus:
    | "hit"
    | "miss"
    | "disabled"
    | "not_applicable"
    | "unknown";
  sourceFetchedAt: string | "unknown";
  cacheAgeMs: number | "unknown";
  limitationCodes: string[];
};
```

Each `Agent.generate` call receives a server-created Mastra `RequestContext` containing only recorder and ownership handles. `createToolEventHooks` maps Mastra's provider tool-call correlation ID to one internal `toolCallId`. A returned raw result, including a typed failure, is canonicalized and hashed; `rawResultDigest` is null only when execution throws or is cancelled before a result exists. A privacy-safe transform then produces and bounds the exact output intended for model delivery. `safeModelOutputDigest` is non-null exactly when canonical safe or fail-safe bytes were prepared, and `deliveryStatus: delivered` requires that digest and attachment of those exact bytes to a subsequent model request.

A thrown execution remains `executionStatus: failed`; its tool transform is `not_attempted`, but the shared fail-safe serializer may prepare and deliver a canonical fallback, producing a safe digest and independent delivery status. A typed failure remains execution-failed while its bounded failure transform may succeed and be delivered. Transform or bounding failure after successful execution preserves `executionStatus: succeeded` and records `transformStatus: failed`; the shared fail-safe serializer may likewise prepare/deliver a fallback without changing that failed transform status. Cancellation is execution-cancelled; transform and delivery are `not_attempted` unless safe bytes had already been prepared, in which case delivery is `delivered` or `not_delivered`. Usable partial results are execution- and transform-succeeded with stable limitations.

A tool can become citation-eligible only when `executionStatus: succeeded`, `transformStatus: succeeded`, `deliveryStatus: delivered`, its linked `tool.<toolId>.model-output` usage matches the tool call, the safe digest matches the complete retained visible source-record envelope, and final context packing retained at least one fragment from that record. Fail-safe fallback bytes are always ineligible regardless of delivery.

`fetchJSON`, `fetchText`, `tool-cache`, and local dataset access report retrieval facts through the in-memory recorder while preserving current tool return shapes. Cache hits expose original fetch time; multi-fetch tools produce multiple retrieval entries. Per-tool adapters allowlist public IDs, stable codes, and asset versions. No record contains raw arguments, URLs, cache keys, queries, condition terms, drug or diagnosis names, titles, summaries, outputs, or free-text errors.

**Rationale:** Raw execution and safe model delivery can fail independently. Recording both avoids treating a successful API call as evidence the model actually saw.

### D5: Evidence catalog contains only final-context fragments

**Decision:** Source eligibility is decided after final context packing, not when input or a tool result first exists. The workflow freezes exact bounded source fragments that will be supplied to both report attempts.

```ts
type SourceFragmentV1 =
  | {
      sourceFragmentId: SourceFragmentId;
      sourceRecordId: SourceRecordId;
      type: "patient";
      field: "medicalHistory" | "conversationTranscript" | "labResults";
      startOffset: number;
      endOffset: number;
      offsetUnit: "utf16-code-unit";
      contentHash: `sha256:${string}`;
      modelVisibleContentHash: `sha256:${string}`;
      retainedLength: number;
      limitationCodes: string[];
    }
  | {
      sourceFragmentId: SourceFragmentId;
      sourceRecordId: SourceRecordId;
      type: "consultation";
      consultationId: ConsultationId;
      modelVisibleContentHash: `sha256:${string}`;
      startOffset: number;
      endOffset: number;
      offsetUnit: "utf16-code-unit";
      limitationCodes: string[];
    }
  | {
      sourceFragmentId: SourceFragmentId;
      sourceRecordId: SourceRecordId;
      type: "tool";
      toolCallId: ToolCallId;
      modelVisibleContentHash: `sha256:${string}`;
      startOffset: number;
      endOffset: number;
      offsetUnit: "utf16-code-unit";
      limitationCodes: string[];
    };

type SourceRecordV1 = {
  sourceRecordId: SourceRecordId;
  owner: SourceRecordOwner;
  modelVisibleEnvelopeHash: `sha256:${string}`;
  sourceFragmentIds: SourceFragmentId[];
};
```

The canonical generic envelope has one envelope-level `sourceRecordId` and typed owner. `SourceRecordV1` defines that ID exactly once and hashes the complete canonical envelope bytes; multiple child `SourceFragmentV1` rows may reference the same record ID without redefining or duplicating it. Every entry in the envelope's `fragments` array carries the exact `sourceFragmentId`, offsets/unit, and encoded text for one `SourceFragmentV1`; no envelope-level ID substitutes for a fragment ID. Patient fragments map exact retained text back to offsets in the original bounded request field before prompt headings or guard text are added. `contentHash` covers that original UTF-8 field slice. Consultation fragments contain a bounded representation of accepted successful output. A retained tool record reuses the exact complete safe envelope delivered by `toModelOutput` without re-encoding or reserialization; its source-record envelope hash must equal `safeModelOutputDigest`, while each child fragment retains its own `modelVisibleContentHash`. Raw fragment text is included in report-generation context but never in provenance.

Every succeeded consultation must have at least one retained consultation fragment. If the final context budget cannot represent all succeeded consultations, report generation does not start and the completed outcome is `generation_failed` with `REPORT_INSUFFICIENT_EVIDENCE`. Omitted patient and tool material is simply ineligible. The frozen catalog and exact fragment text are reused for correction, whose bounded feedback budget cannot displace catalog material.

**Rationale:** A digest of content seen by an earlier agent does not prove the report model received it. Eligibility at the final packing boundary makes that claim observable.

### D6: Final reporting is one initial attempt plus one whole-candidate correction

**Decision:** CMO round decisions contain only consultation requests and `isFinal`; inline `finalReport` is removed. Synthesis uses one generation with purpose `final_report`. Its `initial` structured `Agent.generate` attempt and optional `correction` attempt both use `toolChoice: "none"`, `maxSteps: 1`, and a one-step `prepareStep` guard with budget class `report_initial` or `report_correction`. No retry wrapper adds report attempts.

The initial attempt has a child deadline and internal bounded settlement grace wholly inside the initial report window. If it has not settled at grace expiry, the recorder terminalizes and seals its attempt/model-step scope, attaches rejection/settlement handlers to detached work, and makes every late callback a no-op for records, budgets, progress, logs, catalog, and report state. Only after that seal may correction start, preserving its reserved step and time. Parent cancellation/timeout still aborts the whole workflow and prevents correction.

The raw report replaces model-authored `specialistsConsulted` with consultation summaries keyed by `consultationId`. Ranked diagnoses use strict evidence objects:

```ts
type EvidenceSourceRef =
  | {
      type: "patient";
      sourceFragmentId: SourceFragmentId;
      field: "medicalHistory" | "conversationTranscript" | "labResults";
      startOffset: number;
      endOffset: number;
      contentHash: `sha256:${string}`;
    }
  | {
      type: "consultation";
      sourceFragmentId: SourceFragmentId;
      consultationId: ConsultationId;
    }
  | {
      type: "tool";
      sourceFragmentId: SourceFragmentId;
      toolCallId: ToolCallId;
      publicRecordId?: { namespace: string; id: string };
    };

type SupportingEvidenceItem = {
  statement: string;
  sourceRefs: EvidenceSourceRef[];
};
```

Every diagnosis requires at least one non-empty evidence item and every item requires a source. Validation resolves each ref to the frozen fragment and verifies its owner, patient tuple/hash, consultation success, tool execution/delivery, and optional allowlisted public ID. Consultation summaries and every structured consultation claim must exactly match represented succeeded consultations without duplicates, omissions, failed IDs, cancelled IDs, or unknown IDs.

Any schema, empty-response, summary, claim, or source defect rejects the entire initial candidate and consumes the single correction. The workflow supplies bounded issue codes and paths, not provider error text. It never removes invalid entries or emits a sanitized subset. Any correction defect returns `REPORT_VALIDATION_FAILED` with no candidate medical content.

Only `supportingEvidence[].sourceRefs` receives source validation. Rationale, summary text, contradictory evidence, next steps, cross-specialty observations, and immediate actions remain model synthesis. A fixed notice says references establish traceability, not entailment, accuracy, or clinical truth.

**Rationale:** One centralized state machine closes the inline-report bypass and prevents partial sanitization from concealing model defects.

### D7: Public consultation and degradation fields are ledger-derived

**Decision:** The available consulted list has one item per succeeded consultation represented in final context, including repeated specialties:

```ts
type SpecialistConsultedV2 = {
  consultationId: ConsultationId;
  specialist: string;
  round: number;
  keyFindings: string;
};
```

Identity and round come from the ledger. `keyFindings` comes from the exactly matched candidate summary and is labeled AI synthesis. Failed, cancelled, and non-admitted work cannot enter the list.

Both completed variants include ledger-derived execution quality:

```ts
type ExecutionQualityV1 = {
  status: "nominal" | "degraded";
  warningCodes: string[];
  requestDispositionCounts: Array<{
    code: RequestEntryV1["disposition"];
    count: number;
  }>;
  unavailableConsultations: Array<{
    consultationId: ConsultationId;
    specialistId: SpecialistId;
    round: number;
    executionStatus: "failed" | "cancelled";
    failureCode: string;
    limitationCodes: string[];
  }>;
  limitedToolCalls: Array<{
    toolCallId: ToolCallId;
    executionStatus: "succeeded" | "failed" | "cancelled";
    transformStatus: "not_attempted" | "succeeded" | "failed";
    deliveryStatus: "not_attempted" | "delivered" | "not_delivered";
    limitationCodes: string[];
  }>;
};
```

An admitted failed consultation makes a completed outcome degraded. A later successful reconsultation creates a separate success but does not remove that history. Non-admission counts stay request metadata rather than consultation failures. Material cited-tool limitations also produce stable warnings. `nominal` means only that no recorded execution degradation occurred.

Progress projects explicit request, consultation, attempt, and tool statuses. Only success is green. Failed/cancelled work is non-green, and mixed failure plus later success remains degraded. Results and downstream projections place the warning before clinical content and preserve the traceability notice.

**Rationale:** Derivation prevents fabricated identity and keeps execution degradation visible without misclassifying rejected requests.

### D8: Provenance nests observable usage and uses explicit unknowns

**Decision:** Prompt metadata uses the shared strict usage contract and lives under its exact attempt:

```ts
type PromptAssetUsageV1 = {
  promptAssetUsageId: PromptAssetUsageId;
  promptId: string;
  version: string | "unknown";
  contentHash: `sha256:${string}` | "unknown";
  reviewId: string | null | "unknown";
  reviewStatus: "approved" | "unreviewed" | "unknown";
  actor: LedgerActor;
  attemptId: AttemptId;
  consultationId?: ConsultationId;
  toolCallId?: ToolCallId;
  executionStatus: AttemptRecordV1["executionStatus"];
};
```

`version` and `contentHash` come from immutable exact canonical UTF-8 prompt-manifest entry bytes, with no runtime normalization and no instantiated patient prompt. At attempt start, `reviewStatus` and `reviewId` are resolved separately from the active applicable append-only review records and retained as the historical execution snapshot; they are not stored in or copied from the immutable manifest. `approved` requires known version/hash and an opaque string review ID; `unreviewed` requires known version/hash plus `reviewId: null` after lookup confirms no applicable approval; `unknown` requires `reviewId: "unknown"`. Known manifest identity remains known when review lookup is unavailable. Version/hash are both `unknown` only when manifest identity itself is unavailable. The usage actor, consultation, and final execution status must match the owning attempt. Non-tool assets have one usage per `(attemptId, promptId)`. `toolCallId` is present only for a `tool.<toolId>.model-output` asset and must match exactly one tool call whose required `modelOutputAssetUsageId` points back to this usage; repeated tool calls create distinct usages. That usage is created from the attempt-start manifest/review snapshot when the tool-call ID is minted before executor invocation, including thrown, cancelled, and non-delivered calls. Other assets omit `toolCallId`. Reviewer identity and credentials are excluded.

Model settings remain an allowlist of values actually sent or returned:

```ts
type ModelSettingsRecord = {
  temperature: number | "unknown";
  maxOutputTokens: number | "unknown";
  topP: number | "unknown";
  topK: number | "unknown";
  presencePenalty: number | "unknown";
  frequencyPenalty: number | "unknown";
  toolChoice: "auto" | "none" | "required" | "unknown";
  structuredOutput: boolean;
  jsonPromptInjection: boolean;
  settingsSource: "request" | "provider" | "mixed" | "unknown";
};
```

`ProvenanceV1` is required only on completed outcomes and nests records according to ownership:

```ts
type ProvenanceV1 = {
  version: "1";
  workflowRunId: string;
  startedAt: string;
  completedAt: string;
  consultations: ConsultationRecord[];
  generations: GenerationRecordV1[];
  toolCalls: ToolCallRecordV1[];
  sourceRecords: SourceRecordV1[];
  sourceFragments: SourceFragmentV1[];
  runtimeAssets: {
    reportSchema: VersionedAssetRecord;
    promptSchema: VersionedAssetRecord;
    app: VersionedAssetRecord;
    lock: VersionedAssetRecord;
    tools: VersionedAssetRecord[];
    datasets: VersionedAssetRecord[];
  };
};
```

Generations contain attempts and request batches; attempts contain observed steps and prompt usages. IDs provide strict foreign-key validation. Model metadata separates configured identity from provider-resolved `response.modelId`; unseen settings and hidden transport retry counts remain `unknown`. Runtime assets use explicit version/hash/revision or `unknown`; package ranges are not presented as resolved lock versions.

Provider bodies, instantiated prompts, response text, reasoning, headers, credentials, and arbitrary metadata are excluded. Hashes are privacy-minimized derived data, not declared non-PHI, and receive the report's retention protections.

**Rationale:** Nested ownership prevents index-coupled parallel collections. Exact manifest linkage and explicit unknowns avoid overstating review or provider observability.

### D9: Strict completed shape, retention, transport, and export

**Decision:** Both completed variants gain `executionQuality` and `provenance`; the available variant also gains structured evidence and `traceabilityNotice`. All nested objects are strict. Legacy string evidence, optional provenance, and compatibility parsing are rejected.

The job store persists the one validated completed result JSON under existing `JOB_TTL_MS` scrub-before-delete behavior. REST returns that exact value; WebSocket live completion and replay use the same value; frontend paths parse the shared schema. No separate ledger table or database is added.

A failed, timed-out, or cancelled workflow does not produce a completed outcome. Its recorder is discarded after failed status and no provenance is copied into progress, logs, audit logs, cache, or another store. Aggregate diagnostics can contain only counts and stable codes. Mock available and `generation_failed` paths produce valid envelopes; forced workflow failure verifies that no provenance result is retained.

One shared evidence-owned source-label formatter maps validated patient, consultation, and tool references to privacy-safe labels. Screen components and export consumers import that same formatter; no consumer reconstructs labels from raw provenance or implements a competing mapping. The formatter does not own report export layout, truncation, disclaimers, or serialization, which remain with `export-privacy-and-disclaimer`.

Outcome-v2 backend/frontend parsing, screen consumers, and the `export-privacy-and-disclaimer` frontend integration deploy together after the legacy-job drain. Evidence v2 must not be exposed through legacy Print/Share code; release validation blocks deployment unless those consumers use the strict v2 outcome and shared source-label formatter, or the affected legacy actions are disabled. User-created copies remain outside server retention.

**Rationale:** Reusing the strict completed-result lifecycle minimizes persistence risk and keeps all transports and projections on one authoritative object.

## Risks / Trade-offs

- **[Citation presence can be mistaken for medical validation]** -> The fixed notice, synthesis labels, and UI/export tests state that references show traceability only; semantic entailment and clinical truth are not claimed.
- **[The model can fail the stricter source schema]** -> One bounded correction is allowed; exhaustion suppresses candidate medical content and returns `REPORT_VALIDATION_FAILED`.
- **[Disabling tools during structured synthesis can defer a late lookup]** -> Tool-capable CMO decision attempts gather evidence first; synthesis runs only after the source catalog is frozen.
- **[Per-tool public-ID and limitation adapters require maintenance]** -> Unknown IDs/versions remain explicit, adapters are allowlisted and contract-tested, and an eligible retained tool fragment can still be cited without inventing a public record ID.
- **[All successful consultations may not fit final context]** -> Context packing reserves a bounded representation for every success; if it cannot, synthesis is skipped and the completed outcome uses `REPORT_INSUFFICIENT_EVIDENCE`.
- **[Provider transport retries remain invisible]** -> Attempt and model-step records cover only application-observed operations, and hidden retry count stays `unknown` rather than being inferred.
- **[Hashes can be linkable or dictionary-tested]** -> Treat all hashes as sensitive derived data, never log them, retain them only with the job outcome, and scrub them under `JOB_TTL_MS`.
- **[Provenance increases result size]** -> Store digests and bounded metadata rather than raw responses; use deterministic caps for public IDs/retrieval entries with explicit truncation limitation codes and never drop a reference used by the report.
- **[A recovered specialist still leaves a degraded warning]** -> This is intentional historical accuracy; the separate later success remains visible and can be cited.
- **[The in-memory recorder is lost on process crash]** -> A crashed/restarted pending job already becomes failed and cannot yield an available report. The system does not reconstruct a ledger from progress after restart.
- **[Exact replay remains impossible]** -> Record observed model, settings, prompt, tool, dataset, and build facts for comparison, and describe unknown or nondeterministic inputs explicitly.

## Migration Plan

1. Implement the backend recorder, strict shared schemas, tool/cache instrumentation, source validation, shared source-label formatter, persistence parsing, mocks, frontend screen integration, and all fixtures in one release branch. Coordinate export consumers with `export-privacy-and-disclaimer`; do not create a competing export formatter or ship an intermediate wire shape.
2. Before deployment, stop accepting legacy jobs and let pending workflows settle. Then either clear legacy persisted terminal jobs or wait at least the configured `JOB_TTL_MS` after the final legacy job becomes terminal so no legacy result can reach the new strict parser.
3. After the drain, deploy backend, frontend strict outcome parsing, screen consumers, and the coordinated `export-privacy-and-disclaimer` frontend integration together. Verify mock available and `generation_failed` outcomes over REST/WebSocket plus shared-label screen/export consumers; legacy Print/Share must be migrated or disabled.
4. Do not add a permissive compatibility adapter. A legacy outcome that remains unexpectedly is rejected rather than assigned fabricated provenance.
5. Roll back backend and frontend together. Before serving the old strict client/server pair, clear v2 persisted jobs or wait for their `JOB_TTL_MS` expiry using the same drain rule; the old parser cannot safely consume the v2 shape.
6. Provenance retention remains `JOB_TTL_MS` after rollout and rollback. Operators document that separately exported copies are outside server retention.
