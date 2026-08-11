## ADDED Requirements

### Requirement: Results export controls preserve intent and safety across viewports

The ResultsView page SHALL consume only the strict available report outcome v2, shared privacy-safe source-label formatter, and basic v2 screen renderer owned by `evidence-provenance-ledger`. It SHALL present separate Print and Share controls with visible `Print` and `Share` labels and accessible names `Print report` and `Share report` at every viewport width. Print SHALL always use the current document's browser print action; Share SHALL be support-gated and SHALL open its privacy confirmation before sharing. The UI SHALL NOT substitute one action for the other based on viewport or user-agent detection, and export SHALL NOT duplicate the evidence-owned formatter or basic renderer.

Strict outcome v2 and this export frontend SHALL deploy together after persisted legacy jobs drain. If infrastructure sequencing requires an intermediate strict-v2 deployment, both export controls SHALL remain disabled and the legacy mobile Print-to-Share path SHALL be unreachable until the combined frontend is active.

Print media SHALL hide interactive chrome, render the Full Report rather than a duplicate summary, expand all diagnosis detail, remove scroll clipping, and keep structured evidence statements, privacy-safe source labels, any degraded-execution warning, the traceability-not-truth notice, exact generated timestamp, report scope, and full report disclaimer visible near the report heading. ConsultNotes SHALL render `crossSpecialtyObservations` and `recommendedImmediateActions` through the baseline `marked` plus DOMPurify pipeline on screen and in the same sanitized print DOM, preserving the baseline markdown/plain-text/XSS scenarios. A print privacy note MAY be informational but SHALL NOT require another confirmation.

#### Scenario: Narrow viewport keeps honest labels
- **WHEN** ResultsView renders at a narrow mobile viewport
- **THEN** visible `Print` and `Share` text remains present and the controls have accessible names `Print report` and `Share report`

#### Scenario: Viewport does not change Print behavior
- **WHEN** the user activates Print at any viewport width or with any user-agent string
- **THEN** the current document's print action runs and Share, clipboard, download, and popup actions do not

#### Scenario: Intermediate v2 deployment cannot use legacy export
- **WHEN** strict v2 infrastructure is active before the combined export frontend
- **THEN** Print and Share are disabled and mobile Print cannot invoke Web Share

#### Scenario: Unsupported Share remains understandable
- **WHEN** Web Share is unavailable at a desktop or mobile viewport
- **THEN** the Share control is disabled, its `aria-describedby` references an explanation that states `Sharing is not supported by this browser.`, and no fallback runs

#### Scenario: Print media preserves full safety context
- **WHEN** print media is applied while a report tab or diagnosis section is collapsed on screen
- **THEN** the complete Full Report is visible without scroll clipping and structured evidence/source labels, degraded warning when applicable, traceability notice, exact scope, exact ISO generation timestamp, and full disclaimer remain prominent

#### Scenario: ConsultNotes markdown remains sanitized in print
- **WHEN** Full Report fields contain markdown and malicious HTML and the page is rendered on screen or under print media
- **THEN** marked formatting is retained in both representations and DOMPurify removes unsafe markup as required by the unchanged baseline markdown requirement

#### Scenario: Export errors are announced without PHI
- **WHEN** Print throws or Web Share fails for a reason other than `AbortError`
- **THEN** the corresponding generic non-PHI message is rendered with `role=alert` and no exception or report text is included
