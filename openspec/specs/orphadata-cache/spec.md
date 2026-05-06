## ADDED Requirements

### Requirement: Orphadata rare disease data is loaded into SQLite at server startup

The system SHALL fetch rare disease datasets from the Orphadata API (`www.orphadata.com`) at server startup, parse the JSON responses, and insert normalized records into three SQLite tables: `orphadata_diseases`, `orphadata_genes`, and `orphadata_phenotypes`.

#### Scenario: Successful startup cache load
- **WHEN** the server starts and Orphadata API is reachable
- **THEN** the system fetches disease, gene, and phenotype datasets, parses them, creates SQLite tables with appropriate indexes, and inserts all records. A startup log message indicates the count of cached records.

#### Scenario: Orphadata API unavailable at startup
- **WHEN** the server starts but Orphadata API returns an error or times out
- **THEN** the system logs a warning, creates empty tables, and the server starts normally. Rare disease tools return empty results until data is available.

#### Scenario: Tables are recreated on each startup
- **WHEN** the server restarts
- **THEN** existing Orphadata tables are dropped and repopulated with fresh data from the API

### Requirement: orphadata_diseases table stores rare disease records

The `orphadata_diseases` table SHALL store one row per rare disease with columns: `orphacode` (integer, primary key), `name` (text), `definition` (text, nullable), `disorder_group` (text, nullable), and `disorder_type` (text, nullable). An index SHALL be created on `name` for fast text search.

#### Scenario: Disease record structure
- **WHEN** a disease is cached with Orphacode 558, name "Gaucher disease", definition "A rare disease..."
- **THEN** the row is inserted with all fields and is queryable by orphacode or name pattern

### Requirement: orphadata_genes table stores disease-gene associations

The `orphadata_genes` table SHALL store disease-gene associations with columns: `id` (integer, autoincrement primary key), `orphacode` (integer, foreign key), `gene_symbol` (text), `gene_name` (text, nullable), and `source` (text, nullable). An index SHALL be created on `orphacode`.

#### Scenario: Gene association record
- **WHEN** Gaucher disease (ORPHA:558) is associated with gene GBA
- **THEN** a row is inserted with orphacode=558, gene_symbol="GBA", gene_name="glucosylceramidase beta"

### Requirement: orphadata_phenotypes table stores disease-phenotype associations

The `orphadata_phenotypes` table SHALL store disease-phenotype associations with columns: `id` (integer, autoincrement primary key), `orphacode` (integer, foreign key), `hpo_id` (text), `phenotype_name` (text), and `frequency` (text, nullable). Indexes SHALL be created on `orphacode` and `hpo_id`.

#### Scenario: Phenotype association record
- **WHEN** Gaucher disease (ORPHA:558) has phenotype "Hepatomegaly" (HP:0002240) with frequency "Very frequent"
- **THEN** a row is inserted with orphacode=558, hpo_id="HP:0002240", phenotype_name="Hepatomegaly", frequency="Very frequent"
