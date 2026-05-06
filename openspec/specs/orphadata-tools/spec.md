## ADDED Requirements

### Requirement: rare-disease-search tool searches cached Orphadata diseases

The system SHALL provide a `rare-disease-search` Mastra tool that accepts a search query string and optional maxResults parameter, queries the `orphadata_diseases` SQLite table using case-insensitive LIKE matching on the `name` and `definition` columns, and returns matching diseases with their Orphacode, name, definition, disorder group, and disorder type.

#### Scenario: Search by disease name
- **WHEN** a specialist calls `rare-disease-search` with query "Gaucher"
- **THEN** the tool returns diseases matching "Gaucher" in the name, including ORPHA:558 "Gaucher disease" with its definition and type

#### Scenario: Search returns no results
- **WHEN** a specialist calls `rare-disease-search` with query "xyznonexistent"
- **THEN** the tool returns an empty results array

#### Scenario: Search is limited by maxResults
- **WHEN** a specialist calls `rare-disease-search` with query "syndrome" and maxResults=3
- **THEN** the tool returns at most 3 matching diseases

### Requirement: rare-disease-genes tool retrieves genes for a rare disease

The system SHALL provide a `rare-disease-genes` Mastra tool that accepts an Orphacode and queries the `orphadata_genes` SQLite table, returning all associated genes with their symbol, name, and source.

#### Scenario: Lookup genes for known disease
- **WHEN** a specialist calls `rare-disease-genes` with orphacode=558
- **THEN** the tool returns gene associations including GBA (glucosylceramidase beta) for Gaucher disease

#### Scenario: Lookup genes for disease with no gene data
- **WHEN** a specialist calls `rare-disease-genes` with orphacode=99999
- **THEN** the tool returns an empty genes array

### Requirement: rare-disease-phenotypes tool retrieves phenotypes for a rare disease

The system SHALL provide a `rare-disease-phenotypes` Mastra tool that accepts an Orphacode and queries the `orphadata_phenotypes` SQLite table, returning all associated phenotypes with their HPO ID, name, and frequency.

#### Scenario: Lookup phenotypes for known disease
- **WHEN** a specialist calls `rare-disease-phenotypes` with orphacode=558
- **THEN** the tool returns phenotype associations including HP:0002240 "Hepatomegaly" with frequency "Very frequent"

#### Scenario: Lookup phenotypes for disease with no phenotype data
- **WHEN** a specialist calls `rare-disease-phenotypes` with orphacode=99999
- **THEN** the tool returns an empty phenotypes array
