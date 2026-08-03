## ADDED Requirements

### Requirement: Partial tool coverage is transparent
When a tool returns usable data with incomplete coverage, its result SHALL identify the coverage as partial, explain which inputs were not checked, and prevent progress or audit events from describing the operation as a complete success.

#### Scenario: Drug interaction check is partially complete
- **WHEN** two drugs are checked successfully and a third drug lookup fails
- **THEN** the agent receives the two-drug findings plus a partial-coverage warning naming the unchecked input

#### Scenario: Tool returns ok false inside a normal tool result envelope
- **WHEN** a medical tool returns `{ ok: false }` without throwing
- **THEN** progress and audit events mark the tool result as failed and preserve its retriable classification

#### Scenario: Tool returns successful data with partial coverage
- **WHEN** a medical tool returns `{ ok: true }` with partial coverage
- **THEN** progress and audit events mark it as partial rather than fully successful
