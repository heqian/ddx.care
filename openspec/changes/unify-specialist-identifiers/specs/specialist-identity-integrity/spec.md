## Purpose

Keeps specialist identity consistent across registration, orchestration, tooling, progress events, and public metadata.

## ADDED Requirements

### Requirement: Every specialist has one canonical identifier
Each specialist SHALL have one canonical identifier used unchanged by the agent registry, agent runtime identity, CMO request schema, tool assignment manifest, progress events, and agent-list API.

#### Scenario: Specialist is registered
- **WHEN** a specialist is added to the panel
- **THEN** all specialist-facing surfaces expose the same canonical identifier

#### Scenario: CMO requests a canonical identifier
- **WHEN** the CMO requests a registered specialist
- **THEN** the runtime resolves that exact identifier without alias translation or fallback

### Requirement: Every registered specialist has an exact tool assignment
Every registered specialist SHALL match one and only one tool-assignment entry. The system SHALL NOT silently give a registered specialist a generic fallback assignment.

#### Scenario: Emergency specialist tools are resolved
- **WHEN** the emergency specialist is created
- **THEN** its exact assignment includes universal, prescribing, and toxicology tools

#### Scenario: Registered specialist assignment is missing
- **WHEN** startup validation finds a registered specialist with no exact assignment
- **THEN** startup fails with a non-sensitive configuration error naming the canonical identifier

#### Scenario: Tool assignment references an unknown specialist
- **WHEN** startup validation finds an assignment for an identifier not present in the registry
- **THEN** startup fails and identifies the orphaned assignment

### Requirement: Identity integrity is exhaustively validated
The specialist manifest SHALL be validated as a complete set so duplicate identifiers, missing assignments, mismatched runtime IDs, and unknown CMO identifiers cannot be accepted.

#### Scenario: All specialist identities are valid
- **WHEN** startup validates the complete specialist manifest
- **THEN** every registry key, runtime ID, CMO ID, API ID, and tool assignment matches exactly

#### Scenario: Duplicate canonical identifier is introduced
- **WHEN** two specialist definitions declare the same canonical identifier
- **THEN** validation fails before the server accepts diagnosis requests
