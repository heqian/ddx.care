## MODIFIED Requirements

### Requirement: All tools are available to all specialist agents and the CMO

The system SHALL assign tools to specialist agents by category. Each specialist SHALL receive only the tools relevant to their domain. The CMO agent SHALL receive a minimal tool set limited to `drug-interaction` and `medlineplus-search` for evidence verification during synthesis.

#### Scenario: Geneticist receives rare disease tools but not drug interaction
- **WHEN** the geneticist agent is initialized
- **THEN** it has access to `rare-disease-search`, `rare-disease-genes`, `rare-disease-phenotypes`, `hpo-term-search`, `loinc-test-lookup`, and universal tools, but NOT `drug-interaction` or `drug-spelling-suggestion`

#### Scenario: Toxicologist receives toxicology tools
- **WHEN** the toxicologist agent is initialized
- **THEN** it has access to `substance-toxicology`, universal tools, and prescribing tools (`drug-interaction`, `drug-lookup`, `drug-spelling-suggestion`, `drug-shortages`), but NOT `rare-disease-search`

#### Scenario: CMO has minimal tool set
- **WHEN** the CMO agent is initialized
- **THEN** it has access to only `drug-interaction` and `medlineplus-search`, not `clinical-trials-search`, `rare-disease-search`, or other specialist tools

#### Scenario: Universal tools available to all specialists
- **WHEN** any specialist agent is initialized
- **THEN** it has access to universal tools: `medlineplus-search`, `drug-labeling`, `adverse-events`, `food-adverse-events`, and `device-adverse-events`

#### Scenario: Oncologist receives trial search tools
- **WHEN** the oncologist agent is initialized
- **THEN** it has access to `clinical-trials-search` in addition to universal and prescribing tools
