## MODIFIED Requirements

### Requirement: Dynamic specialist IDs in CMO prompt

At workflow start, build the list of available specialist IDs from `Object.keys(specialists)` and inject it into the CMO prompt. The output schema's `id` field SHALL use a Zod `enum()` constraint using the actual keys. The `specialistsToConsult` array SHALL be capped at `MAX_SPECIALISTS_PER_ROUND` (default 5) via a schema `.max()` constraint, and cumulative consultations across rounds SHALL be capped at `MAX_TOTAL_SPECIALISTS` (default 12).

#### Scenario: CMO request constrained to registered IDs
- **WHEN** the CMO produces a `specialistsToConsult` entry with an ID not in the registry
- **THEN** structured-output validation rejects it

#### Scenario: CMO request exceeds the per-round cap
- **WHEN** the CMO produces more than `MAX_SPECIALISTS_PER_ROUND` entries
- **THEN** structured-output validation rejects the response or the workflow truncates to the cap

#### Scenario: Cumulative consultations reach the total budget
- **WHEN** the cumulative count of consulted specialists reaches `MAX_TOTAL_SPECIALISTS`
- **THEN** the workflow forces final report generation regardless of remaining rounds