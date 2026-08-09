## MODIFIED Requirements

### Requirement: Cross-specialty observations and recommended actions render markdown

The ResultsView page SHALL render `crossSpecialtyObservations` and `recommendedImmediateActions` fields through `marked` (markdown-to-HTML) and `isomorphic-dompurify` (sanitization) before display, using the same pattern already established by the `ConsultNotes` component. Print CSS SHALL NOT hide the research-only disclaimer; the disclaimer SHALL remain visible in printed output so exported artifacts carry the safety warning.

#### Scenario: Markdown bullet list renders correctly
- **WHEN** `crossSpecialtyObservations` contains markdown like "- Finding A\n- Finding B"
- **THEN** the rendered output shows an HTML unordered list with Finding A and Finding B

#### Scenario: Printed report retains the disclaimer
- **WHEN** the user prints the report and print CSS is applied
- **THEN** the disclaimer element is visible in the printed output and is not hidden by `display: none`

#### Scenario: Print button does not switch to share
- **WHEN** the user clicks the Print button on a mobile user agent
- **THEN** the browser print dialog opens and `navigator.share()` is not invoked