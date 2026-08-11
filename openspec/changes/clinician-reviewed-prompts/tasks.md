## 1. Governance Schemas and Canonical Manifest

- [ ] 1.1 Define immutable manifest entries with stable `promptId`, SemVer `version`, `sha256:<64 lowercase hex>` `contentHash`, kind, source recipe, actor scope, and canonical payload
- [ ] 1.2 Implement one canonical UTF-8/text and deterministic declarative-payload renderer used by manifest hashing, runtime conformance, review packets, provenance, and tests
- [ ] 1.3 Define append-only review records with exact tuple/dependency binding, opaque review ID, reviewer identity, attested credentials/license/jurisdiction/specialty, `attested_not_verified`, scope, versioned sources, dates, status, and supersession
- [ ] 1.4 Define append-only deployment records with exact asset/review/corpus selections, manifest hash, human acknowledgment, gate results, prior-deployment linkage, reason, and deploy/rollback action
- [ ] 1.5 Validate unique IDs, tuple existence, SemVer/hash integrity, acyclic chronological supersession, applicable approval scope, re-review dates, and immutable trusted history
- [ ] 1.6 Ensure no validator populates, fabricates, externally verifies, or claims to verify clinician identity/credential attestations

## 2. Effective Prompt and Transformation Inventory

- [ ] 2.1 Register every specialist/CMO instruction and separately model-visible description, shared factory instruction, and deterministically rendered CMO catalog
- [ ] 2.2 Extract and register `security.untrusted-text.encoder` with exact escaping behavior
- [ ] 2.3 Extract and register `security.untrusted-envelope.serializer` with exact generic-envelope labels, key ordering, separators, source ownership, and fragment representation rules
- [ ] 2.4 Extract and register `workflow.context-packer` for history and frozen evidence catalogs with exact selection, ordering, caps, truncation, omission, and visible-source mapping semantics
- [ ] 2.5 Register CMO decision and specialist consultation templates plus centralized `workflow.report.initial` and `workflow.report.correction` templates
- [ ] 2.6 Register the complete model-visible CMO decision schema without inline report content and the final-report schema/descriptions
- [ ] 2.7 Register every assigned tool definition and one `tool.<toolId>.model-output` asset covering allowlists, mappings, ordering, caps, truncation, omission, unknown/no-result/error, and limitation semantics
- [ ] 2.8 Add fail-closed discovery/conformance checks for any runtime static component, framework wrapper, or model-output transform absent from the manifest

## 3. Clinician-Approved Toxicology Fast Path

- [ ] 3.1 Assemble versioned clinical sources and prepare exact candidate bytes covering the reviewed mushroom distinction and poison-control/emergency escalation
- [ ] 3.2 Resolve known canonical tuples for the candidate and every applicable `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, `workflow.context-packer`, and tool-output-transform dependency before activation
- [ ] 3.3 Have the reviewing clinician own positive/negative medical cases and review the exact dependency-bound adversarial cases used by the fast path
- [ ] 3.4 HUMAN RELEASE GATE: obtain an actual qualified clinician's append-only approval for the exact candidate/dependency/corpus hashes and record a named human release-owner acknowledgment; no fixture, placeholder, generated identity, or automation may complete this task
- [ ] 3.5 Activate only the approved toxicology correction and append a scoped deployment record identifying residual `unreviewed`/`unknown` legacy assets without a whole-system review claim

## 4. Complete Effective-Asset Review

- [ ] 4.1 Generate PHI-free review packets containing canonical bytes/policies, exact tuple, composition/actor/dependency scope, and versioned sources for every discovered asset
- [ ] 4.2 Arrange qualified-clinician review of specialist, CMO, shared, catalog, workflow, report, schema, encoder, serializer, packer, tool-definition, and tool-output assets according to specialty/scope
- [ ] 4.3 Apply requested corrections as new immutable versions and append approved, changes-requested, rejected, withdrawal, and re-review records without editing history
- [ ] 4.4 Enforce non-expired leaf approval selection and replace bootstrap unknown identity/review states before the post-migration production gate
- [ ] 4.5 Enable production only after every selected effective asset and declared dependency has applicable exact approval plus named human acknowledgment

## 5. Central Report State Machine and PromptAssetUsageV1

- [ ] 5.1 Remove inline `finalReport` from CMO decision prompts/schemas so decisions return only consultation requests and synthesis readiness
- [ ] 5.2 Route every synthesis trigger through the minimum-evidence gate; only passing triggers create one `final_report` generation, one frozen catalog, and exactly one `Agent.generate` attempt with phase `initial`, zero-based model steps, budget class `report_initial`, and no provider retry wrapper
- [ ] 5.3 On any initial generation/empty/schema/evidence failure, bound the initial child deadline and settlement grace, terminalize/seal and detach an uncooperative initial attempt with late-hook suppression, then run exactly one attempt with phase `correction` and budget class `report_correction`; otherwise run no correction
- [ ] 5.4 Define/import one strict shared `PromptAssetUsageV1` schema with unique usage ID, prompt ID, known-or-unknown version/hash pair, reviewStatus/reviewId invariant, structured actor, required attempt ID, optional consultation ID, reciprocal optional tool-call linkage for model-output assets, and mirrored execution status
- [ ] 5.5 Snapshot immutable manifest identity and active applicable append-only review state at each `Agent.generate` start; create one non-tool usage per `(attemptId, promptId)` before dispatch, then create one distinct reciprocal model-output usage per minted `toolCallId` before executor invocation, including repeated, thrown, cancelled, and non-delivered calls
- [ ] 5.6 Enforce `approved` plus opaque ID/known tuple, `unreviewed` plus known tuple/null after confirmed lookup, and `unknown` plus literal unknown review ID; preserve known manifest identity when lookup is unavailable and use the all-unknown identity pair only when manifest identity is unavailable
- [ ] 5.7 Keep actor, optional consultation, and `started|succeeded|failed|cancelled` status exactly synchronized with the linked model-attempt record
- [ ] 5.8 Validate that no rendered prompt, patient/consultation/tool value, reviewer identity/credentials, or provider detail enters prompt usage records

## 6. Completed-Only Retention and Privacy

- [ ] 6.1 Include sealed prompt usage in both completed `available` and `generation_failed` provenance objects stored under terminal `JOB_TTL_MS`
- [ ] 6.2 Keep cancelled/timed-out/unrecoverable workflow prompt usage in memory only and discard it after settlement without copying it to progress, audit, application logs, cache, or another store
- [ ] 6.3 Limit failed-workflow logging to aggregate counts and stable codes and test the absence of usage rows, IDs, hashes, and review links
- [ ] 6.4 Verify terminal job scrub/delete removes completed prompt usage with the result and creates no second durable provenance copy

## 7. Hash-Bound Medical and Adversarial Corpora

- [ ] 7.1 Define corpus schemas with stable case/entry hashes, opaque review IDs, expected outcomes, versioned sources where applicable, and exact dependency tuples
- [ ] 7.2 Bind every case to all applicable prompt/template, `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, `workflow.context-packer`, and `tool.<toolId>.model-output` versions/hashes; reject unknown bindings
- [ ] 7.3 Populate clinician-owned positive/negative medical cases, beginning with required/prohibited toxicology distinctions and escalation behavior
- [ ] 7.4 Populate adversarial cases for injection, boundary escaping, malicious consultation/tool content, serializer ambiguity, cap/omission bypass, and prohibited-field leakage
- [ ] 7.5 Fail cases when any dependency or opaque review binding is stale and require owner review before updating the binding
- [ ] 7.6 Register every new governance/state-machine/corpus test exactly once in the authoritative typed test manifest under the appropriate hermetic profile and normal CI selection
- [ ] 7.7 State in test output/docs that passing cases provide finite reviewed regression coverage, not comprehensive clinical correctness or protection against all attacks

## 8. Release and Non-Destructive Rollback

- [ ] 8.1 Add release checks for manifest/hash integrity, exact active reviews, scope, re-review, corpus bindings, human acknowledgment, append-only history, and every current security/release gate
- [ ] 8.2 Append a deployment record for every activation with exact assets/reviews/corpora, manifest hash, aggregate gate results, release linkage, actor, reason, and human acknowledgment
- [ ] 8.3 Compute rollback eligibility as the conjunction of all current clinical, corpus, security, privacy, dependency, schema/wire, migration/drain, shared evidence-label, coordinated `export-privacy-and-disclaimer` frontend, authoritative-test-manifest, CI, and release gates
- [ ] 8.4 Append an eligible rollback event linking failed/target deployments without deleting, editing, or reverting review/deployment records
- [ ] 8.5 Block rollback and require remediation/new appended review or deployment records when any current gate rejects a historical target

## 9. Documentation and Verification

- [ ] 9.1 Document asset boundaries, canonical bytes, PromptAssetUsageV1 invariants, bootstrap unknowns, report state machine, human gates, retention, corpora limitations, and composed rollback eligibility in `AGENTS.md`
- [ ] 9.2 Add tests for schemas, hash drift, append-only history, review invariants, fast-path isolation, no-inline-report state transitions, exactly-one correction, usage linkage/status, completed-only retention, and log privacy
- [ ] 9.3 Run `bun run lint`, all strict typecheck contracts, and all required authoritative-manifest test profiles after implementation
