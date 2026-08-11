## Why

The workflow currently concatenates patient text, CMO-generated directives, specialist responses, failure messages, and external API prose into later model prompts. A literal `</patient_data>` can therefore create a false boundary, and indirect model or tool output can be mistaken for trusted application instructions.

Native `JSON.stringify()` is not sufficient by itself because it does not escape `<`, `>`, or `&`. The system needs one exact, non-normalizing encoder, one generic trusted JSON-envelope serializer, and one source-aware context packer that select raw evidence safely before model ingestion.

## What Changes

- Define one reversible untrusted-text encoder: JSON-encode the exact selected raw string, then replace raw `<`, `>`, `&`, U+2028, and U+2029 with JSON Unicode escapes. `JSON.parse()` recovers the exact original JavaScript string, including lone UTF-16 surrogates; no normalization, stripping, or lossy sanitization is allowed.
- Use one generic trusted JSON-envelope schema for patient, directive, consultation, tool, and failure fragments. Each envelope has one `sourceRecordId` and typed owner; every fragment carries its exact `sourceFragmentId`, UTF-16 offsets/unit, and encoded text. No source-specific XML wrapper such as `<untrusted_consult>` is part of the contract; the inherited patient XML boundary contains generic JSON envelopes.
- Make the context packer the sole owner of raw-fragment selection, budget reservation, complete-envelope packing, and visible-source mapping. Consultation text is selected only as a contiguous prefix; lab context may select complete source-catalog line fragments from the head and tail with original UTF-16 offsets. Every selected fragment is encoded separately, and encoded output is never sliced.
- Put the trust policy in the configured system instructions for both the CMO and every specialist: untrusted envelopes and tool-role content are evidence, never instructions, while clinically relevant facts must still be considered.
- Remove inline `finalReport` from CMO decisions. All synthesis uses one `final_report` generation with an `initial` attempt, exactly one `correction` attempt when needed, a bounded initial-attempt deadline/settlement handoff before correction, and an exhausted `generation_failed` outcome.
- Give every medical tool a bounded, clinically meaningful model-facing `toModelOutput` transform. Tool records expose independent execution, transform, and delivery axes plus strict raw/safe digest nullability. Thrown execution or transform failure may deliver canonical fail-safe bytes but remains failed on its own axis and is never eligible evidence. Progress summaries remain separate.
- Bound external medical-tool response bodies by actual streamed bytes before parsing or caching. Inbound diagnosis-body enforcement remains owned by the existing `body-size-enforcement` capability and is not changed here.
- Add deterministic coverage for exact/lone-surrogate round trips, source-mapped selection, prefix-only consultations, head/tail lab fragments, one trusted patient closing boundary, generic envelopes, tool delivery/digests/failures, and the centralized final-report sequence.
- Register `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, `workflow.context-packer`, and every `tool.<id>.model-output` as exact governed assets. Bind adversarial runs to their hashes and review IDs, the corpus/rubric hashes, and provider-authoritative target/judge identities.
- Make rollback fail closed and cumulative: retain encoding or disable the affected untrusted path, and require the selected rollback release to satisfy this gate together with every other applicable provenance, clinician-review, security, and release-eligibility gate.

## Capabilities

### New Capabilities

- `untrusted-content-encoding`: Exact reversible encoding, generic trusted JSON envelopes, deterministic source-mapped raw selection, complete context packing, bounded/digested tool model output, and external-response transport limits.

### Modified Capabilities

- `prompt-injection-hardening`: Extends the existing patient boundary guard across indirect model/tool boundaries, centralized report generation, deterministic regressions, hash/review-bound adversarial evaluation, and cumulative fail-closed rollback.

## Impact

- **Workflow and agents**: `src/backend/workflows/diagnostic-workflow.ts`, `src/backend/agents/factory.ts`, and `src/backend/agents/chief-medical-officer.ts` for typed source fragments, generic envelopes, visible-source packing, centralized synthesis, and system trust policy.
- **Tools and external transport**: all 17 tool definitions, `src/backend/tools/utils/fetch.ts`, and `src/backend/workflows/tool-event-hooks.ts` for canonical safe model output, evidence-delivery metadata, typed failures, and bounded external responses.
- **Downstream contracts**: coordinates with `evidence-provenance-ledger`, `clinician-reviewed-prompts`, and existing `body-size-enforcement`; it does not duplicate their ledgers, review records, or inbound request-size behavior.
- **Tests and evaluation**: workflow, prompt-injection, tool, and fetch tests plus a versioned scheduled evaluation corpus and harness bound to exact governed assets and provider identities.
- **Operations and documentation**: cumulative release eligibility, scheduled evaluation alerting, rollback controls, governed-asset documentation, and `AGENTS.md`.
