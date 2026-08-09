## Purpose

Ensures printed and shared diagnostic artifacts are produced through distinct, explicitly confirmed actions and always carry the research-only disclaimer and report scope, so users do not unintentionally expose health data or receive authoritative-looking exports stripped of warnings.

## ADDED Requirements

### Requirement: Print and Share are distinct actions

The UI SHALL provide separate Print and Share actions with distinct labels and icons. The Print action SHALL always invoke the browser print dialog and SHALL NOT switch to `navigator.share()` based on user-agent sniffing. The Share action SHALL invoke `navigator.share()` only when the API is available and only after explicit user confirmation.

#### Scenario: Print button always prints
- **WHEN** the user clicks Print on any device
- **THEN** the browser print dialog opens and `navigator.share()` is not invoked

#### Scenario: Share button invokes share only after confirmation
- **WHEN** the user clicks Share and `navigator.share()` is available
- **THEN** a privacy confirmation modal appears, and only after explicit confirmation does the share sheet open

#### Scenario: Share is unavailable
- **WHEN** the user clicks Share and `navigator.share()` is not available
- **THEN** the action is disabled or shows an explanatory message and does not fall back to printing

### Requirement: Share requires a privacy confirmation and preview

Before invoking `navigator.share()`, the UI SHALL display a confirmation modal that previews the exact text to be shared and warns that sharing transmits health data to another application. The share SHALL proceed only after explicit confirmation.

#### Scenario: User confirms share
- **WHEN** the user clicks Share, reviews the preview, and confirms
- **THEN** the share sheet opens with the previewed text

#### Scenario: User cancels share
- **WHEN** the user clicks Share and dismisses the confirmation modal
- **THEN** no share sheet opens and no data leaves the page

### Requirement: Exported artifacts include disclaimer and report scope

Every printed or shared artifact SHALL include the generated date, a one-line report scope (e.g., "AI-generated differential diagnosis — research use only"), and the full research-only disclaimer. Print CSS SHALL NOT hide the disclaimer.

#### Scenario: Printed report includes disclaimer
- **WHEN** the user prints the report
- **THEN** the printed pages include the generated date, report scope, and the full disclaimer text

#### Scenario: Shared text includes disclaimer
- **WHEN** the user confirms a share
- **THEN** the shared text includes the generated date, report scope, and the full disclaimer

#### Scenario: Print CSS does not hide the disclaimer
- **WHEN** print CSS is applied
- **THEN** the disclaimer element remains visible (not `display: none`)

### Requirement: Print and Share controls have accessible names

The Print and Share buttons SHALL have visible text labels or explicit `aria-label`s on all viewport sizes, including narrow mobile screens where icon-only buttons may be used.

#### Scenario: Mobile print button has an accessible name
- **WHEN** the Print button renders on a narrow viewport with a hidden visible label
- **THEN** the button has an `aria-label` of "Print report"

#### Scenario: Mobile share button has an accessible name
- **WHEN** the Share button renders on a narrow viewport with a hidden visible label
- **THEN** the button has an `aria-label` of "Share report"