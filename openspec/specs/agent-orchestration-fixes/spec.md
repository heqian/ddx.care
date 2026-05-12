## ADDED Requirements

### Requirement: Specialist requests are deduplicated within a round

When the CMO returns a list of specialist requests for the current round, the system SHALL deduplicate them by `id` before dispatching. If the same specialist ID appears multiple times in the current round's request list, only the first occurrence SHALL be consulted.

#### Scenario: CMO requests same specialist twice in one round
- **WHEN** the CMO output includes `[{id: "cardiologist"}, {id: "cardiologist"}]` in the same round
- **THEN** only one cardiologist consultation is dispatched for that round

#### Scenario: Specialist can be consulted again in a later round
- **WHEN** the CMO requests `cardiologist` in round 1, then requests `cardiologist` again in round 2
- **THEN** the cardiologist is consulted in both rounds (round deduplication does not prevent cross-round consultations)

#### Scenario: Unique specialists in a round all get consulted
- **WHEN** the CMO requests `[{id: "cardiologist"}, {id: "neurologist"}, {id: "endocrinologist"}]` in a round
- **THEN** all three specialists are consulted in that round

### Requirement: CMO prompt includes available specialist IDs

The CMO's system prompt or instructions SHALL include the complete list of available specialist IDs (the keys from the `specialists` record) at workflow initialization time. The structured output schema for specialist requests SHALL constrain the `id` field to a Zod `enum()` using only the actual registered specialist IDs.

#### Scenario: CMO receives dynamic ID list on startup
- **WHEN** the diagnostic workflow initializes
- **THEN** the CMO's instructions include text like "Available specialist IDs: cardiologist, dermatologist, neurologist, ..." matching the actual registered agents

#### Scenario: CMO cannot request non-existent specialists
- **WHEN** the CMO attempts to output `{id: "cardiacSurgeon"}` which is not a registered ID
- **THEN** Zod validation rejects the output, and the CMO receives a correction prompt with the valid ID list

#### Scenario: ID list stays in sync with agent registry
- **WHEN** a new specialist agent is added to the `specialists` record
- **THEN** its ID automatically appears in the CMO's prompt and enum constraint without manual updates

### Requirement: SPECIALIST_CONTEXT_MODE defaults to prior_rounds

The `SPECIALIST_CONTEXT_MODE` configuration SHALL default to `"prior_rounds"` instead of `"none"`. When set to `"prior_rounds"`, specialists consulted in round 2 and later SHALL receive a summary of findings from previous rounds in their context, capped at `SPECIALIST_CONTEXT_MAX_CHARS`.

#### Scenario: Default behavior shares prior findings
- **WHEN** `SPECIALIST_CONTEXT_MODE` is not explicitly set and a specialist is consulted in round 2
- **THEN** the specialist receives context summarizing round 1 findings

#### Scenario: Explicit none disables sharing
- **WHEN** `SPECIALIST_CONTEXT_MODE=none` is set explicitly
- **THEN** specialists in all rounds receive only the patient summary and their own prior responses (no cross-round findings)
