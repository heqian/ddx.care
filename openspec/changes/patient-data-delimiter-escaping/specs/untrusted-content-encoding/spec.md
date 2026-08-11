## Purpose

Defines exact, reversible serialization and bounded envelope rules for every untrusted string that crosses into diagnostic model context, including patient, model-derived, failure-derived, and external tool content.

## ADDED Requirements

### Requirement: Untrusted text uses one exact reversible encoder

For every untrusted string `value` inserted into model context, the system SHALL first produce `JSON.stringify(value)` and SHALL then, in order, replace each raw `<` with `\u003c`, `>` with `\u003e`, `&` with `\u0026`, U+2028 with `\u2028`, and U+2029 with `\u2029`. The output SHALL be a complete JSON string literal for which `JSON.parse(encoded) === value`, including when `value` contains a lone high or low UTF-16 surrogate. The encoder SHALL NOT normalize, case-fold, strip, sanitize, decode/re-encode, select, truncate, or otherwise alter the original string. It SHALL accept exact deterministic raw fragments already selected and source-mapped by the context packer.

#### Scenario: Controls, Unicode, and delimiters round-trip exactly
- **WHEN** a string contains NUL and other JSON controls, tabs, CRLF, quotes, forward and backslashes, emoji, combining sequences, bidi controls, U+2028, U+2029, `<`, `>`, `&`, and literal trusted closing delimiters
- **THEN** parsing the encoded JSON string returns the exact original JavaScript string and the encoded form contains no raw `<`, `>`, `&`, U+2028, or U+2029

#### Scenario: Canonically related text is not normalized
- **WHEN** a clinical value contains decomposed characters or compatibility lookalikes
- **THEN** the decoded value preserves the original code-unit sequence rather than replacing it with a normalized form

#### Scenario: Lone surrogate round-trips exactly
- **WHEN** a selected raw fragment contains an unpaired UTF-16 high surrogate or low surrogate
- **THEN** the encoded value is valid well-formed JSON and parsing it restores the same lone surrogate code unit

### Requirement: All untrusted sources use one generic trusted JSON envelope

The system SHALL serialize patient, CMO-directive, consultation, tool, and failure fragments with one canonical trusted JSON-envelope schema containing `envelopeVersion: "1"`, `trust: "untrusted"`, one namespaced envelope-level `sourceRecordId`, one typed trusted owner, and a `fragments` array. Owner SHALL be exactly one of patient plus field, consultation plus `consultationId`, tool plus `toolCallId`, CMO directive plus `generationId`, or failure plus `generationId`, using shared evidence-ledger types. Every fragment SHALL contain its exact namespaced `sourceFragmentId`, trusted UTF-16 start/end offsets or null, offset unit, and a text value that is one complete output of the exact encoder. The serializer SHALL receive already selected fragments, use deterministic key ordering and canonical UTF-8 serialization, and SHALL NOT select, truncate, reorder, merge, or slice content. Eligible evidence SHALL cite `sourceFragmentId`; `sourceRecordId` SHALL NOT substitute for it. No source-specific XML-like wrapper, including `<untrusted_consult>` or `<untrusted_tool>`, SHALL be part of prompt assembly, tests, policies, or downstream parsing.

The patient-data message SHALL contain exactly one trusted `<patient_data>` opening tag and exactly one trusted `</patient_data>` closing tag. Its interior SHALL be one valid JSON array of generic envelopes. Patient-derived text SHALL NOT be used as envelope syntax, source metadata, or trusted notices.

#### Scenario: Patient repeats the trusted closing delimiter
- **WHEN** one or more patient fields contain `</patient_data>` any number of times with following instruction-like text
- **THEN** the assembled message contains exactly one literal `</patient_data>` from trusted code, the interior generic-envelope array parses successfully, and every decoded fragment equals its exact selected raw source fragment

#### Scenario: Consultation uses the generic envelope
- **WHEN** a specialist response is packed for a later model
- **THEN** it uses the same generic JSON schema as patient and tool fragments and no `<untrusted_consult>` token is emitted or required

### Requirement: Every indirect trust boundary uses a structured untrusted envelope

Patient fields, CMO-produced context directives, accepted specialist responses, bounded dynamic failure text deliberately reused in a prompt, tool failure output, and every external tool string sent to a model SHALL cross the boundary in a complete generic JSON envelope identified as untrusted. Structured Mastra message roles SHALL be used where available, but placing content in a user or tool role SHALL NOT upgrade an untrusted payload to trusted instructions. Source identifiers, offsets, digests, and source types SHALL come from trusted workflow records or allowlists; any other dynamic value SHALL use the exact encoder. Raw untrusted strings SHALL NOT be interpolated into application instruction text. Failed, cancelled, missing, or empty consultations SHALL remain typed execution facts and SHALL NOT be converted into consultation-response envelopes.

#### Scenario: CMO directive attempts to control a specialist
- **WHEN** a CMO-generated context directive contains role-switching or instruction-following text
- **THEN** every context mode that forwards the directive sends it as an encoded untrusted payload rather than application instructions

#### Scenario: Specialist response attempts to control a later model
- **WHEN** a specialist response contains a trusted boundary token or claims to be a system message
- **THEN** every CMO or specialist prompt that receives the response contains only its encoded untrusted envelope

#### Scenario: Failure text contains a boundary token
- **WHEN** a specialist, provider, schema, or tool failure message contains delimiter or role-mimicking text and that detail is reused in a later model call
- **THEN** the dynamic failure detail is bounded and encoded while the failure category and surrounding control instruction remain trusted

### Requirement: Context packer owns deterministic selection and visible-source mapping

One context packer SHALL own all raw-fragment selection, budget reservation, complete-envelope packing, and visible-source mapping. It SHALL select before encoding, encode every selected fragment separately, and return structured messages plus a mapping containing only sources whose complete envelopes are visible. It SHALL reserve trusted task, source metadata, envelope/array, frozen-catalog, and notice overhead; SHALL reduce the raw selection or omit whole envelopes when necessary; and SHALL never slice an encoded string, escape sequence, JSON envelope, role message, valid surrogate pair, or patient boundary. A lone UTF-16 surrogate SHALL be treated as a retained one-code-unit value rather than silently removed or paired.

Accepted consultation text SHALL be selected only as a contiguous prefix beginning at raw offset zero. Lab context MAY select complete source-catalog line fragments from the head and tail of the exact bounded lab field. Each lab fragment SHALL retain its original UTF-16 start/end offsets, remain in original order without duplication, and be encoded separately; a trusted omission notice SHALL identify a skipped middle region. The report-generation eligible catalog SHALL include only packed patient fragments, packed succeeded consultations, and packed delivered eligible tool outputs that also satisfy the authoritative evidence ledger. Directives, failures, notices, and omitted records SHALL be explicitly ineligible.

#### Scenario: Escaping expansion reaches the context budget
- **WHEN** a near-limit payload consists of characters such as `<`, `&`, controls, or line separators that expand during encoding
- **THEN** the packer reselects raw fragments, the final message remains within its configured budget, every envelope is complete, and each decoded payload equals its source-mapped raw fragment

#### Scenario: Consultation exceeds its context budget
- **WHEN** an accepted consultation response cannot fit in full
- **THEN** the visible consultation payload is a source-mapped prefix from offset zero and no tail or middle excerpt replaces it

#### Scenario: Lab head and tail are selected
- **WHEN** complete lab line fragments from both ends fit but the middle does not
- **THEN** the packer emits separately encoded head and tail fragments with original offsets and order, one trusted omission notice, and visible-source entries only for emitted fragments

#### Scenario: Valid pair and lone surrogate reach truncation boundary
- **WHEN** raw selection reaches a valid surrogate pair followed elsewhere by a lone surrogate
- **THEN** the pair is not divided, the lone surrogate may be retained as one code unit, and all emitted offsets and decoded fragments remain exact

#### Scenario: Recorded source is omitted from context
- **WHEN** a succeeded ledger source has no complete packed envelope
- **THEN** it is absent from the visible-source map and the frozen report-source catalog and cannot be cited

### Requirement: External tools provide bounded clinically meaningful model output

Every medical tool SHALL transform its raw success or typed failure result at the actual model-facing tool boundary. The model-facing value SHALL be one complete generic untrusted JSON envelope no longer than 8,000 characters, SHALL include only per-tool allowlisted clinical fields, SHALL encode every dynamic string, and SHALL include result totals or omission counts when records or fields are removed. Drug-interaction output SHALL preserve interaction status, coverage, every input check, and the source limitation. Other tools SHALL preserve clinically material identities, statuses, warnings, contraindications, reactions, outcomes, dosing, eligibility, phenotype/code associations, source limitations, and failure/retry state as applicable.

Each terminal tool record SHALL expose three independent axes: execution status (`succeeded`, `failed`, or `cancelled`), transform status (`not_attempted`, `succeeded`, or `failed`), and delivery status (`not_attempted`, `delivered`, or `not_delivered`). `rawResultDigest` SHALL be SHA-256 over a returned canonical raw result and SHALL be null when execution throws or is cancelled before a result. `safeModelOutputDigest` SHALL be SHA-256 over exact complete canonical safe or fail-safe envelope bytes and SHALL be null when none were prepared. Both digests SHALL be detached from the hashed envelope. Delivery SHALL be `delivered` only when exact non-null safe bytes are attached to a subsequent model request. The final context packer SHALL reuse an eligible tool envelope byte-for-byte rather than re-encode or reserialize it. A tool source SHALL be evidence-eligible only when execution succeeded, transform succeeded, delivery occurred, the safe digest equals the complete visible source record's envelope hash, the exact model-output asset usage is linked to the tool call, at least one child fragment is retained, and any public ID is allowlisted.

Typed executor failures SHALL remain execution-failed even when a bounded failure transform succeeds and is delivered. A thrown executor error SHALL remain execution-failed with transform not-attempted and stable `tool_executor_threw`; a shared fail-safe serializer MAY prepare/deliver a generic no-clinical-content fallback. A thrown or invalid transform after successful execution SHALL remain transform-failed with `tool_model_output_transform_failed`; the fail-safe serializer MAY likewise prepare/deliver fallback bytes. These fallbacks SHALL expose their safe digest and delivery status without changing the failed axis, SHALL NOT expose stack/raw provider text, and SHALL NOT be eligible sources. Progress and observability summaries SHALL remain separate and SHALL NOT substitute for transformation, delivery evidence, or safe-output digest.

#### Scenario: Tool returns large instruction-like prose
- **WHEN** a successful external tool result contains oversized prose, boundary tokens, or text resembling system instructions
- **THEN** the agent receives only the complete bounded allowlisted envelope, clinical priority fields and omission counts are retained, and the instruction-like text exists only as encoded data

#### Scenario: Tool fails with untrusted text
- **WHEN** a tool failure contains an external message with delimiter or role-mimicking text
- **THEN** the agent receives a bounded generic failure envelope, the tool record exposes delivery status and its canonical safe-output digest, and the failed call is ineligible evidence

#### Scenario: Executor or transform throws
- **WHEN** a tool executor throws or its model-output transform throws or returns an invalid value
- **THEN** the runtime records the corresponding stable typed failure, prepares a canonical generic fallback envelope and digest, records whether it was delivered, and excludes the tool from eligible sources

#### Scenario: Safe tool output is delivered
- **WHEN** succeeded transformed output is attached to the next model request
- **THEN** delivery status is `delivered`, its digest matches the exact model-visible bytes and visible-source mapping, and the tool may become eligible subject to the evidence-ledger rules

#### Scenario: Progress summary differs from model output
- **WHEN** a tool call completes and emits a progress event
- **THEN** the short progress summary is produced independently and the model receives the per-tool bounded transform rather than the progress summary or raw executor result

### Requirement: External tool response limits reject oversized transport safely

External medical-tool response readers SHALL enforce `MAX_TOOL_RESPONSE_BYTES` against actual streamed bytes. A declared oversize response SHALL be rejected before parsing; a response whose `Content-Length` is absent, malformed, negative, or understated SHALL be stopped and rejected when actual bytes exceed the limit. No partial oversized response SHALL be parsed, cached, transformed, treated as successful, or admitted as evidence.

#### Scenario: External response understates its size
- **WHEN** an external medical API declares a permissible length or no length but streams more than `MAX_TOOL_RESPONSE_BYTES`
- **THEN** the fetch helper cancels the body, does not parse or cache a prefix, and returns a typed transport failure that is transformed only into an ineligible canonical failure envelope
