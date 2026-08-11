## Context

`ResultsView` currently has one `handlePrint` path that detects mobile user-agent strings and calls `navigator.share()` instead of `window.print()`. That share call is immediate, contains an unbounded subset of report data, and suppresses all errors. ResultsView and `ConsultNotes` also contain different hard-coded legal warnings.

The print stylesheet hides both warning locations: the ResultsView warning has `data-print-hide`, while the ConsultNotes warning has the `.disclaimer` class explicitly hidden by print CSS. Print media forces both tab panels visible, but collapsed diagnosis detail in ConsultNotes is conditionally unmounted, so the printed result is not a complete report. The current shared outcome schema accepts an empty disclaimer and any string as `generatedAt`.

This change is planned against the breaking strict report outcome v2 owned by `openspec/changes/evidence-provenance-ledger/`. Outcome v2 replaces supporting-evidence strings with `SupportingEvidenceItem { statement, sourceRefs[] }`, adds `executionQuality`, `traceabilityNotice`, and `ProvenanceV1`, rejects legacy outcomes, and owns the shared privacy-safe source-label formatter plus the basic v2 screen renderer. Those schemas and shared presentation primitives are implementation prerequisites for export, but outcome v2 and this export frontend deploy together after the persisted-job drain so strict v2 never passes through the legacy unsafe mobile Print-to-Share path.

The existing `Modal` supplies focus management and a bounded width but not a bounded scroll region for a long payload. The existing API and Caddy CSP allow only self-hosted scripts/connections and block objects; same-document printing and Web Share need no policy change, popup, blob URL, data URL, or inline script. API route tests do not validate that the production Caddyfile parses or adapts to the intended policy, so Caddy needs a separate validation path.

See `proposal.md` for motivation and the delta specs for normative behavior.

## Goals / Non-Goals

**Goals:**
- Make print and share behavior depend only on the selected control and feature support, never a user-agent string.
- Consume only strict evidence outcome v2 and its evidence-owned shared source-label formatter/basic screen renderer while preserving structured evidence statements, degraded execution, and the traceability-not-truth boundary.
- Preserve one exact, versioned disclaimer, scope line, degraded warning, outcome timestamp, and traceability notice through screen rendering, print, and share.
- Produce a complete same-document print representation and an exact, deterministic, bounded share summary with a golden byte fixture.
- Keep errors, titles, filenames, and share metadata free of patient-derived content and job capabilities.
- Preserve the current CSP and prove that no popup or fallback channel is introduced.
- Prevent an unsafe intermediate release, and make rollback safer than the pre-change state by retaining a separately tested safe artifact or fixing forward with Share disabled.

**Non-Goals:**
- Generating or downloading a PDF file in application code.
- Defining outcome v2, validating source eligibility, duplicating the evidence-owned source-label formatter/basic v2 screen renderer, or duplicating the `evidence-provenance-ledger` schema and execution recorder.
- Serializing raw `ProvenanceV1`, source-reference objects, hashes, offsets, execution IDs, URLs, queries, arguments, warning codes, or cache/retrieval metadata into presentation-oriented print/share output.
- Sharing the full report, a URL, an attachment, patient summary, chief complaint, specialist notes, or cross-specialty observations through Web Share.
- Adding clipboard export, a custom print window, watermarking, or a second confirmation before printing.
- Changing diagnosis generation content or the baseline markdown rendering and XSS-sanitization requirement.

## Decisions

### D1: Outcome v2 implementation prerequisite, combined deployment, and shared immutable safety metadata

`evidence-provenance-ledger` is a hard implementation/schema prerequisite. Before export implementation consumes the contract, it provides the strict `available` outcome v2, shared privacy-safe source-label formatter, and basic v2 screen renderer. Export accepts only that strict outcome. A legacy outcome with string evidence or missing `executionQuality`, `traceabilityNotice`, or `ProvenanceV1` is rejected by the shared parser before ResultsView and cannot be decorated or exported.

Outcome v2 and this export frontend are one coordinated release after persisted legacy jobs have drained. Strict v2 must not be deployed first through the legacy frontend that routes mobile Print into immediate Web Share. If infrastructure sequencing makes an intermediate v2 deployment unavoidable, the intermediate frontend disables both Print and Share and exposes no legacy export path; export controls are enabled only after the combined v2-aware frontend is active.

The shared report-outcome module will export these canonical values:

```ts
export const REPORT_DISCLAIMER_VERSION = "v1";
export const REPORT_SCOPE_LINE =
  "AI-generated differential diagnosis - research proof-of-concept only; not for clinical use.";
export const REPORT_DEGRADED_EXECUTION_WARNING =
  "DEGRADED EXECUTION: One or more consultations or cited medical sources failed or were limited. This report may be incomplete.";
export const REPORT_DISCLAIMER =
  "REPORT DISCLAIMER v1: RESEARCH USE ONLY - NOT FOR CLINICAL USE. This report is generated by a proof-of-concept AI system and is not a medical device. It is not HIPAA-compliant and has no regulatory approval. All outputs are AI-generated suggestions with no guarantee of accuracy. Never rely on this report for medical diagnosis, treatment decisions, or patient care. Always consult a qualified healthcare professional. By using this tool, you accept all risk and release the operators from any liability.";
```

The version is embedded in the disclaimer text, so no third outcome version or new wire field is needed. The v2 `formatReport` producer assigns `REPORT_DISCLAIMER`. A future wording change creates a new immutable disclaimer version rather than silently changing `v1`.

The available-outcome schema will require a disclaimer containing at least one non-whitespace character without transforming it, and a valid ISO 8601 datetime for `generatedAt`. The producer remains responsible for emitting the current canonical constant and a UTC `toISOString()` value. Keeping `disclaimer` in the outcome preserves the exact warning associated with a persisted report; the UI never substitutes or paraphrases it.

This change owns report disclaimer/scope/timestamp presentation and integrates it into the evidence-owned basic v2 ResultsView renderer. It renders `outcome.disclaimer` without normalization, `REPORT_SCOPE_LINE`, and the exact ISO text from `outcome.generatedAt`. The basic renderer already owns the degraded-execution and traceability-not-truth screen locations; export preserves those locations, supplies `REPORT_DEGRADED_EXECUTION_WARNING` when `executionQuality.status === "degraded"`, and carries the exact `outcome.traceabilityNotice` into print and Share. The two hard-coded disclaimer copies are removed, and ConsultNotes never invents warning or notice text.

A nonblank historical disclaimer that is not equal to current `REPORT_DISCLAIMER` remains schema-valid and is displayed/printed/shared byte-for-byte from its outcome. Current production emits the current constant, but export does not relabel persisted text. Tests use both current and historical wording plus an exact ISO timestamp to prevent locale formatting or silent substitution.

**Alternatives considered:** Making the schema a literal `REPORT_DISCLAIMER` would reject a still-valid persisted report carrying a prior immutable version. Adding a `disclaimerVersion` field would make the wire change larger without improving the exact-text guarantee already embedded in the value.

### D2: Reuse the evidence-owned privacy-safe source-label formatter, never raw provenance

`evidence-provenance-ledger` owns one shared pure source-label formatter and uses it in its basic v2 DiagnosisCard/ConsultNotes screen renderer. This change imports and reuses that formatter unchanged for print and Share. It does not resolve source refs independently, copy the formatter's allowlists, or create a second presentation grammar. Export conformance tests require the evidence-owned formatter to emit exactly one of these forms:

```text
Patient input: Medical history
Patient input: Conversation transcript
Patient input: Lab results
Specialist consultation: <canonical specialist display name> (round <positive integer>)
Medical source: <allowlisted tool display name>
Medical source: <allowlisted tool display name> (<allowlisted namespace>: <allowlisted public record ID>)
```

The evidence-owned formatter selects patient labels only from the three fixed field mappings. Consultation labels use the canonical display name and round from the resolved succeeded consultation. Tool labels use its fixed allowlist keyed by `toolId`; the optional namespace and public ID are included only when outcome v2 validated them against that successful tool record and they satisfy the public-ID allowlist. Every substituted label component is a bounded single-line allowlisted value with no control, CR, or LF characters. Source refs remain in source-array order and are not deduplicated.

The shared formatter never exposes `contentHash`, offsets, offset units, `consultationId`, `attemptId`, `toolCallId`, result digests, timestamps, raw `toolId`, URLs, query terms, arguments, cache/retrieval facts, failure/limitation codes, or raw provenance JSON. Export treats the formatter's invariant-failure result as Share-unavailable and never falls back to a raw identifier or independent resolution. The full print view likewise shows only successful shared-formatter labels and the v2 privacy-safe degraded summary, not `ProvenanceV1`.

**Alternatives considered:** Serializing source refs directly would disclose opaque execution detail and make a citation look more authoritative. Dropping labels would violate the v2 traceability contract. A small exact grammar preserves useful source class/context without raw provenance.

### D3: One complete report DOM for screen and print

Print reuses the evidence-owned basic v2 ResultsView document rather than creating a popup or serialized HTML document. ConsultNotes diagnosis details remain mounted in the DOM and use screen-only collapsed state; print CSS forces every detail block visible. Supporting evidence retains each `SupportingEvidenceItem.statement` followed by the exact shared-formatter labels already used on screen. The evidence-owned degraded-warning and traceability-not-truth locations remain intact and become visible in print without a second renderer.

ConsultNotes will render `crossSpecialtyObservations` and `recommendedImmediateActions` through the same `marked` plus DOMPurify pattern required by the unchanged baseline `frontend-ux-improvements` requirement. The sanitized DOM is shared by Full Report screen and print; print does not reparse raw markdown or use `dangerouslySetInnerHTML` without sanitization. Baseline bullet, bold, plain-text, and malicious-script scenarios remain in force.

Print media hides the diagnoses summary panel, controls, tabs, and application chrome; shows the Full Report panel; removes scroll/max-height constraints; and retains the generated timestamp, scope, canonical disclaimer, patient summary, specialists, every diagnosis and evidence/action section, privacy-safe source labels, degraded warning when applicable, traceability notice, cross-specialty observations, and recommended immediate actions.

The canonical warning will sit directly below the report heading and metadata, rather than only at the end of the report, so it remains prominent in print. An optional nearby screen-only note may state that printing or saving as PDF creates a health-information copy. It is informational and does not gate `window.print()`.

**Alternatives considered:** A separate print-only HTML serializer would duplicate report rendering and invite content drift. Printing both current tab panels would duplicate diagnoses and still miss conditionally unmounted detail.

### D4: Same-window print with a static title and contained failure

The Print control will have visible text and `aria-label="Print report"` at every breakpoint. Its synchronous handler will:

1. Save the current `document.title`.
2. Set it to the static PHI-free value `ddx.care Research Differential Report`, which is also the requested default print-to-PDF basename where the browser derives a filename from the title.
3. Call the current window's `window.print()` exactly once.
4. Restore the prior title in `finally`, whether printing returns or throws.

The handler contains no feature detection, user-agent branch, `navigator.share`, or `window.open`. If `window.print()` throws, ResultsView shows `Printing is unavailable. Please try again.` in an element with `role="alert"`; it does not expose exception/report text or attempt Share, clipboard, download, or popup fallback. Browser cancellation is not detectable and needs no message.

**Alternatives considered:** Delaying title restoration or opening a print window introduces timing/popup behavior and additional PHI-bearing document state. A direct `try/finally` keeps the operation local and testable.

### D5: Exact bounded share serializer

A pure function in the existing ResultsView module accepts only a strict available outcome v2 and returns either static `ShareData` or `unavailable`. It does not read `window`, `document`, route state, job credentials, locale, or current time. `SHARE_TEXT_MAX_BYTES` is `16_384`, `TRUNCATION_MARKER` is the ASCII string `... [truncated]`, and byte length is always `TextEncoder().encode(value).byteLength`.

#### Clinical normalization and exact line grammar

Only these clinical dynamic fields are normalized: selected diagnosis `name`, `rationale`, each `SupportingEvidenceItem.statement`, each contradictory-evidence item, each next-step item, and `recommendedImmediateActions`. `outcome.disclaimer`, `outcome.traceabilityNotice`, `outcome.generatedAt`, shared warning/scope constants, evidence-owned source labels, numbers, enums, headings, and punctuation are never passed through the clinical normalizer.

`normalizeClinical(value)` performs exactly these operations in order:

1. Replace every CRLF and lone CR with LF.
2. Split on LF and remove trailing ASCII spaces/tabs from each line.
3. Remove leading and trailing lines whose ECMAScript `trim()` result is empty.
4. If the joined result's ECMAScript `trim()` result is empty, return `EMPTY`; otherwise join the retained lines with LF without changing leading whitespace or internal blank lines.

Whitespace-only scalar fields render `(none provided)` and do not become participating slots. Array values are normalized independently, whitespace-only items are discarded, and an array with no retained items renders one fixed `- (none provided)` line with no slot. A whitespace-only supporting-evidence statement violates outcome v2 and returns `unavailable` rather than emitting a source label without a statement.

All rationale, evidence, contradictory-evidence, next-step, and immediate-action values use a top-level bullet prefix exactly `- `. A supporting statement is followed by `  Sources:` and one evidence-owned source label per ref with nested prefix exactly `  - `. An embedded LF inside any participating clinical slot is rendered as the atomic structural token LF followed by exactly two ASCII spaces. Diagnosis names are inline after `Diagnosis <rank>: ` and use the same atomic two-space continuation after embedded LF. No other indentation or bullet marker is used.

The serializer emits one blank line (exactly two consecutive LF bytes) between the header and `Differential diagnoses`, between selected diagnoses, between the last diagnosis and diagnosis-count line, and between each subsequent top-level section. There is no blank line inside a diagnosis. It appends one serializer-owned final LF after the exact disclaimer bytes. It never trims or normalizes the disclaimer; if a historical disclaimer itself ends in LF, that LF remains and the serializer-owned LF follows it.

The first three diagnoses in report-array order are emitted. The diagnosis-count line is exactly `Diagnoses included: 3 of N; remaining diagnoses omitted.` when `N > 3`, substituting decimal `N`; otherwise it is `Diagnoses included: N of N.`. The serializer excludes chief complaint, patient summary, specialist summaries, cross-specialty observations, lower-ranked diagnosis content, URLs, and job data.

#### Participating slots and mandatory bytes

After normalization and empty handling, participating slots are ordered as follows: for each selected diagnosis, its non-empty name, non-empty rationale, each supporting-evidence statement in array order, each retained contradictory-evidence item, and each retained next-step item; the final slot is non-empty recommended immediate actions. Slots contain the rendered dynamic bytes, including inserted atomic LF-plus-two-space continuation tokens, but not their fixed labels or bullet prefixes.

The mandatory envelope contains every heading, label, bullet prefix, source label, placeholder, rank/confidence/urgency value, blank line, diagnosis-count line, scope, exact generated timestamp, exact degraded warning when status is `degraded`, exact traceability notice, `Disclaimer:` label, exact full disclaimer, and serializer-owned final LF. Privacy-safe source labels, warning, notice, and disclaimer are mandatory and never truncated. If a source label cannot be safely resolved, serialization is unavailable before allocation.

#### Normative allocation pseudocode

This pseudocode is normative; `byteLen`, `truncateRenderedSlot`, token order, and emitted bytes must match it:

```text
serialize(outcomeV2):
  assert outcomeV2.status == "available"
  template, slots = buildTemplateAfterNormalizationAndEmptyHandling(outcomeV2)
  full = emit(template, slots.fullValue) + LF
  if byteLen(full) <= 16_384:
    return shareData(full)

  fixed = emit(template, emptyStringForEveryParticipatingSlot) + LF
  fixedBytes = byteLen(fixed)
  if slots.length == 0:
    return unavailable

  oversized = empty ordered set
  repeat:
    markerBytes = oversized.size * byteLen("... [truncated]")
    if fixedBytes + markerBytes > 16_384:
      return unavailable

    contentBytes = 16_384 - fixedBytes - markerBytes
    quotient = floor(contentBytes / slots.length)
    remainder = contentBytes % slots.length
    allocation[i] = quotient + (i < remainder ? 1 : 0)

    nextOversized = oversized union {
      i where byteLen(slots[i].fullValue) > allocation[i]
    }
    if nextOversized == oversized:
      break
    oversized = nextOversized

  if fixedBytes + oversized.size * byteLen("... [truncated]") > 16_384:
    return unavailable

  for each slot i in original order:
    if i in oversized:
      rendered[i] =
        truncateRenderedSlot(slots[i].fullValue, allocation[i]) +
        "... [truncated]"
    else:
      rendered[i] = slots[i].fullValue

  output = emit(template, rendered) + LF
  assert byteLen(output) <= 16_384
  return shareData(output)
```

`truncateRenderedSlot(rendered, maxBytes)` is also normative. `rendered` has already converted every embedded clinical LF into the three-byte structural token `LF + SPACE + SPACE`. The helper selects the longest UTF-8 prefix no longer than `maxBytes` that ends at a Unicode code-point boundary and does not end with an incomplete continuation token. It is defined exactly as:

```text
truncateRenderedSlot(rendered, maxBytes):
  assert every LF in rendered is immediately followed by SPACE + SPACE
  candidate = emptyString
  best = emptyString
  for each Unicode code point cp in rendered order:
    next = candidate + cp
    if byteLen(next) > maxBytes:
      break
    candidate = next
    if not candidate.endsWith(LF) and
       not candidate.endsWith(LF + SPACE):
      best = candidate
  return best
```

Therefore an allocation that reaches only the LF or the LF plus first indentation space backtracks to the last safe boundary before that LF. An allocation that includes the complete `LF + SPACE + SPACE` token may keep it, in which case the appended marker begins after exactly two spaces on the continuation line. This structural backtracking can leave additional unused bytes; they are never redistributed.

The oversized set grows monotonically and reaches a fixed point. Allocation is always divided across all participating slots, including slots whose full value is shorter than their allocation. Bytes unused by a short participating slot, UTF-8 code-point boundary rounding, or atomic-continuation backtracking are never redistributed; placeholders are fixed envelope bytes and never receive an allocation. The first `remainder` slots receive one extra byte by original slot order. Exactly one marker is reserved and appended for each final oversized slot. If fixed bytes plus those marker bytes cannot fit, the result is unavailable; the serializer never drops a source label, warning, notice, section, or disclaimer to make room.

#### Normative golden full-output fixture

The fixture has four diagnoses, a degraded outcome, the exact timestamp shown below, canonical scope/disclaimer, the traceability notice shown below, multiline rationale/action fields, and whitespace-only contradictory evidence and next steps on diagnosis 2. Its resolved source labels use all source forms needed by the fixture. The exact untruncated `shareData.text` is:

```text
ddx.care Research Differential Report
AI-generated differential diagnosis - research proof-of-concept only; not for clinical use.
Generated: 2026-08-10T12:34:56.789Z

Differential diagnoses

Diagnosis 1: Hypertensive urgency
Confidence: 82%
Urgency: emergent
Rationale:
- Severe blood pressure elevation
  requires urgent assessment.
Supporting evidence:
- Blood pressure was 180/110.
  Sources:
  - Patient input: Lab results
- Severe headache
  with visual change.
  Sources:
  - Patient input: Conversation transcript
  - Specialist consultation: Neurologist (round 1)
Contradictory evidence:
- No focal deficit was reported.
Next steps:
- Repeat blood pressure measurement.
- Obtain urgent clinical examination.

Diagnosis 2: Migraine with aura
Confidence: 55%
Urgency: urgent
Rationale:
- Headache and visual symptoms are compatible.
Supporting evidence:
- Visual symptoms accompanied the headache.
  Sources:
  - Medical source: MedlinePlus
Contradictory evidence:
- (none provided)
Next steps:
- (none provided)

Diagnosis 3: Secondary headache
Confidence: 35%
Urgency: urgent
Rationale:
- A secondary cause remains possible.
Supporting evidence:
- Further evaluation was recommended.
  Sources:
  - Medical source: ClinicalTrials.gov (NCT: NCT01234567)
Contradictory evidence:
- Symptoms may fit a primary headache disorder.
Next steps:
- Consider directed imaging after examination.

Diagnoses included: 3 of 4; remaining diagnoses omitted.

Recommended immediate actions:
- Seek urgent in-person evaluation
  today.

Execution warning:
DEGRADED EXECUTION: One or more consultations or cited medical sources failed or were limited. This report may be incomplete.

Traceability notice:
Source references provide execution traceability only. They do not establish clinical accuracy, source entailment, or truth.

Disclaimer:
REPORT DISCLAIMER v1: RESEARCH USE ONLY - NOT FOR CLINICAL USE. This report is generated by a proof-of-concept AI system and is not a medical device. It is not HIPAA-compliant and has no regulatory approval. All outputs are AI-generated suggestions with no guarantee of accuracy. Never rely on this report for medical diagnosis, treatment decisions, or patient care. Always consult a qualified healthcare professional. By using this tool, you accept all risk and release the operators from any liability.
```

The byte immediately after the disclaimer's final period is one serializer-owned LF (`0x0A`), and there are no later bytes. Golden tests compare the complete UTF-8 byte sequence, not normalized snapshots.

**Alternatives considered:** Character counts are unsafe for multi-byte text, greedy tail truncation can remove immediate actions or safety text, and a one-pass marker calculation can contradict its own allocation after markers reduce the budget. The monotone fixed-point set makes marker reservation exact while the no-redistribution rule keeps output stable.

### D6: One stored payload for confirmation and invocation

Share support means `typeof navigator.share === "function"`. When unsupported, the visible Share control is disabled and has `aria-describedby` pointing to an in-DOM explanation whose exact text is `Sharing is not supported by this browser.` It performs no fallback, and no user-agent sniffing is used.

When supported, clicking Share serializes once and stores one object with exactly two own fields:

```ts
{
  title: "ddx.care Research Differential Report - Research Use Only",
  text: serializedText,
}
```

There is no `url`, `files`, attachment, route, job ID, token, or patient-derived metadata. The confirmation displays the stored title and text exactly. The modal panel has `max-height: calc(100dvh - 2rem)` and cannot overflow the viewport; its preview has `max-height: min(50dvh, 24rem)`, `overflow-y: auto`, wrapping, and preformatted whitespace. The privacy warning and Cancel/Confirm controls remain outside that scroll region and visible while the preview scrolls. No markup rendering, locale formatting, or second serialization is allowed between preview and confirmation.

Only Confirm Share calls `navigator.share(storedShareData)`. The first confirmation synchronously enters a pending state before invoking the API; Confirm becomes disabled with `aria-busy="true"` and subsequent activation cannot create another call until the same promise settles. This is single-flight per stored payload. Dismissing before confirmation makes no API call.

An `AbortError` is a quiet user cancellation with no error UI. Any other synchronous throw or rejected value displays `Sharing could not be completed. Please try again.` in an element with `role="alert"`, without exception/report details and without print, clipboard, download, or popup fallback. Serialization-unavailable uses that same alert and never opens the confirmation with a partial payload.

Playwright tests install deterministic configurable `navigator.share`, `window.print`, and `window.open` spies with `page.addInitScript` before navigation/application boot. The Share spy supports a test-controlled pending promise and exact argument capture; the Print spy captures `document.title` at invocation. This avoids dependence on Chromium's native Web Share/print support or timing.

**Alternatives considered:** Recomputing on confirmation risks preview drift. Clipboard fallback bypasses the explicit channel choice, and fallback to Print recreates the intent confusion this change removes.

### D7: Existing browser security boundary and separate Caddy validation

The implementation uses React-rendered text content in the existing document, `window.print()`, and `navigator.share()`. It requires no `window.open`, `document.write`, inline script, HTML payload injection, object/embed, external connection, or new CSP source. The API and Caddy CSP remain unchanged, including `script-src 'self'`, `connect-src 'self'`, and `object-src 'none'`.

API route CSP tests continue to validate application response headers but are not used as evidence that Caddy parses correctly. A separate Caddy configuration test/verification step will:

1. run `caddy validate --config Caddyfile`;
2. run `caddy adapt --config Caddyfile --pretty` and parse the adapted JSON; and
3. statically assert from the Caddyfile/adapted policy that the production CSP retains `script-src 'self'`, `connect-src 'self'`, `object-src 'none'`, and no export-specific source or unsafe script exception.

Component tests spy on `window.open`, and Playwright listens for popup events while exercising both actions. A Caddy failure is reported separately from API tests and blocks release rather than being silently skipped as an API success.

## Risks / Trade-offs

- **[Web Share implementations can reject text below the application limit]** -> Show one generic non-PHI failure and keep all fallback channels disabled.
- **[A 16 KiB summary can truncate clinically relevant prose]** -> Preserve source labels, degraded warning, traceability notice, every required section, and full disclaimer; clearly mark each truncated clinical slot; Print remains complete.
- **[Source labels can expose raw provenance if export duplicates or bypasses the shared formatter]** -> Reuse only the evidence-owned formatter, return unavailable on its invariant failure, and never stringify or independently resolve a source ref or ledger record.
- **[Outcome v2 and export can be deployed in the wrong order]** -> Treat v2 as an implementation/schema prerequisite but one combined post-drain release; disable Print and Share in any unavoidable intermediate state.
- **[Mounting collapsed details increases ResultsView DOM size]** -> Reports are bounded by generated diagnosis count, and one DOM avoids a divergent print renderer.
- **[Browser print-to-PDF naming is ultimately browser-controlled]** -> Supply and test a static title during the print call, restore it immediately afterward, and never derive metadata from report content.
- **[A stale persisted outcome may fail strict v2 validation]** -> Follow the v2 drain/TTL migration before applying this downstream release.
- **[The old frontend is an unsafe rollback target]** -> Retain a separately tested safe artifact that already has same-window Print and warning preservation; otherwise fix forward with Share disabled.

## Migration Plan

1. Implement and verify the `evidence-provenance-ledger` strict schemas, parser, transports, v2 mocks, structured evidence, execution quality, traceability notice, shared privacy-safe source-label formatter, and basic v2 screen renderer as code prerequisites. Do not implement export against legacy outcome data and do not release strict v2 yet.
2. After those contracts exist, add and test export safety constants, shared-formatter conformance/reuse, disclaimer/timestamp validation, and the v2-aware serializer; make the v2 producer emit the current canonical disclaimer.
3. Update ResultsView export controls, ConsultNotes print behavior/markdown reuse, print CSS, Share confirmation, and all v2 fixtures for one coordinated backend/frontend deployment. Drain persisted legacy jobs before this combined release. Strict v2 must never ship through the legacy unsafe mobile Print-to-Share path; if infrastructure sequencing forces an intermediate state, disable both Print and Share until the combined frontend is active.
4. Before release, build and separately retain an immutable safe deployment artifact that has passed same-window print, warning/notice/source-label, exact serializer, deterministic browser-spy, popup, CSP, and Caddy validation. Record its immutable artifact identifier with the verification evidence.
5. Deploy backend and frontend together after legacy jobs have been drained as required by outcome v2. Verify exact ISO/historical disclaimer display, full print, source privacy, title restoration, Share support/pending/error paths, golden bytes, byte bounds, mobile labels, scroll behavior, no popup, API CSP, and separate Caddy validation.
6. Rollback may deploy only the separately retained tested safe artifact. If it is unavailable or incompatible with current v2 data, fix forward with Share disabled while preserving same-window Print, the complete v2 report, source labels, degraded warning, traceability notice, and disclaimer.
7. Explicitly prohibit reverting to or rebuilding the unsafe prior frontend that routes mobile Print into Share, uses user-agent sniffing, omits v2 safety context, hides disclaimers, or introduces print/clipboard/popup fallback.
