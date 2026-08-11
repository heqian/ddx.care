## Context

The application does not send only the 36 specialist instruction strings and the CMO instruction string to models. `createSpecialistAgent()` appends shared medical-tool instructions; the CMO interpolates a catalog rendered from `specialistManifest`; the workflow encodes patient data, serializes and packs prior context, constructs CMO/specialist/report prompts, and injects structured schemas; assigned tools contribute model-visible definitions and normalized output. Allowlist, cap, ordering, truncation, and omission behavior can change what the model sees even when prompt text is unchanged.

The related `evidence-provenance-ledger` change owns structured actors, namespaced model-attempt/consultation IDs, attempt lifecycle, completed-outcome provenance, and `JOB_TTL_MS` retention. The related `test-integrity-and-hermeticity` change owns the exhaustive test manifest and runner. This change defines the prompt asset, review, usage, synthesis, and corpus contracts those changes consume. See `proposal.md` for motivation and the delta spec for normative behavior.

## Goals / Non-Goals

**Goals:**
- Discover and govern every static model-facing prompt, encoding, context, schema, tool-definition, and tool-output-transformation component.
- Make approved content unambiguous through immutable `promptId`/`version`/`contentHash` identity over canonical manifest bytes.
- Keep clinician decisions and deployments append-only, schema-valid, attributable, and time-bound.
- Separate mechanical validation from the human judgment that a reviewer is qualified and exact content is clinically acceptable.
- Ship the toxicology safety correction through a narrowly scoped, genuinely clinician-approved fast path.
- Use one strict `PromptAssetUsageV1` schema linked to exactly one execution-owned model attempt.
- Ensure every final report enters one centralized initial/correction state machine.
- Bind medical and adversarial regression claims to all static transformations that can affect the tested model input/output.

**Non-Goals:**
- Automating clinician credential verification, credentialing reviewers, or representing an attestation as independently verified.
- Claiming that a static corpus or past approval proves complete or ongoing clinical correctness.
- Hashing patient data, prior consultation text, model output, or other PHI-bearing runtime substitutions into the manifest.
- Persisting provenance for workflows that end in cancellation, timeout, or unrecoverable failure.
- Reviewing upstream medical-tool source data as prompt content; source/evidence provenance remains owned by the evidence ledger.
- Guaranteeing deterministic model replay or replacing prompts with a clinical knowledge base.

## Decisions

### D1: Govern the effective prompt as composable assets

**Decision:** A prompt asset is a stable, application-controlled static unit whose text or deterministic transformation changes model-visible instructions, context, schema, tools, or tool output. Completeness is discovery-based, not a count of agent modules. Initial stable ID namespaces and boundaries are:

| Prompt ID pattern | Canonical asset boundary |
| --- | --- |
| `agent.specialist.<specialistId>.instructions` | One specialist's base instructions |
| `agent.specialist.<specialistId>.description` | A separately model-visible specialist description |
| `agent.cmo.instructions` | CMO base instructions, with composed assets represented by placeholders |
| `shared.specialist.tool-instructions` | Shared instructions appended by the specialist factory |
| `catalog.cmo.specialists` | Deterministic catalog rendered from manifest categories, IDs, names, and descriptions |
| `security.untrusted-text.encoder` | Exact escaping behavior used to encode selected patient or workflow fragments for a model |
| `security.untrusted-envelope.serializer` | Exact generic JSON envelope, labels, key ordering, separators, and fragment representation rules |
| `workflow.context-packer` | Context selection, ordering, caps, truncation, omission, and visible-source mapping semantics for history and frozen evidence catalogs |
| `workflow.cmo.round-decision` | CMO decision template and context-mode instructions; it cannot carry report content |
| `workflow.specialist.consultation` | Specialist request template |
| `workflow.report.initial` | The one centralized initial structured-report template |
| `workflow.report.correction` | The one bounded correction template and bounded issue-code format |
| `schema.cmo.round-decision` | Model-facing decision schema without an inline final-report field |
| `schema.cmo.final-report` | Complete model-facing report schema and descriptions |
| `tool.<toolId>.definition` | Tool ID, description, and complete model-facing input schema |
| `tool.<toolId>.model-output` | Exact output allowlist, field mapping, ordering, caps, truncation, omission, `unknown`, no-result, error, and limitation semantics applied before tool output returns to a model |

Every tool available to an agent has a `model-output` asset, including an explicit pass-through policy if no fields are transformed. Static fragments added later receive their own stable ID or become part of a documented boundary. Runtime patient values, consultation text, round numbers, validation details, and tool results are placeholders or inputs to these assets and never become manifest content.

**Rationale:** Model behavior depends on the bytes and deterministic omissions it receives. Reviewing prompt prose while leaving context packing or tool output transforms unversioned leaves an equally influential surface unaudited.

### D2: Hash immutable canonical manifest bytes

**Decision:** Each schema-validated manifest entry records at least:

```text
promptId: stable identifier that is never renamed or reused
version: SemVer without a leading "v"
contentHash: "sha256:" plus 64 lowercase hexadecimal characters
kind: agent, shared, catalog, encoder, serializer, context-packer, workflow, schema, tool-definition, or tool-output
source: deterministic source locator or generated-asset recipe
actors: actors or actor classes that can receive the asset
canonicalPayload: exact static text or deterministic declarative behavior payload
```

`contentHash` is SHA-256 over the entry's canonical payload bytes, excluding mutable registry/review fields and the hash field itself. Text uses UTF-8, LF line endings, fixed placeholder tokens, and no implicit trimming. Declarative encoder, serializer, packer, schema, tool-definition, and tool-output payloads use deterministic key ordering and serialization. Runtime composition and transforms consume or conformance-check the same payload represented by the manifest.

Any canonical byte change requires a new semantic version and hash. Every change requires review regardless of SemVer class. Once reviewed or deployed, a tuple is immutable and retained; an ID/version cannot be repointed to different bytes. Framework-generated static wrappers that are model-visible must be materialized as assets or make validation fail closed.

**Rationale:** The version communicates change intent; the hash binds exact canonical behavior. Hashing source files or rendered patient-bearing prompts would either include irrelevant implementation bytes or persist sensitive dynamic content.

### D3: Store review decisions as append-only exact bindings

**Decision:** Review records are separate from prompt source and append-only. Their schema contains:

```text
reviewId: globally unique opaque stable ID
promptId, version, contentHash: exact manifest tuple reviewed
reviewerIdentity: reviewer name/stable identity and optional organization
credentialsAttested: non-empty credential list
licenseAttested: license type and identifier as attested by the reviewer
jurisdictionAttested: licensing jurisdiction as attested by the reviewer
specialtyAttested: clinical specialty relevant to the review scope
credentialVerification: literal "attested_not_verified"
scope: reviewed sections, behavior dependencies, intended use, exclusions, and limitations
sources: non-empty citations with publisher/identifier and edition, revision, or publication version
reviewedAt: ISO-8601 review date/time
status: "approved", "changes_requested", "rejected", or "withdrawn"
supersedesReviewId: earlier review ID or null
reReviewDate: ISO-8601 date by which another clinical review is required
```

Approval applies only to the exact tuple and declared dependency/scope. Corrections, changed decisions, withdrawals, periodic re-review, and replacement approvals append a new record linked through `supersedesReviewId`. Validators enforce unique opaque IDs, tuple existence, chronological acyclic supersession, source versions, non-empty attestations, and a non-expired leaf approval. They reject deletion or modification relative to trusted release history.

**Rationale:** Binding review to version and hash prevents approval from floating to changed bytes; append-only supersession preserves what humans actually decided at each point.

### D4: Keep clinical approval as a real human release gate

**Decision:** CI and release automation may validate schemas, recomputed hashes, links, append-only history, declared approval status/scope, re-review dates, corpora, and gate results. It treats identity/license/credential/jurisdiction/specialty as attestations and must not invent them, use an LLM to complete them, query credential sources and claim verification, or equate valid structure with qualification.

An actual qualified clinician personally reviews the exact canonical asset and dependencies, submits or signs the bound approval, and a named human release owner acknowledges it. Fixtures, placeholders, seeded/generated identities, and CI success cannot satisfy this gate.

For the bootstrap toxicology correction, the candidate, applicable `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, `workflow.context-packer`, tool-output dependencies, and medical/adversarial corpus dependency set are all exact and known before approval. A clinician whose attested scope covers toxicology reviews the candidate and medical cases. The candidate addresses the muscarinic mushroom versus *Amanita muscaria* ibotenic acid/muscimol distinction and poison-control/emergency escalation using the clinician's exact approved wording. Only then can the isolated correction be activated. Residual legacy assets are marked unreviewed/unknown and the release cannot claim whole-system review.

**Rationale:** Urgency justifies narrow sequencing, not fabricated sign-off or an expanded approval claim.

### D5: Use one centralized bounded report state machine

**Decision:** The CMO decision schema contains consultation requests and a synthesis-ready decision only. It has no `finalReport` or other inline report field. CMO decision retries remain distinct model attempts, but none can bypass centralized report generation.

When synthesis is requested, no new consultation is admitted, or the round budget ends, the workflow first runs the execution-owned minimum-evidence gate. If it fails, the workflow returns `REPORT_INSUFFICIENT_EVIDENCE` without creating a final-report generation or consuming a report model step. If it passes, the workflow freezes the eligible context/evidence catalog and creates one `final_report` generation. It invokes `workflow.report.initial` exactly once through an attempt whose phase is `initial`. If that candidate passes the complete structured report/evidence validator, it becomes available and no correction runs. If initial generation fails, is empty, or fails any validator, the workflow invokes `workflow.report.correction` exactly once through a second attempt whose phase is `correction`, with bounded issue codes and the frozen catalog. Neither report operation is wrapped in an additional provider retry loop.

The initial attempt receives a child deadline and an internal settlement grace within its reserved time window. If it ignores abort, the workflow terminalizes and seals that attempt scope, attaches detached settlement handlers, suppresses all late callbacks and mutations, and only then starts correction with its reserved model step and time intact. A valid correction becomes available; any correction failure produces `generation_failed`. Cancellation or timeout of the parent workflow continues to propagate as workflow failure.

The shared taxonomy is: generation purpose `cmo_decision | specialist_consultation | final_report`; attempt phase `initial | retry | correction`; and zero-based model-step position with budget class `non_report | report_initial | report_correction`. A completed report generation has exactly one `initial` attempt and zero or one `correction` attempt; when correction is required, there is exactly one and no third candidate.

**Rationale:** One path removes the current inline-report bypass and makes the correction budget, provenance, corpus dependencies, and clinical gate enforceable for every report.

### D6: Share one strict PromptAssetUsageV1 schema

**Decision:** The clinician-review and evidence-ledger implementations import one shared schema/type rather than defining similar records independently:

```ts
type PromptAssetUsageV1 = {
  promptAssetUsageId: PromptAssetUsageId;
  promptId: string;
  version: SemVer | "unknown";
  contentHash: `sha256:${string}` | "unknown";
  reviewStatus: "approved" | "unreviewed" | "unknown";
  reviewId: ReviewId | null | "unknown";
  actor: LedgerActor;
  attemptId: AttemptId;
  consultationId?: ConsultationId;
  toolCallId?: ToolCallId;
  executionStatus: "started" | "succeeded" | "failed" | "cancelled";
};
```

One record represents one concrete use of one manifest asset under exactly one `Agent.generate` attempt and has its own namespaced `promptAssetUsageId`. Non-tool assets have exactly one usage per `(attemptId, promptId)`. A `tool.<toolId>.model-output` asset instead has exactly one usage per tool call, so repeated calls to the same tool in one attempt create distinct usage rows with the same prompt identity and different `toolCallId` values. All records for an operation share its required `attemptId`; each retry gets a different attempt ID. `actor` is the structured shared `LedgerActor`, is an agent actor for this usage type, and exactly matches the linked model-attempt actor. `consultationId` is present only when the linked attempt has one and must match it. `toolCallId` is present only for the exact model-output policy applicable to that invocation and forms a reciprocal one-to-one link with the tool record's `modelOutputAssetUsageId`; other asset usages omit it. The tool usage exists even when execution throws, is cancelled, or prepares no model output, because it records the governed policy applicable to that call rather than claiming delivery. `executionStatus` always equals the current/final status of the linked model-attempt record.

`version` and `contentHash` are copied together from immutable canonical manifest identity at attempt start or are both `unknown` only when that identity is unavailable; mixed known/unknown pairs are invalid. `reviewStatus` and `reviewId` are resolved separately at attempt start from the active applicable append-only review records and remain the historical execution snapshot. A known manifest pair remains known when review lookup is unavailable. Bootstrap may use the unknown identity pair, but an approved review, hash-bound corpus gate, normal production release after migration, or toxicology fast path cannot. Review invariants are:

- `approved` requires known version/hash and an opaque non-`unknown` `ReviewId` for an applicable active approval.
- `unreviewed` requires known manifest version/hash plus `reviewId: null`, because active-review lookup confirmed no applicable approval.
- `unknown` requires `reviewId: "unknown"` because review lookup state was unavailable; manifest identity remains known when available and uses the all-unknown identity pair only when the manifest itself is unavailable.

Reviewer identity and credentials never enter usage provenance. A changes-requested, rejected, withdrawn, expired, or absent active approval maps to known `unreviewed`, not `approved`.

At attempt start, the recorder snapshots immutable manifest identity and active-review state for the static assets and available tool-output policies. It creates non-tool usage rows before `Agent.generate` dispatch. When `createToolEventHooks` mints a `toolCallId` before executor invocation, it creates that call's model-output usage from the attempt-start snapshot and writes both sides of the reciprocal link before execution. The rows transition with their attempt; a missing delivery remains represented only by the tool delivery axis and does not remove the usage. Completed `available` and `generation_failed` outcomes retain the sealed records only inside provenance in the job result and scrub/delete them under terminal `JOB_TTL_MS`. If a workflow ends as cancelled, timed out, or otherwise failed, its in-memory usage records are discarded when the workflow settles. They are not copied to a job audit path, progress history, audit log, application log, tool cache, or second store. Failure logging is limited to aggregate counts and stable codes, not usage rows, IDs, hashes, or review links.

**Rationale:** Required attempt linkage and mirrored status prevent ambiguous per-agent summaries. Explicit bootstrap unknowns are honest without weakening approval invariants, and completed-result-only persistence matches the evidence ledger's retention boundary.

### D7: Bind medical and adversarial corpora to the whole static dependency set

**Decision:** Both corpora are schema-validated. Medical cases are clinician-owned and retain positive and negative expectations. Adversarial cases cover prompt injection, boundary escaping, malicious consultation/tool content, serializer ambiguity, cap/omission bypass, and prohibited-field leakage. Every case records a stable case ID, corpus-entry hash, opaque review IDs, sources where applicable, expected result, and an exact dependency set containing all applicable:

- prompt/template IDs, versions, and hashes;
- the exact `security.untrusted-text.encoder` and `security.untrusted-envelope.serializer` versions and hashes;
- the exact `workflow.context-packer` version and hash;
- `tool.<toolId>.model-output` IDs, versions, and hashes.

All dependency hashes and opaque review IDs must be concrete; bootstrap `unknown` cannot satisfy a corpus gate. A dependency change makes the case stale until its owners update and re-review it. Review records may contain human identity, but corpus fixtures and report provenance contain only opaque review IDs.

New test files register exactly once in the authoritative typed test manifest owned by `test-integrity-and-hermeticity`, use the appropriate hermetic profile, and execute through normal non-live CI. No second hand-maintained package file list is introduced. Passing cases mean only that reviewed regressions remain guarded; they do not prove clinical completeness, current guidance, security against all attacks, or ongoing correctness.

**Rationale:** A prompt assertion can pass while a changed encoder, packer, or tool transform exposes different content. Binding all relevant static behavior closes that stale-fixture gap.

### D8: Compose rollback eligibility with every current gate

**Decision:** Each production activation appends a schema-validated deployment record containing action (`deploy` or `rollback`), release/environment/time/human actor, manifest hash, exact asset/review/corpus selections, human-gate acknowledgment, prior deployment linkage, and reason.

Rollback selects a historical exact tuple but re-evaluates it under all gates effective at rollback time. Eligibility is the conjunction of prompt/review/re-review, medical and adversarial corpus, manifest/hash, security, privacy, dependency, schema/wire compatibility, migration/drain, evidence-owned shared source-label adoption, coordinated `export-privacy-and-disclaimer` frontend compatibility, exhaustive-test-manifest, CI, and other required release gates. A historical approval or prior successful deployment is never a bypass. If any gate fails, operators remediate and append any new review/deployment records before activation.

An eligible rollback appends a `rollback` deployment event linking failed and target deployments. It never deletes, edits, or source-control-reverts review/deployment history. Expired, withdrawn, superseded, out-of-scope, or security-ineligible assets cannot be reactivated merely because they were previously approved.

**Rationale:** Rollback changes active risk; it must satisfy current controls while preserving the historical evidence needed to understand earlier reports.

## Risks / Trade-offs

- **[Inventory misses generated or transform behavior]** -> Fail closed on unregistered static composition and require an explicit model-output asset for every available tool.
- **[Attested credentials may be false]** -> Label them unverified and require actual clinician plus named release-owner human gates; never claim CI verified credentials.
- **[Canonicalization causes hash churn]** -> Use one canonical renderer for manifest generation, runtime conformance, review packets, provenance, and tests.
- **[Bootstrap unknowns can be mistaken for approval]** -> Enforce the discriminated review invariant and reject unknowns from approval, corpus, toxicology, and post-migration release gates.
- **[Failed workflow history is unavailable after settlement]** -> Accept deliberate data minimization; retain aggregate counts/codes in logs and full provenance only for completed outcomes under `JOB_TTL_MS`.
- **[Static corpora create false assurance]** -> Require medical positive/negative and adversarial cases while stating their finite reviewed scope.
- **[Current gates can prevent emergency rollback]** -> Treat a blocked rollback as evidence that the old artifact is unsafe under current controls; remediate rather than bypassing gates.

## Migration Plan

1. Add canonical manifest payloads with the exact safety IDs, complete discovery, append-only review/deployment schemas, and the shared `PromptAssetUsageV1` contract without claiming the legacy surface is reviewed.
2. Prepare the exact toxicology candidate, transform dependencies, and bound medical/adversarial cases; obtain actual qualified-clinician approval and named human release acknowledgment before the isolated safety deployment.
3. Remove inline report output from CMO decisions and deploy the centralized one-initial/one-bounded-correction state machine with the evidence-ledger wire migration.
4. Complete review for every discovered prompt, encoder, serializer, packer, schema, tool-definition, and tool-output asset; replace bootstrap unknowns before enforcing the baseline production gate.
5. Register all new tests in the authoritative exhaustive test manifest and enforce corpus dependency hashes, state-machine behavior, usage invariants, retention boundaries, and gate composition in normal CI.
6. Deploy backend/frontend strict outcome changes, shared evidence-label screen consumers, and the coordinated `export-privacy-and-disclaimer` frontend integration together after the evidence-ledger drain procedure; migrate or disable legacy Print/Share. Completed outcomes retain provenance under `JOB_TTL_MS`; failed workflows leave no durable provenance copy.
7. For rollback, recalculate every current gate, append required review/remediation records, and append the rollback deployment event without deleting history.
