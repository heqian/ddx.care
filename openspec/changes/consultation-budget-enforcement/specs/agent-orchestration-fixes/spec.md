## MODIFIED Requirements

### Requirement: Specialist requests are deduplicated within a round

When the CMO returns a list of specialist requests for the current round, the system SHALL create one `RequestBatch` containing every model-requested entry in original order and SHALL record each entry's final admission disposition. The CMO request array SHALL remain permissive in cardinality and SHALL NOT use a schema `.max()` as an execution budget. Before dispatch, the application SHALL validate specialist IDs, mark invalid entries in the batch, deduplicate valid entries by `id` while retaining the first occurrence and its context directive, mark later occurrences as `duplicate`, and preserve the remaining relative order as declared clinical priority. It SHALL then synchronously admit only the ordered prefix allowed by remaining per-round and workflow-total consultation capacity, marking the suffix `budget_rejected`. A `ConsultationRecord` SHALL be created only for an admitted batch entry. Duplicate, invalid, and budget-rejected entries SHALL NOT create consultations or consume consultation capacity. A specialist requested again in a later round remains eligible for a distinct consultation, subject to the capacity available in that later round.

#### Scenario: CMO requests same specialist twice in one round
- **WHEN** the CMO output includes `[{id: "cardiologist"}, {id: "cardiologist"}]` in the same round
- **THEN** the batch records both entries, marks the later entry `duplicate`, and dispatches at most one cardiologist consultation when consultation capacity is available

#### Scenario: Specialist can be consulted again in a later round
- **WHEN** the CMO requests `cardiologist` in round 1, then requests `cardiologist` again in round 2
- **THEN** the cardiologist is consulted in both rounds when each request has available capacity, because round deduplication does not prevent cross-round consultations; a request without capacity is recorded `budget_rejected` in its own batch

#### Scenario: Unique specialists in a round all get consulted
- **WHEN** the CMO requests `[{id: "cardiologist"}, {id: "neurologist"}, {id: "endocrinologist"}]` in a round
- **THEN** all three specialists are consulted when capacity allows; otherwise only the highest-priority ordered prefix is admitted and every remaining unique entry is recorded `budget_rejected`

### Requirement: CMO prompt includes available specialist IDs

The CMO's system prompt or instructions SHALL include the complete live list of available specialist IDs from the `specialists` registry at workflow initialization and in any bounded correction guidance. The structured specialist-request schema SHALL represent `id` as a non-empty bounded string rather than a generated enum so a structurally valid unknown ID reaches application-owned admission accounting. After structural parsing, the application SHALL validate every requested ID against the same live registry, record an unknown value as `invalid` in `RequestBatch` using only its privacy-safe bounded digest and stable reason code, and create no `ConsultationRecord` or consultation charge for it.

#### Scenario: CMO receives dynamic ID list on startup
- **WHEN** the diagnostic workflow initializes
- **THEN** the CMO's instructions include text like "Available specialist IDs: cardiologist, dermatologist, neurologist, ..." matching the actual live registered agents

#### Scenario: CMO requests a non-existent specialist
- **WHEN** the bounded structured output contains `{id: "cardiacSurgeon"}` and that value is not a registered ID
- **THEN** structural parsing succeeds, application validation records the entry as `invalid` with a privacy-safe digest/reason code, no consultation is created or charged, and any subsequent correction guidance includes the live valid ID list

#### Scenario: ID list stays in sync with agent registry
- **WHEN** a new specialist agent is added to or removed from the `specialists` record
- **THEN** the prompt list and application validator both reflect the same live registry automatically while the bounded-string schema requires no manual enum update
