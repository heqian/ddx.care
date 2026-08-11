## Why

ResultsView currently routes Print into Web Share on mobile, hard-codes different report warnings, and hides warning text and collapsed diagnosis detail in print media. The existing export plan also predates the breaking strict report outcome v2 from `evidence-provenance-ledger`, so it would omit structured source labels, degraded execution, and the required traceability-not-truth boundary.

## What Changes

- Make strict outcome-v2 schemas, transport, the shared privacy-safe source-label formatter, and the basic v2 screen renderer from `evidence-provenance-ledger` implementation prerequisites. This change consumes those contracts without a second formatter or legacy adapter, and the two changes deploy together after persisted legacy jobs drain.
- Establish one immutable, versioned report disclaimer, one report scope line, and one static degraded-execution warning in the shared report contract. Available outcomes require a non-blank disclaimer and an ISO 8601 generation timestamp; screen, print, and share preserve the exact outcome disclaimer/timestamp and v2 traceability notice.
- Make Print and Share separate, accurately labeled actions on every viewport. Print always uses the current window's browser print dialog and never invokes Share, opens a popup, or branches on the user agent.
- Make the print representation a complete report with every ranked diagnosis and detail expanded, each supporting-evidence statement plus the exact labels from the evidence-owned shared formatter, degraded-execution warning when applicable, traceability notice, static PHI-free document title/default PDF basename, generated timestamp, scope line, and prominent full disclaimer. ConsultNotes preserves the evidence-owned basic v2 screen renderer and baseline marked-plus-DOMPurify contract in the same DOM used for print.
- Offer Share only when Web Share is supported. Before sharing, show a bounded, scrollable privacy confirmation whose exact stored payload is passed once after confirmation; pending confirmation is single-flight, unsupported state is described accessibly, and generic failures are alerts.
- Build share text with a pure deterministic serializer capped at 16 KiB of UTF-8 text. A normative algorithm and golden full-output fixture define exact bullets, multiline indentation, whitespace-only handling, blank lines, final newline, source labels, and truncation. Mandatory labels, warning/notice text, the exact unnormalized disclaimer, and final truncation markers are reserved before clinical slot allocation; unused allocation is never redistributed. Structural continuation tokens (`LF` plus two ASCII spaces) are atomic, so truncation can never leave an LF or one indentation space immediately before the marker.
- Use static research-only share metadata with no URL, job capability, attachment, or patient-derived title/filename. Treat `AbortError` as a quiet cancellation; all other failures use a generic non-PHI message and never fall back to print, clipboard, or a popup.
- Preserve the existing CSP without relaxation. Validate Caddy separately from API CSP tests with `caddy validate`, `caddy adapt`, and a static policy assertion; add deterministic Playwright browser spies and coverage for v2 evidence, unsupported/rejected/oversized Share, structurally safe multiline truncation boundaries, single-flight confirmation, exact preview equality, print completeness/title restoration, no popup, scroll behavior, exact ISO display, historical disclaimer preservation, and mobile labels.
- Prohibit a strict-v2 intermediate deployment through the legacy unsafe mobile Print-to-Share path. If operational sequencing makes an intermediate deployment unavoidable, both Print and Share remain disabled until the combined v2 export frontend is active.
- Permit rollback only to a separately retained and tested safe artifact or a fix-forward release with Share disabled. Never redeploy the unsafe prior frontend that user-agent-sniffs Print or removes export warnings.

## Capabilities

### New Capabilities

- `export-privacy-and-disclaimer`: Defines downstream v2 evidence-aware, complete, bounded, and privacy-preserving print and Web Share contracts.

### Modified Capabilities

- `frontend-ux-improvements`: Adds a distinct responsive ResultsView export-control and print-media requirement without replacing the existing markdown rendering and XSS-sanitization requirement.

## Impact

- **Dependency and deployment**: `evidence-provenance-ledger` owns and implements strict outcome v2, its shared privacy-safe source-label formatter, and the basic v2 screen renderer first. Export consumes them, but both changes deploy together after the legacy-job drain; any unavoidable intermediate state disables Print and Share.
- **Shared report contract and producer**: `src/shared/report-outcome.ts` and `src/backend/workflows/diagnostic-workflow.ts` add canonical export safety constants and stricter disclaimer/timestamp validation on top of v2 without adding another outcome version.
- **Frontend**: `src/frontend/pages/ResultsView.tsx`, the evidence-owned DiagnosisCard/ConsultNotes v2 renderer, the existing `Modal` composition, and `src/frontend/index.css` reuse exact shared privacy-safe source labels and provide v2 warnings/notices, separate actions, a complete same-document print view, and bounded share confirmation.
- **Tests and operations**: Existing workflow/client/persistence/WebSocket/frontend/Playwright coverage plus separate Caddy validation exercise the contract. Release handling retains a tested safe artifact; no dependency or CSP exception is required.
