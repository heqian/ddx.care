## ADDED Requirements

### Requirement: drug-shortages tool checks FDA drug shortage data

The system SHALL provide a `drug-shortages` Mastra tool that accepts a drug name or generic name search query and queries the OpenFDA drug shortages endpoint (`api.fda.gov/drug/shortage.json`), returning matching shortage records with drug name, shortage details, status, and associated company.

#### Scenario: Search for drug shortage
- **WHEN** a specialist calls `drug-shortages` with query "amoxicillin"
- **THEN** the tool returns any current or recent shortage records for amoxicillin products, including status and details

#### Scenario: No shortage found
- **WHEN** a specialist calls `drug-shortages` with query "aspirin" and no shortages exist
- **THEN** the tool returns an empty results array

### Requirement: food-adverse-events tool searches food and supplement adverse events

The system SHALL provide a `food-adverse-events` Mastra tool that accepts a search query and queries the OpenFDA CAERS endpoint (`api.fda.gov/food/event.json`), returning adverse event reports for foods, dietary supplements, and cosmetics including products, reactions, and outcomes.

#### Scenario: Search for supplement adverse events
- **WHEN** a specialist calls `food-adverse-events` with query "vitamin D"
- **THEN** the tool returns CAERS reports mentioning vitamin D products, including reactions and outcomes

#### Scenario: No events found
- **WHEN** a specialist calls `food-adverse-events` with query "xyznonexistent"
- **THEN** the tool returns an empty results array

### Requirement: device-adverse-events tool searches medical device adverse events

The system SHALL provide a `device-adverse-events` Mastra tool that accepts a search query and queries the OpenFDA device adverse event endpoint (`api.fda.gov/device/event.json`), returning adverse event reports for medical devices including device name, problem codes, and patient outcomes.

#### Scenario: Search for device adverse events
- **WHEN** a specialist calls `device-adverse-events` with query "pacemaker"
- **THEN** the tool returns device adverse event reports mentioning pacemakers, including problem descriptions and outcomes

#### Scenario: No events found
- **WHEN** a specialist calls `device-adverse-events` with query "xyznonexistent"
- **THEN** the tool returns an empty results array
