## ADDED Requirements

### Requirement: hpo-term-search tool searches Human Phenotype Ontology terms

The system SHALL provide an `hpo-term-search` Mastra tool that accepts a search string and optional maxResults parameter, queries the NLM Clinical Tables HPO API (`clinicaltables.nlm.nih.gov/api/hpo/v3/search`), and returns matching HPO terms with their ID, name, and definition.

#### Scenario: Search for phenotype by term
- **WHEN** a specialist calls `hpo-term-search` with query "hepatomegaly"
- **THEN** the tool returns HPO terms matching "hepatomegaly", including HP:0002240 "Hepatomegaly" with its definition

#### Scenario: Search returns no results
- **WHEN** a specialist calls `hpo-term-search` with query "xyznonexistent"
- **THEN** the tool returns an empty results array

#### Scenario: Search with custom result count
- **WHEN** a specialist calls `hpo-term-search` with query "blood" and maxResults=10
- **THEN** the tool returns at most 10 matching HPO terms

### Requirement: loinc-test-lookup tool searches LOINC lab test codes

The system SHALL provide a `loinc-test-lookup` Mastra tool that accepts a search string and optional maxResults parameter, queries the NLM Clinical Tables LOINC API (`clinicaltables.nlm.nih.gov/api/loinc_items/v3/search`), and returns matching lab tests with their LOINC code, test name, and available units.

#### Scenario: Search for lab test by name
- **WHEN** a specialist calls `loinc-test-lookup` with query "hemoglobin"
- **THEN** the tool returns LOINC tests matching "hemoglobin", including LOINC code 718-7 "Hemoglobin [Mass/volume] in Blood" with units

#### Scenario: Search returns no results
- **WHEN** a specialist calls `loinc-test-lookup` with query "xyznonexistent"
- **THEN** the tool returns an empty results array

#### Scenario: Search with custom result count
- **WHEN** a specialist calls `loinc-test-lookup` with query "glucose" and maxResults=5
- **THEN** the tool returns at most 5 matching LOINC tests
