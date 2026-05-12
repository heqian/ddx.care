## ADDED Requirements

### Requirement: WaitingRoom shows phase-based progress indicator

The WaitingRoom page SHALL display a step indicator showing the current diagnostic phase. Phases SHALL be derived from progress event types in this order: "Triaging Case" → "Consulting Specialists" → "Synthesizing Findings" → "Generating Report". The current phase SHALL be highlighted, completed phases SHALL show a checkmark, and pending phases SHALL appear in a muted style.

#### Scenario: Initial state shows triaging phase
- **WHEN** the WaitingRoom first renders and receives a `round_start` event
- **THEN** the step indicator highlights "Triaging Case" as the current phase and shows "Consulting Specialists", "Synthesizing Findings", and "Generating Report" as pending

#### Scenario: Transition to consulting phase
- **WHEN** the first `specialist_start` event arrives
- **THEN** "Triaging Case" shows as completed (checkmark), "Consulting Specialists" becomes the current phase, and pending phases remain muted

#### Scenario: Consulting phase shows specialist count
- **WHEN** the system is in the consulting phase and 2 out of 5 specialists have completed
- **THEN** the "Consulting Specialists" step label shows "2/5 consulted"

#### Scenario: Transition to synthesizing phase
- **WHEN** all specialists for the current round have completed (but `cmo_final` has not yet arrived)
- **THEN** "Consulting Specialists" shows as completed and "Synthesizing Findings" becomes the current phase

#### Scenario: Final phase transition
- **WHEN** the `cmo_final` event arrives (or the formatReport step begins)
- **THEN** "Synthesizing Findings" shows as completed and "Generating Report" becomes the current phase

#### Scenario: All phases complete
- **WHEN** the diagnosis flow is finished and the ResultsView is about to render
- **THEN** all four phases show as completed with checkmarks

### Requirement: Cross-specialty observations and recommended actions render markdown

The ResultsView page SHALL render `crossSpecialtyObservations` and `recommendedImmediateActions` fields through `marked` (markdown-to-HTML) and `isomorphic-dompurify` (sanitization) before display, using the same pattern already established by the `ConsultNotes` component.

#### Scenario: Markdown bullet list renders correctly
- **WHEN** `crossSpecialtyObservations` contains markdown like "- Finding A\n- Finding B"
- **THEN** the rendered output shows an HTML unordered list with Finding A and Finding B

#### Scenario: Markdown bold text renders correctly
- **WHEN** `recommendedImmediateActions` contains "**Urgent**: Administer epinephrine"
- **THEN** the rendered output shows "Urgent" in bold

#### Scenario: Plain text renders unchanged
- **WHEN** a field contains plain text with no markdown syntax
- **THEN** the rendered output matches the original text

#### Scenario: Malicious HTML is sanitized
- **WHEN** a field contains `<script>alert('xss')</script>` in the markdown
- **THEN** DOMPurify strips the script tag before rendering
