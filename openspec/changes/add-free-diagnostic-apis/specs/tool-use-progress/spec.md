## MODIFIED Requirements

### Requirement: Tool names map to human-readable labels

Each tool ID used in progress events SHALL map to a short, user-facing label via a static lookup table. Labels SHALL use present-tense action phrases suitable for UI display. The lookup table SHALL include labels for all 24 tools (16 existing + 8 new).

#### Scenario: Known tool maps to label
- **WHEN** `toolName` is `"pubmed-search"`
- **THEN** the human-readable label is `"Searching PubMed"`

#### Scenario: New Orphadata tool maps to label
- **WHEN** `toolName` is `"rare-disease-search"`
- **THEN** the human-readable label is `"Searching rare diseases"`

#### Scenario: New HPO tool maps to label
- **WHEN** `toolName` is `"hpo-term-search"`
- **THEN** the human-readable label is `"Searching phenotype terms"`

#### Scenario: New LOINC tool maps to label
- **WHEN** `toolName` is `"loinc-test-lookup"`
- **THEN** the human-readable label is `"Looking up lab test"`

#### Scenario: New drug shortages tool maps to label
- **WHEN** `toolName` is `"drug-shortages"`
- **THEN** the human-readable label is `"Checking drug shortages"`

#### Scenario: New food adverse events tool maps to label
- **WHEN** `toolName` is `"food-adverse-events"`
- **THEN** the human-readable label is `"Searching food adverse events"`

#### Scenario: New device adverse events tool maps to label
- **WHEN** `toolName` is `"device-adverse-events"`
- **THEN** the human-readable label is `"Searching device adverse events"`

#### Scenario: Unknown tool uses fallback
- **WHEN** `toolName` is an unrecognized ID not in the label map
- **THEN** the label falls back to `"Running {toolName}"` with the raw tool ID

## ADDED Requirements

### Requirement: All tools are available to all specialist agents and the CMO

Every tool registered in the system SHALL be available to all 36 specialist agents and the Chief Medical Officer agent without per-specialist restrictions. The `getToolsForSpecialist(id)` function SHALL return the same set of tools regardless of the specialist ID passed.

#### Scenario: Geneticist accesses drug interaction tool
- **WHEN** the geneticist agent is initialized
- **THEN** it has access to `drug-interaction` tool alongside `omim-search` and all other tools

#### Scenario: All specialists get new tools
- **WHEN** any specialist agent is initialized
- **THEN** it has access to all 8 new tools (rare-disease-search, rare-disease-genes, rare-disease-phenotypes, hpo-term-search, loinc-test-lookup, drug-shortages, food-adverse-events, device-adverse-events) in addition to all 16 existing tools

#### Scenario: CMO has all tools
- **WHEN** the CMO agent is initialized
- **THEN** it has access to all 24 tools for orchestrating specialist consultations
