## Why

The workflow has no authoritative admission budget, no cap on the sequential model steps Mastra can expose across concurrent agent operations, and no bounded handoff from consultation work to the evidence ledger's two-attempt report gate. Its string-based context packing can also omit succeeded consultations, cite patient text the report model never saw, or cut encoded trust boundaries.

## What Changes

- **Shared execution ownership**: depend explicitly on `evidence-provenance-ledger`. A `RequestBatch` owns every model-requested entry with exactly `admitted|invalid|duplicate|budget_rejected`, a stable `reasonCode`, and a privacy-safe digest instead of an invalid raw ID. A `ConsultationRecord` is created synchronously on admission before scheduling and transitions `admitted -> started -> terminal`, with direct `admitted -> cancelled` before start. Generations, attempts, and model steps use the shared purpose/phase/zero-based-budget-class taxonomy.
- **Deterministic application-side admission**: keep the complete live specialist ID list in the CMO prompt, but parse each structured request ID as a bounded string rather than a schema enum so invalid entries reach `RequestBatch`. Validate IDs against the same live registry, deduplicate within the round, preserve declared clinical-priority order, and synchronously admit only the ordered prefix allowed by remaining round and total capacity.
- **Observable model-step budget**: replace `MAX_TOTAL_PROVIDER_ATTEMPTS` with `MAX_TOTAL_MODEL_STEPS`. Every `Agent.generate` receives an explicit `maxSteps`, and `prepareStep` atomically acquires the workflow-global step before each application-observed sequential LLM step. The budget does not claim to count invisible provider SDK or transport retries.
- **Two-step report reserve**: reserve exactly two model steps and `REPORT_GENERATION_RESERVE_MS` for the `final_report` generation's `initial` and optional `correction` attempts. Both calls use `maxSteps: 1` with no tools. The initial attempt has a child deadline and internal bounded settlement grace; unresolved work is terminalized, sealed, detached, and suppressed before correction starts with its reserved step/time.
- **Bounded settlement handoff**: stop consultation admission before `CONSULTATION_SETTLEMENT_GRACE_MS` plus the report reserve, abort child consultation work, wait only through the grace period, terminalize unresolved child records, seal consultation-owned recorder scopes and the evidence catalog, and safely ignore late hooks without allowing late state, progress, or report mutations.
- **Source-aligned JSON context packing**: use only the exact generic untrusted JSON envelope with envelope-level `sourceRecordId`/typed owner and exact fragment-level `sourceFragmentId`, offsets/unit, and encoded text; this context packer introduces no alternate JSON shape or XML tags. Build evidence only from retained model-visible fragments and require succeeded execution, succeeded transform, delivered exact tool bytes, and matching visible digest for tool eligibility.
- **Dynamic context/configuration validation and v2 rollout**: compute the minimum valid `CMO_CONTEXT_MAX_CHARS` from exact fixed JSON overhead, protected patient fragments, and configured maximum consultations instead of a fixed constant. Strict cross-setting checks cover rounds, per-round and total admissions, minimum successes, two reserved report steps, settlement grace, and report time. Canonical environment names pass through Docker/Compose and documentation. `REPORT_INSUFFICIENT_EVIDENCE` ships with the same coordinated strict outcome-v2 backend, frontend, REST, WebSocket, mock, persistence, and E2E migration.

## Capabilities

### New Capabilities

- `consultation-budget-enforcement`: Enforces request/admission ownership, observable model-step and time reserves, evidence sufficiency, bounded settlement, and source-aligned JSON context budgets.

### Modified Capabilities

- `agent-orchestration-fixes`: Replaces the within-round deduplication requirement with its full budget-aware form while preserving all baseline scenarios and cross-round reconsultation.

## Impact

- **Dependencies**: coordinate one shared implementation slice with `evidence-provenance-ledger` and `patient-data-delimiter-escaping`; land their shared schemas and serializer primitives first within that slice, then integrate and verify recorder, admission, packing, minimum-evidence, and report behavior together without requiring either complete behavioral change first.
- **Backend**: workflow scheduling, Mastra generation options/hooks, evidence recorder integration, configuration, progress/log projections, shared outcome v2, persistence parsing, REST, and WebSocket completion/replay.
- **Frontend and mocks**: strict API/stream parsing, unavailable-report rendering, retry behavior, persisted-job migration fixtures, and mock available/insufficient/validation-failed paths move together in outcome v2. Screen/export source labels come from the evidence-owned shared formatter; the `export-privacy-and-disclaimer` frontend integration deploys in the same drained release and legacy Print/Share is migrated or disabled.
- **Tests and operations**: backend, frontend, REST, WebSocket, progress-store, mock, persisted-job, and E2E coverage; canonical Docker/Compose passthrough; `.env.example`, `README.md`, and `AGENTS.md` updates.
