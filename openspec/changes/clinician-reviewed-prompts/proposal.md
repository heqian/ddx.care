## Why

The known toxicology error demonstrates that reviewing only the 36 specialist modules and the CMO module is not a sufficient safety control. The effective model input also depends on shared factory instructions, the CMO catalog, workflow templates, report schemas, patient/context encoders and packers, tool definitions, and the allowlists, caps, and omission rules that transform tool output before a model sees it.

The toxicology correction is urgent, but shipping plausible text or a generated review record would create false assurance. The exact corrected asset and every model-facing transformation it depends on need stable content identity, actual qualified-clinician approval, and an explicit human release decision.

## What Changes

- Inventory every application-controlled model-facing asset, including specialist and CMO instructions, shared factory text, the CMO catalog rendered from the specialist manifest, exact `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, and `workflow.context-packer` assets, CMO decision and specialist templates, report initial/correction templates, relevant schemas, tool definitions, and versioned `tool.<toolId>.model-output` transformation policies.
- Introduce a prompt asset manifest whose immutable entries use a stable `promptId`, semantic `version`, and SHA-256 `contentHash` over canonical manifest bytes.
- Store schema-validated review records as append-only history, bound to an exact prompt tuple and containing reviewer identity, attested credentials/license/jurisdiction/specialty, review scope, versioned sources, review date, decision status, supersession link, and re-review date.
- Permit automated CI and release checks to validate structure, hashes, links, approval status, and review dates, while prohibiting automation from fabricating or claiming to verify reviewer credentials. Actual qualified-clinician approval remains a human release gate.
- Expedite the toxicology correction only after an actual clinician-approved record is bound to the exact corrected asset and its reviewed dependency/corpus hashes; the narrow bootstrap release must not imply that the remaining prompt surface has been reviewed.
- Define one shared `PromptAssetUsageV1` contract for concrete static-asset use under one `Agent.generate` attempt, with one non-tool usage per asset/attempt and one distinct model-output usage per tool call, plus unique usage identity, immutable manifest identity, separately resolved active-review state, structured actor, required attempt linkage, optional consultation linkage, reciprocal tool-call linkage, and execution status matching the attempt ledger.
- Centralize final synthesis under one `final_report` generation: CMO decisions cannot contain an inline report; the workflow makes one `initial` attempt and, only when it fails validation or generation, exactly one bounded `correction` attempt. A bounded initial-attempt handoff seals and detaches uncooperative initial work before correction starts.
- Persist prompt usage only inside completed `available` or `generation_failed` outcomes under the existing terminal `JOB_TTL_MS`. Failed or cancelled workflow provenance remains in memory until the workflow ends and is then discarded; logs contain aggregate counts and stable codes only.
- Add hash-bound adversarial and clinician-owned medical corpora whose dependency sets include exact prompt tuples, `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, `workflow.context-packer`, and tool-output-transform hashes plus opaque review IDs. New tests register exactly once in the authoritative exhaustive test manifest and run in normal CI.
- Preserve review and deployment history through release and rollback. Rollback eligibility is the conjunction of all current clinical, security, test, privacy, compatibility, and release gates; rollback never deletes or rewrites prior records.

## Capabilities

### New Capabilities

- `clinician-reviewed-prompts`: Governs the complete effective prompt surface with content-addressed assets, append-only review, human release gates, attempt-level usage provenance, bounded report synthesis, reviewed corpora, and non-destructive rollback history.

## Impact

- **Prompt assembly**: specialist modules, `src/backend/agents/factory.ts`, `src/backend/agents/manifest.ts`, `src/backend/agents/chief-medical-officer.ts`, and prompt-producing/encoding/context/report-state-machine sections of `src/backend/workflows/diagnostic-workflow.ts`.
- **Model-visible tool contracts**: tool IDs/descriptions/input schemas and per-tool output transformation policies under `src/backend/tools/`.
- **Shared contracts and retention**: `PromptAssetUsageV1` in the strict shared provenance/report schema, coordinated with `evidence-provenance-ledger` and retained only in completed job outcomes under `JOB_TTL_MS`.
- **Governance and release**: prompt manifest, append-only review/deployment records, CI/release validation, human approvals, and rollback eligibility checks.
- **Tests**: adversarial and medical corpora plus governance/state-machine/provenance tests classified by the authoritative test manifest from `test-integrity-and-hermeticity`.
