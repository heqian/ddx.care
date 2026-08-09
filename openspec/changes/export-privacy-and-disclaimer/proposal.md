## Why

On mobile user agents, the Print button invokes `navigator.share()` with chief complaint, patient summary, diagnoses, and immediate actions — exposing health data to the OS share sheet when the user intended to print. The mobile Print button label is hidden without an `aria-label`. Shared text omits evidence, context, and every disclaimer, making the artifact appear more authoritative than the on-screen report. Print CSS deliberately hides the header, footer, `[data-print-hide]`, and `.disclaimer`, removing all safety warnings from the printed report. A user can therefore unintentionally share PHI and receive a printed/shared artifact stripped of the research-only disclaimer.

## What Changes

- **Separate Print and Share actions**: the UI SHALL provide distinct, accurately labeled Print and Share actions; behavior SHALL NOT switch based on user-agent sniffing.
- **Privacy confirmation for share**: before invoking `navigator.share()`, the UI SHALL show a privacy confirmation and a preview of what will be shared; the action SHALL require explicit confirmation.
- **Disclaimer preserved in exports**: every printed or shared artifact SHALL include the generated date, report scope, and the full research-only disclaimer. Print CSS SHALL NOT hide the disclaimer.
- **Accessible labels**: the Print and Share buttons SHALL have visible text or explicit `aria-label`s on all viewport sizes.

## Capabilities

### New Capabilities

- `export-privacy-and-disclaimer`: Print and Share actions SHALL be distinct, explicitly confirmed, and SHALL preserve the research-only disclaimer and report scope in every exported artifact.

### Modified Capabilities

- `frontend-ux-improvements`: Print CSS SHALL NOT hide the disclaimer; the Print action SHALL always invoke the browser print dialog and SHALL NOT switch to share via user-agent sniffing.

## Impact

- **Frontend**: `src/frontend/pages/ResultsView.tsx` (split Print/Share, confirmation modal, aria-labels), `src/frontend/index.css` (print CSS keeps disclaimer), `src/frontend/components/diagnosis/ConsultNotes.tsx` (print disclaimer).
- **Tests**: `tests/frontend.test.tsx`, E2E print/share coverage.
- **Documentation**: `AGENTS.md` (export behavior).