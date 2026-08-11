## 1. Outcome V2 Prerequisite and Safety Contract

- [ ] 1.1 Implement and verify the `evidence-provenance-ledger` strict outcome-v2 schemas/parser, structured `SupportingEvidenceItem`, execution quality, traceability notice, provenance, REST/WebSocket parity, mocks, shared privacy-safe source-label formatter, and basic v2 screen renderer as code prerequisites; do not implement export against legacy outcomes and do not release strict v2 separately.
- [ ] 1.2 In `src/shared/report-outcome.ts`, add immutable `REPORT_DISCLAIMER_VERSION`, `REPORT_SCOPE_LINE`, `REPORT_DEGRADED_EXECUTION_WARNING`, and `REPORT_DISCLAIMER` exports with the exact values specified in the design/spec, without defining a competing evidence schema or outcome version.
- [ ] 1.3 Tighten the v2 available-outcome schema so `disclaimer` contains at least one non-whitespace character without transformation and `generatedAt` is a valid ISO 8601 datetime, while retaining strict rejection of legacy string evidence.
- [ ] 1.4 Update v2 `formatReport` to import and emit `REPORT_DISCLAIMER`, retain UTC `toISOString()` generation, and remove its local disclaimer string without replacing outcome v2's `traceabilityNotice`.
- [ ] 1.5 Import and reuse the evidence-owned shared pure source-label formatter unchanged for print and Share; add export conformance checks for its exact patient/consultation/tool forms, ref order, invariant-failure result, and prohibited-field absence without copying its allowlists or implementing independent source resolution.
- [ ] 1.6 Integrate exact `outcome.disclaimer`, `outcome.generatedAt`, and `REPORT_SCOPE_LINE` into the evidence-owned basic v2 ResultsView safety area; preserve its existing degraded-warning and traceability-not-truth screen locations, supply the degraded-warning constant when applicable, and remove the two hard-coded disclaimer copies without creating another basic renderer.
- [ ] 1.7 Update all workflow, API-client, progress-store, WebSocket, frontend, and E2E available-outcome fixtures to strict v2, including current canonical and historical noncanonical nonblank disclaimers plus exact ISO timestamps.

## 2. Structured Full Report and Same-Document Print

- [ ] 2.1 Preserve the evidence-owned DiagnosisCard/ConsultNotes basic v2 renderer and consume its shared exact source-label output in the same Full Report DOM used by print and in Share serialization, without adding a second formatter or exposing source-ref JSON, execution IDs, hashes, offsets, URLs, arguments, or raw provenance.
- [ ] 2.2 Preserve the evidence-owned degraded-execution warning before clinical content and exact traceability-not-truth notice adjacent to source-bearing content, and make those same existing nodes visible in print without duplicating their screen renderer.
- [ ] 2.3 Refactor ConsultNotes diagnosis disclosure so every rationale, structured evidence statement/label, contradictory-evidence, and next-step block remains mounted while screen collapse state is preserved and print can expand it.
- [ ] 2.4 Render ConsultNotes `crossSpecialtyObservations` and `recommendedImmediateActions` with the baseline `marked` plus DOMPurify pattern and use the same sanitized DOM for Full Report screen/print, retaining existing bullet/bold/plain-text/XSS behavior.
- [ ] 2.5 Update `src/frontend/index.css` print rules to hide controls/summary, show Full Report, expand mounted detail, remove scrolling/clipping, and retain all v2 report content, exact source labels, degraded warning, traceability notice, timestamp/scope, and disclaimer.
- [ ] 2.6 Replace the user-agent branch with a handler that saves the title, sets `ddx.care Research Differential Report`, calls only same-window `window.print()` once, and restores the prior title in `finally`.
- [ ] 2.7 Add the informational print privacy note and `Printing is unavailable. Please try again.` with `role="alert"`, no confirmation gate, exception/report details, or Share/clipboard/download/popup fallback.
- [ ] 2.8 Keep visible `Print` text at mobile widths and the accessible name `Print report`.

## 3. Exact Deterministic Bounded Serializer

- [ ] 3.1 Implement the exact clinical normalizer from design D5 for only diagnosis name/rationale, evidence statements, contradictory evidence, next steps, and immediate actions; never normalize disclaimer, traceability notice, timestamp, source labels, or shared constants.
- [ ] 3.2 Implement the exact D5 template/grammar and golden output: fixed section order/blank lines, `- ` clinical bullets, `  Sources:` plus `  - ` source bullets, two-space embedded-LF continuation, diagnosis-count line, degraded/traceability/disclaimer blocks, and one serializer-owned final LF.
- [ ] 3.3 Serialize each selected `SupportingEvidenceItem.statement` with every resolved privacy-safe source label in ref order; treat labels, degraded warning, traceability notice, exact disclaimer, placeholders, and final LF as mandatory untruncated envelope bytes.
- [ ] 3.4 Determine participating slots only after clinical normalization, whitespace-only item removal, and placeholder handling, using the exact per-diagnosis/item order in D5; return unavailable for a whitespace-only v2 evidence statement or unsafe source label.
- [ ] 3.5 Implement D5's monotone fixed-point oversized-set algorithm, equal quotient/remainder allocation across all participating slots, exact marker reservation, and normative `truncateRenderedSlot` so truncation is code-point-safe and atomic for every inserted `LF + SPACE + SPACE` continuation token; never redistribute short-slot, code-point-rounding, or structural-backtracking bytes.
- [ ] 3.6 Return unavailable when fixed mandatory bytes plus one marker per final oversized participating slot cannot fit within 16,384 UTF-8 bytes; never drop a source label, warning, notice, section, marker, or disclaimer to fit.
- [ ] 3.7 Build `ShareData` with exactly static title `ddx.care Research Differential Report - Research Use Only` and bounded text, with no URL, files, attachment, route, job ID/token, patient-derived metadata, or raw provenance.

## 4. Support-Gated Single-Flight Share Confirmation

- [ ] 4.1 Add a distinct visible Share control with `aria-label="Share report"`; enable only when `navigator.share` is a function and otherwise set `aria-describedby` to the in-DOM exact unsupported explanation without fallback.
- [ ] 4.2 Serialize once when Share is activated, store that exact `ShareData`, and open the existing Modal only when serialization succeeds and before any Web Share call.
- [ ] 4.3 Bound the modal panel to `calc(100dvh - 2rem)` and the preformatted wrapping preview to `max-height: min(50dvh, 24rem)` with `overflow-y: auto`, keeping the privacy warning and actions visible outside the scroll region.
- [ ] 4.4 Preview the stored title/text byte-for-byte and pass that same stored object to `navigator.share()` only after Confirm; close/backdrop/Escape/Cancel before confirmation makes no API call.
- [ ] 4.5 Enter pending synchronously on the first Confirm, disable it with `aria-busy="true"`, and enforce one `navigator.share()` call per stored payload until the controlled promise settles.
- [ ] 4.6 Treat `AbortError` as quiet cancellation; render every other share/serialization failure as only `Sharing could not be completed. Please try again.` with `role="alert"` and no exception/report detail.
- [ ] 4.7 Keep Print, clipboard, download, URL, attachment, raw provenance, and popup fallback absent from unsupported, unavailable, pending, cancellation, and rejection paths.

## 5. Contract, Browser, and CSP Tests

- [ ] 5.1 Extend shared/workflow/client/persistence/WebSocket tests for strict outcome v2, current exact disclaimer emission, blank/non-ISO rejection, and legacy string-evidence rejection without an export adapter.
- [ ] 5.2 Add frontend tests proving the exact ISO timestamp is visible as supplied and a historical noncanonical nonblank disclaimer remains byte-for-byte unchanged on screen, print data, and Share text.
- [ ] 5.3 Add export conformance tests against the evidence-owned formatter for all three patient forms, succeeded consultation/round, allowlisted tool with/without public ID, source-order preservation, invariant failure, and absence/refusal of raw IDs, hashes, offsets, URLs, queries, arguments, codes, and provenance JSON; assert export defines no second formatter or fallback resolution path.
- [ ] 5.4 Add a golden UTF-8 byte test for the complete D5 output, including exact structured evidence statements/labels, degraded warning, traceability notice, bullets, indentation, blank lines, disclaimer bytes, and final `0x0A`.
- [ ] 5.5 Add serializer normalization tests for CRLF/lone CR, per-line trailing spaces/tabs, leading/trailing whitespace-only lines, preserved leading/internal whitespace, discarded whitespace-only list items, fixed placeholders, and embedded-newline indentation.
- [ ] 5.6 Add oversized ASCII/multi-byte tests for participating-slot order, monotone oversized-set growth, earliest-slot remainder bytes, one marker per final oversized slot, code-point boundaries, no redistribution, 16,384-byte bound, and unavailable fixed-plus-marker cases. Add exact multiline boundary cases where allocation ends after LF, after `LF + SPACE`, and after complete `LF + SPACE + SPACE`; assert the first two backtrack before LF, the third retains both spaces before the marker, and none redistributes unused bytes.
- [ ] 5.7 Extend frontend tests for ConsultNotes marked/DOMPurify screen/print rendering while retaining baseline markdown bullets, bold text, plain text, and malicious-script removal.
- [ ] 5.8 Add unsupported Web Share tests proving disabled state, visible/mobile labels, exact `aria-describedby` resolution, and no modal/API/fallback.
- [ ] 5.9 Add confirmation tests proving exact preview/argument equality, no extra `ShareData` fields, bounded CSS, `scrollHeight > clientHeight`, `overflow-y` scrolling, and visible warning/actions outside the preview.
- [ ] 5.10 Add pending single-flight tests with a controlled Share promise, repeated Confirm activation, disabled/`aria-busy` state, exactly one call, quiet `AbortError`, and `role="alert"` generic synchronous/rejected failures.
- [ ] 5.11 Add Print unit tests for desktop/mobile user agents, same-window-only invocation, captured static title, title restoration on success/throw, `role="alert"` generic failure, and zero Share/clipboard/download/window-open fallback.
- [ ] 5.12 In Playwright `page.addInitScript`, install deterministic configurable `navigator.share`, `window.print`, and `window.open` spies before app boot, including exact argument/title capture and a test-controlled pending Share promise.
- [ ] 5.13 Add Playwright print-media coverage for collapsed/switched state, every v2 diagnosis/detail/evidence label, degraded warning, traceability notice, sanitized markdown, exact ISO timestamp/disclaimer, static print title capture/restoration, and unclipped content.
- [ ] 5.14 Add Playwright mobile Share coverage for labels/names, unsupported description, pending single-flight, exact preview payload, real scroll assertions with controls visible, generic alerts, and no popup event.
- [ ] 5.15 Add Caddy configuration coverage separate from `tests/api.test.ts`: run `caddy validate --config Caddyfile`, run/parse `caddy adapt --config Caddyfile --pretty`, and statically assert strict production CSP directives/no export exception; retain API CSP tests as a distinct gate.

## 6. Verification, Release Artifact, and Safe Recovery

- [ ] 6.1 Run `bun run lint` and `bun run typecheck`.
- [ ] 6.2 Run `bun run test`, `bun run test:frontend`, and `bun run test:e2e`, including all new v2 export/privacy/browser cases.
- [ ] 6.3 Run `bun run test:integration` and `bun run test:contract` when live-API credentials are available, recording environment-only skips separately from failures.
- [ ] 6.4 Drain persisted legacy jobs, then release evidence outcome v2 and this export backend/frontend together. Add a deployment gate proving strict v2 cannot be enabled with the legacy mobile Print-to-Share frontend; if infrastructure sequencing requires an intermediate v2 state, verify both Print and Share are disabled until the combined frontend is active.
- [ ] 6.5 Build, immutably identify, separately retain, and record verification evidence for a safe combined backend/frontend artifact that passed outcome-v2, shared-formatter conformance, export, no-popup, CSP, and Caddy gates before deployment.
- [ ] 6.6 Verify recovery can deploy only that tested safe artifact or fix forward with Share disabled while retaining same-window Print and full v2 safety content; explicitly prohibit reverting to/rebuilding the unsafe prior frontend.
