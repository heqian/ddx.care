## 1. Exact Encoder and Generic Serializer

- [ ] 1.1 Implement the pure `encodeUntrustedText` operation (`JSON.stringify`, then raw `<`, `>`, `&`, U+2028, and U+2029 replacements) with no normalization, selection, truncation, or lossy sanitization
- [ ] 1.2 Preserve valid UTF-16 surrogate pairs and lone high/low surrogates exactly through encoder input, JSON output, parsing, and raw-selection boundaries
- [ ] 1.3 Coordinate the shared contract slice with `evidence-provenance-ledger` and `consultation-budget-enforcement`, then implement one canonical generic JSON-envelope serializer with deterministic key ordering, UTF-8/LF rules, envelope-level `sourceRecordId`/typed owner, and exact `sourceFragmentId`, offsets/unit, and independently encoded text on every fragment; do not require either complete behavioral change first
- [ ] 1.4 Remove any source-specific untrusted wrapper assumptions and assert no `<untrusted_consult>` or `<untrusted_tool>` token is emitted or parsed
- [ ] 1.5 Update `buildPatientSummary` to preserve trusted guard/resume instructions and one `<patient_data>` pair around a valid JSON array of generic envelopes

## 2. Source-Aware Context Packing

- [ ] 2.1 Replace free-form `contextHistory` with typed raw source candidates and make one packer return structured messages plus authoritative `visibleSources`
- [ ] 2.2 Bound patient fields as raw prefixes before source selection, reserve trusted notice/envelope overhead, and keep truncation notices outside patient source offsets
- [ ] 2.3 Implement contiguous prefix-only selection for accepted consultation responses, medical history, conversation, CMO directives, and any deliberately model-visible dynamic failure detail
- [ ] 2.4 Implement lab head/tail selection from complete evidence-catalog line fragments, preserving original UTF-16 offsets/order, avoiding duplicates, separately encoding each fragment, and emitting one trusted middle-omission notice
- [ ] 2.5 Make the packer reselect raw non-tool fragments or omit complete envelopes when budgets are exceeded; reuse eligible complete tool envelopes byte-for-byte and never slice or reserialize encoded JSON, escapes, messages, surrogate pairs, or patient boundaries
- [ ] 2.6 Derive the report-source catalog from the intersection of packed visible sources and evidence-ledger eligibility so omitted sources cannot be cited
- [ ] 2.7 Update `none`, `prior_rounds`, `cmo_curated`, and `full` message construction to use the generic serializer and packer without appending raw or pre-encoded history
- [ ] 2.8 Add the untrusted-evidence policy to CMO and specialist system instructions while keeping missing/failed/cancelled consultations as typed execution facts, not consultation text

## 3. Centralized Report Generation

- [ ] 3.1 Remove inline `finalReport` from the CMO decision schema, descriptions, prompts, parsers, and mocks so decisions contain only consultation requests and synthesis readiness
- [ ] 3.2 Freeze the packed visible eligible catalog and disable tools before report synthesis, retaining earlier delivered eligible CMO/specialist tool sources
- [ ] 3.3 Route every synthesis trigger through the minimum-evidence gate; only passing triggers create one `final_report` generation and an `initial` attempt with zero-based `report_initial` model step plus the shared schema/source validator
- [ ] 3.4 Give the initial attempt a child deadline and internal settlement grace; terminalize/seal and detach unresolved work with late-hook suppression before exactly one `correction` attempt with zero-based `report_correction` step, trusted bounded issue codes/paths, and unchanged frozen catalog
- [ ] 3.5 Return only `generation_failed` with no candidate medical content when correction fails/remains invalid, while preserving cancellation and timeout propagation

## 4. Tool Safe Output and Evidence Delivery

- [ ] 4.1 Implement canonical safe tool-output packing with per-tool allowlists, clinical priorities, complete generic envelopes, omission counts, and the 8,000-character cap
- [ ] 4.2 Define the shared terminal recorder axes `executionStatus`, `transformStatus`, and `deliveryStatus` plus strict nullable raw-result/complete-safe-envelope SHA-256 digests, stable execution/transform/delivery codes, and reciprocal model-output asset usage linkage
- [ ] 4.3 Add `toModelOutput` to drug lookup, drug interaction, and spelling tools while preserving all interaction checks, status, coverage, source limitation, and bounded findings
- [ ] 4.4 Add `toModelOutput` to all seven OpenFDA tools with documented clinical priorities, caps, limitations, and typed failure output
- [ ] 4.5 Add `toModelOutput` to ClinicalTrials.gov and MedlinePlus with bounded eligibility/summaries, identifiers, status, URLs, and no-result/failure state
- [ ] 4.6 Add `toModelOutput` to Orphadata, HPO, and LOINC tools with bounded code/name associations, totals, omission counts, and no-result/failure state
- [ ] 4.7 Map typed `ok: false`, thrown executor, invalid/throwing transform, and cancellation paths across all three axes; permit canonical fail-safe fallback delivery without changing the failed execution/transform axis or exposing raw stack/provider text
- [ ] 4.8 Record `delivered` only when exact non-null safe envelope bytes enter a subsequent model request and require succeeded execution, succeeded transform, delivered status, reciprocal model-output asset linkage, `safeModelOutputDigest` equality with the byte-reused visible source record's complete-envelope hash, at least one retained child fragment, and allowlisted public IDs for source eligibility
- [ ] 4.9 Keep `summarizeToolResult`, hooks, and progress events separate from model transformation, delivery evidence, safe-output digest, and source eligibility

## 5. External Tool Response Transport

- [ ] 5.1 Add `MAX_TOOL_RESPONSE_BYTES = 2,000,000` and bounded streaming readers to `fetchJSON` and `fetchText` that reject declared or actual external-response overflow before parsing or caching
- [ ] 5.2 Map external response overflow to a typed ineligible tool failure and confirm partial bodies never reach cache, transformation, model context, or evidence

## 6. Deterministic Regression Tests

- [ ] 6.1 Add exact encoder round-trip cases for controls, NUL, CRLF, quotes, slashes, emoji, combining/bidi text, U+2028/U+2029, delimiters, valid pairs, and lone high/low UTF-16 surrogates
- [ ] 6.2 Assert canonical generic envelopes for every source type with envelope-level `sourceRecordId`/typed owner and exact fragment-level `sourceFragmentId`/offsets/text, no source-specific XML wrappers, valid patient interior JSON, and exactly one literal trusted `</patient_data>`
- [ ] 6.3 Test packer budget reservation and raw reselection under worst-case escape expansion without any encoded slice
- [ ] 6.4 Test consultation truncation is always a contiguous source-mapped prefix from offset zero, including valid-pair and lone-surrogate boundaries
- [ ] 6.5 Test lab head/tail selection uses complete source-catalog line fragments with original offsets/order, separate encoding, no duplicates, and a trusted omission notice
- [ ] 6.6 Test every indirect source/context mode plus visible-source intersection, ineligible failures/directives, and exclusion of omitted ledger sources
- [ ] 6.7 Test every tool's success/typed failure/thrown executor/transform failure/cancellation across all three axes, digest nullability, delivered/not-delivered fail-safe fallback, clinical fields, progress separation, and exact source eligibility
- [ ] 6.8 Test CMO decision output rejects inline `finalReport`, initial valid report succeeds, each initial failure class consumes exactly one correction, corrected success is accepted, and correction exhaustion returns only `generation_failed`
- [ ] 6.9 Test oversized external JSON/text responses with accurate, missing, malformed, negative, and understated lengths for cancellation, typed failure, and no partial parse/cache/model/evidence

## 7. Governance, Evaluation, and Cumulative Release

- [ ] 7.1 Register `security.untrusted-text.encoder`, `security.untrusted-envelope.serializer`, and `workflow.context-packer` as exact versioned/hash-bound governed assets
- [ ] 7.2 Register every `tool.<id>.model-output` allowlist/priority/cap/failure recipe and affected system/template asset with immutable version/hash, then resolve active applicable append-only review status/ID separately
- [ ] 7.3 Record exact safety-asset tuples per generation/tool delivery in evidence provenance while keeping output-specific `safeModelOutputDigest` separate from static asset hashes
- [ ] 7.4 Define corpus `prompt-injection-v1` and rubric `clinical-prompt-injection-rubric-v1` with entry/rubric hashes, review IDs, forbidden actions, visible-source expectations, exact critical facts, and existing score thresholds
- [ ] 7.5 Bind every adversarial run to all effective asset versions/hashes/review IDs, corpus/rubric hashes, settings, and composition; fail on any stale or mismatched binding
- [ ] 7.6 Require provider-returned provider name, resolved model ID, and immutable revision/digest for target and judge, stored separately from configured IDs, with no alias/catalog/default fallback
- [ ] 7.7 Encode all dynamic judge input with the exact encoder and generic envelope and add cases for delimiter/role injection, lone surrogates, consultation/lab selection, source omission, tool failures, and centralized synthesis
- [ ] 7.8 Obtain qualified-clinician approval for the exact corpus, rubric, safety-asset tuples, clinical facts, and review bindings before activation
- [ ] 7.9 Run evaluation Monday 06:00 UTC and manually for relevant changes; fail and alert on threshold, identity, hash, review, provider, or envelope failure
- [ ] 7.10 Enforce cumulative release/rollback eligibility across this gate and every applicable provenance, clinician-review, dependency, image, schema/wire, and release gate; disable affected paths or fix forward when no prior artifact is eligible

## 8. Documentation and Verification

- [ ] 8.1 Update `AGENTS.md` and environment documentation with generic envelopes, source selection/mapping, tool delivery/digests, governed assets, provider identity, external-response limits, and cumulative rollback
- [ ] 8.2 Run `bun run lint`, `bun run typecheck`, and backend workflow, prompt-injection, tool, fetch, provenance, and governance tests after implementation
- [ ] 8.3 Run the exact reviewed adversarial candidate once and record asset/review bindings, provider-authoritative target/judge identities, thresholds, and result
- [ ] 8.4 Exercise rollback by disabling context/tool paths while preserving exact encoding and prove the selected artifact satisfies all cumulative release gates without raw fallback
