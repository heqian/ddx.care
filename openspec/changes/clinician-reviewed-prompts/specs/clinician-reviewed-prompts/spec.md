## Purpose

Governs every effective model-facing prompt and transformation asset with exact content identity, append-only clinician review, explicit human release approval, attempt-linked provenance, bounded report synthesis, and reviewed regression controls.

## ADDED Requirements

### Requirement: Every effective prompt and transformation asset is inventoried

The system SHALL inventory every application-controlled static component that changes model-visible instructions, context, schemas, tools, or tool output. The inventory SHALL include specialist and CMO instructions/descriptions, shared factory instructions, the CMO catalog rendered from the specialist manifest, exact assets `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, and `workflow.context-packer`, CMO decision and specialist templates, report initial/correction templates, relevant structured-output schemas, every assigned tool definition, and a versioned `tool.<toolId>.model-output` asset for each tool's allowlist, mapping, ordering, caps, truncation, omission, `unknown`, no-result, error, and limitation semantics.

Completeness SHALL be discovery-based rather than fixed to an agent count. Runtime patient values, consultation text, model output, and tool-result values SHALL NOT become manifest content.

#### Scenario: Shared context behavior changes
- **WHEN** a factory instruction, encoder, serializer, or context-packer rule changes model-visible content without changing an agent module
- **THEN** validation requires a new manifest tuple and applicable review for that exact asset

#### Scenario: Tool output transform changes
- **WHEN** a tool's model-facing field allowlist, cap, ordering, truncation, or omission rule changes
- **THEN** `tool.<toolId>.model-output` receives a new version/hash and dependent review/corpus bindings become stale

#### Scenario: Static model-facing behavior is unregistered
- **WHEN** runtime composition discovers a static prompt, schema, encoder, packer, tool definition, framework wrapper, or tool-output transform with no manifest entry
- **THEN** governance and release validation fail closed

#### Scenario: Dynamic patient content is encoded
- **WHEN** a canonical encoder/template is applied to patient or consultation data
- **THEN** only the static asset identity participates in manifest/provenance records and no dynamic value is persisted there

### Requirement: Manifest assets have immutable canonical identity

The prompt asset manifest SHALL identify each asset with a stable `promptId`, a valid semantic `version`, and a `contentHash` formatted as `sha256:` followed by 64 lowercase hexadecimal characters. `contentHash` SHALL be SHA-256 over deterministic canonical manifest payload bytes: exact UTF-8/LF static text with placeholders or deterministic serialization of declarative encoder, serializer, packer, schema, tool-definition, or tool-output behavior. A canonical byte change SHALL create a new semantic version and hash. A reviewed/deployed tuple SHALL NOT be repointed to different bytes or reused for another asset.

#### Scenario: Canonical bytes change under an existing tuple
- **WHEN** recomputed canonical manifest bytes differ from an existing tuple
- **THEN** validation fails until a new semantic version, hash, review, and affected corpus bindings are supplied

#### Scenario: Manifest content matches runtime composition
- **WHEN** canonical assets are rendered and transformation policies are conformance-checked
- **THEN** each computed SHA-256 hash exactly matches the manifest tuple consumed by runtime provenance

#### Scenario: Runtime values change only placeholders
- **WHEN** patient, consultation, round, validation, or tool-result values change without changing static canonical behavior
- **THEN** manifest versions and hashes remain unchanged

### Requirement: Clinician review decisions are exact, append-only, and human-approved

Each review record SHALL be schema-validated, append-only, and bound to one exact `promptId`/`version`/`contentHash` tuple. It SHALL contain a unique opaque `reviewId`; reviewer identity; explicitly attested credentials, license, jurisdiction, and specialty; an `attested_not_verified` marker; review scope, dependency scope, exclusions, and limitations; non-empty versioned sources; review date; status (`approved`, `changes_requested`, `rejected`, or `withdrawn`); a superseded-review link or null; and a re-review date. A correction, status change, withdrawal, replacement, or periodic re-review SHALL append a linked record and SHALL NOT edit or delete history.

An actual qualified clinician SHALL personally approve the exact production asset and declared dependencies. Automation MAY verify structure, hashes, links, declared status/scope, dates, corpora, and gate results, but SHALL NOT fabricate identity/credential fields, claim to verify credentials, or treat structural validity as reviewer qualification. A named human release owner SHALL acknowledge actual approval before activation.

#### Scenario: Structurally valid credential attestations are read
- **WHEN** CI validates required identity, credential, license, jurisdiction, and specialty fields
- **THEN** it treats them as attested but unverified and makes no credential-authentication claim

#### Scenario: Review changes or expires
- **WHEN** approval is replaced, withdrawn, corrected, renewed, or reaches its re-review date
- **THEN** a new record links to the superseded record and prior history remains unchanged

#### Scenario: Generated approval is presented
- **WHEN** a fixture, placeholder, seed, CI process, or AI-generated identity purports to approve an asset
- **THEN** the human release gate remains unsatisfied

### Requirement: The toxicology correction uses a narrow clinician-approved fast path

The toxicology correction SHALL be prepared as exact canonical candidate bytes before activation. Its approval scope SHALL cover the candidate plus applicable `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, `workflow.context-packer`, tool-output-transform, and medical/adversarial corpus dependency hashes. The clinical scope SHALL address the separation of muscarinic mushroom poisoning from *Amanita muscaria* ibotenic acid/muscimol toxicity and poison-control/emergency escalation using the qualified clinician's approved wording and versioned sources.

The correction SHALL NOT activate until an actual appropriately scoped clinician supplies an `approved` record for known exact tuples and a named human acknowledges the release. Bootstrap may leave unrelated legacy usage metadata `unreviewed` or `unknown`, but the release SHALL identify that residual state, SHALL NOT claim whole-system review, and SHALL NOT bundle an unrelated unapproved prompt change.

#### Scenario: Candidate or dependency is unknown
- **WHEN** the candidate, a required transform dependency, or a corpus binding has an unknown, stale, generated, rejected, expired, or mismatched approval/hash
- **THEN** the correction is not activated despite urgency

#### Scenario: Exact fast-path bundle is approved
- **WHEN** exact candidate/dependency hashes and bound corpora have applicable opaque approvals plus named human release acknowledgment
- **THEN** the isolated correction may deploy with residual unreviewed/unknown legacy scope recorded

### Requirement: Final report generation uses one bounded state machine

The CMO decision schema SHALL contain consultation requests and a synthesis-ready decision but SHALL NOT contain an inline final report. Every synthesis trigger SHALL first run the execution-owned minimum-evidence gate. A trigger below `MIN_SUCCESSFUL_CONSULTATIONS` or whose final context cannot retain a bounded representation for every succeeded consultation SHALL return `REPORT_INSUFFICIENT_EVIDENCE` without creating a `final_report` generation or consuming a report model step. A trigger that passes SHALL freeze the eligible context/evidence catalog, create one generation with purpose `final_report`, and invoke exactly one `Agent.generate` attempt with phase `initial`. A valid initial candidate SHALL complete without correction. Any generation, empty-response, schema, or evidence-validation failure SHALL invoke exactly one bounded attempt with phase `correction` using bounded issue codes and the frozen catalog. Initial and correction operations SHALL NOT have additional provider retry loops, and no third report candidate or bypass path SHALL exist.

The initial attempt SHALL use a child deadline and internal bounded settlement grace that fit inside its reserved time window. If it does not settle, the workflow SHALL terminalize and seal the initial attempt scope, attach detached settlement handlers, ignore every late callback or mutation from that scope, and preserve the correction attempt's reserved model step and time before correction begins. Model steps SHALL use zero-based positions and budget class `report_initial` or `report_correction` as applicable.

A valid correction may become `available`; an invalid/empty/failed correction SHALL produce `generation_failed`. Cancellation and timeout SHALL remain failed workflows rather than completed report outcomes.

#### Scenario: CMO declares synthesis ready
- **WHEN** a decision attempt indicates that no more consultations are needed
- **THEN** it emits no report content and the workflow runs the minimum-evidence gate before either returning `REPORT_INSUFFICIENT_EVIDENCE` or starting the centralized initial report attempt

#### Scenario: Initial report is valid
- **WHEN** the initial candidate passes all report and provenance validators
- **THEN** it becomes available and no correction attempt runs

#### Scenario: Initial report is invalid
- **WHEN** the initial operation fails, is empty, or yields any invalid candidate
- **THEN** exactly one correction operation runs and no retry wrapper or additional correction can create another report candidate

#### Scenario: Correction remains invalid
- **WHEN** the bounded correction operation fails or does not pass validation
- **THEN** the completed outcome is `generation_failed` and contains no candidate medical report

### Requirement: PromptAssetUsageV1 is the single attempt-linked usage schema

The clinician-review and evidence-ledger implementations SHALL use one shared strict `PromptAssetUsageV1`. Each record SHALL contain namespaced `promptAssetUsageId`; `promptId`; `version`; `contentHash`; `reviewStatus` (`approved`, `unreviewed`, or `unknown`); `reviewId`; structured `LedgerActor`; required namespaced `attemptId`; optional namespaced `consultationId`; optional namespaced `toolCallId`; and `executionStatus` (`started`, `succeeded`, `failed`, or `cancelled`). A non-tool asset SHALL have exactly one usage per `(attemptId, promptId)`. A `tool.<toolId>.model-output` asset SHALL have exactly one usage per tool call, so repeated calls within one attempt SHALL create distinct usage IDs and tool-call links. `attemptId`, actor, optional consultation, and execution status SHALL exactly mirror the linked model-attempt record; every retry SHALL receive a distinct attempt ID. `toolCallId` SHALL appear only for `tool.<toolId>.model-output` and SHALL reciprocally match that tool record's `modelOutputAssetUsageId`, including calls that throw, are cancelled, or produce no delivered output.

Manifest identity and review state SHALL be snapshotted at attempt start. Non-tool usages SHALL be created before `Agent.generate` dispatch. A tool-output usage SHALL be created from that snapshot when the application mints its `toolCallId` and before executor invocation, so the reciprocal link exists without requiring a tool ID before dispatch or claiming that output was delivered.

`version` and `contentHash` SHALL be copied as a pair from immutable canonical manifest identity at attempt start or SHALL both be the literal `unknown` only when that identity is unavailable; a mixed pair is invalid. `reviewStatus` and `reviewId` SHALL be resolved separately at attempt start from the active applicable append-only review records. When manifest identity is known but review lookup is unavailable, the known pair SHALL be retained with `reviewStatus: unknown` and `reviewId: "unknown"`. The review invariant SHALL be:

- `approved` requires known version/hash and an opaque non-`unknown` review ID;
- `unreviewed` requires known version/hash and `reviewId: null`; and
- `unknown` requires `reviewId: "unknown"`.

Known non-approving, expired, withdrawn, rejected, changes-requested, or absent active review state SHALL map to `unreviewed`, not `approved`. Unknown manifest identity SHALL NOT satisfy approval, toxicology, corpus, or post-migration production gates. Reviewer identity and credentials SHALL NOT be copied into usage provenance.

#### Scenario: One generation uses multiple assets
- **WHEN** an `Agent.generate` operation composes base instructions, workflow template, encoder/packer, schema, and tool assets
- **THEN** each usage record has the same required attempt ID/actor/status while retaining its own exact manifest/review identity

#### Scenario: Attempt status changes
- **WHEN** a linked model attempt transitions from started to succeeded, failed, or cancelled
- **THEN** every usage record for that attempt mirrors the same execution status

#### Scenario: Approved review linkage is emitted
- **WHEN** an applicable active approval exists for known canonical manifest bytes
- **THEN** usage records `reviewStatus: approved` with the opaque review ID and exact version/hash

#### Scenario: Review absence is known
- **WHEN** lookup confirms no applicable active approval
- **THEN** usage records `reviewStatus: unreviewed` and `reviewId: null` without fabricating a review link

#### Scenario: Manifest identity is unavailable during bootstrap
- **WHEN** canonical manifest identity cannot be resolved during permitted bootstrap operation
- **THEN** version and hash use the all-unknown identity pair, review state is unknown, and the record cannot satisfy an approval-dependent gate

#### Scenario: Review lookup is unavailable for known identity
- **WHEN** canonical manifest version/hash are known but active review lookup is unavailable
- **THEN** the known identity remains recorded with `reviewStatus: unknown` and `reviewId: "unknown"`

### Requirement: Prompt usage retention follows completed job retention only

Completed `available` and `generation_failed` outcomes SHALL retain sealed `PromptAssetUsageV1` records only inside their provenance object and SHALL scrub/delete them with the job result under terminal `JOB_TTL_MS`. If a workflow ends as cancelled, timed out, or otherwise failed, its prompt usage SHALL remain in memory only until workflow settlement and SHALL then be discarded.

Failed-workflow usage SHALL NOT be copied to an audit path, progress history, application/audit logs, tool cache, or another durable store. Logs for these terminal paths SHALL be limited to aggregate counts and stable codes and SHALL NOT contain usage rows, prompt/review IDs, attempt/consultation IDs, or hashes.

#### Scenario: Report generation fails safely
- **WHEN** the bounded correction exhausts and returns completed `generation_failed`
- **THEN** its provenance is stored with that completed result and expires under `JOB_TTL_MS`

#### Scenario: Workflow is cancelled
- **WHEN** cancellation propagates as a failed workflow
- **THEN** in-memory prompt usage is discarded after settlement and no durable provenance/audit copy is created

#### Scenario: Failed workflow is logged
- **WHEN** aggregate diagnostics are emitted for a cancelled, timed-out, or unrecoverable workflow
- **THEN** logs contain counts and stable codes only

### Requirement: Medical and adversarial corpora are bound to exact static dependencies

Medical and adversarial corpora SHALL be schema-validated. Medical cases SHALL be clinician-owned and contain positive and negative expectations. Adversarial cases SHALL cover model-input/output boundary attacks, malicious patient/consultation/tool content, serializer ambiguity, cap/omission bypass, and prohibited-field leakage. Every case SHALL include a stable case ID, corpus-entry hash, opaque review IDs, expected result, versioned sources when applicable, and exact IDs/versions/hashes for all applicable prompt/templates, `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, `workflow.context-packer`, and `tool.<toolId>.model-output` transforms.

Unknown dependency identity or review linkage SHALL NOT satisfy a corpus gate. A dependency hash change SHALL fail the case until its owners update and re-review the binding. Corpus fixtures SHALL contain opaque review IDs only, not reviewer identities or credentials. Passing SHALL be described as finite reviewed regression coverage, not proof of complete/ongoing clinical correctness or protection against all adversarial inputs.

Every new test file SHALL be classified exactly once in the authoritative exhaustive test manifest and run in the appropriate normal non-live CI profile. A separate hand-maintained package test-file list SHALL NOT be introduced.

#### Scenario: Encoder or tool transform changes
- **WHEN** a bound `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, `workflow.context-packer`, or tool-output-transform hash changes while corpus bindings do not
- **THEN** normal CI fails until the applicable corpus is updated and re-reviewed

#### Scenario: False medical association returns
- **WHEN** a toxicology asset again contains the reviewed prohibited mushroom association
- **THEN** a hash-bound clinician-owned negative case fails

#### Scenario: Adversarial content crosses a boundary
- **WHEN** malicious patient, consultation, or tool content bypasses the reviewed encoder/serializer/packer/transform expectation
- **THEN** the bound adversarial case fails

#### Scenario: New test is omitted from the manifest
- **WHEN** a governance, state-machine, medical, or adversarial test file is added without authoritative manifest classification
- **THEN** exhaustive test discovery fails before test selection

### Requirement: Release and rollback preserve history and compose all gates

Every production activation SHALL append a schema-validated deployment record containing deployment identity/action/environment/release/time/human actor/reason, manifest hash, exact asset/review/corpus selections, human-gate acknowledgment, and prior-deployment linkage. Release eligibility SHALL require all gates applicable at activation time.

A rollback SHALL select a historical exact tuple but SHALL re-evaluate the conjunction of all current clinical review/re-review, medical/adversarial corpus, manifest/hash, security, privacy, dependency, schema/wire compatibility, migration/drain, shared evidence-source-label adoption, coordinated `export-privacy-and-disclaimer` frontend compatibility, exhaustive-test-manifest, CI, and other release gates. Prior approval or deployment SHALL NOT bypass a current gate. An eligible rollback SHALL append a linked `rollback` deployment event and SHALL NOT delete, mutate, or source-control-revert review/deployment history.

#### Scenario: Historical tuple passes current gates
- **WHEN** a rollback target satisfies every gate effective at rollback time
- **THEN** operators may append a rollback deployment event while retaining all intervening history

#### Scenario: Security or release gate blocks rollback
- **WHEN** any current gate rejects the historical tuple or deployment combination
- **THEN** rollback remains blocked until remediation and any required new review/deployment records are appended

#### Scenario: Rollback attempts to remove history
- **WHEN** a rollback diff deletes or edits an existing review or deployment record
- **THEN** append-only validation fails
