## Purpose

Makes the completeness of every drug-interaction check explicit so missing evidence cannot be mistaken for a verified negative result.

## ADDED Requirements

### Requirement: Interaction checks report per-drug coverage
The interaction result SHALL include one coverage entry for every requested drug. Each entry SHALL identify whether the drug was resolved and successfully checked, unresolved, or failed because the source was unavailable.

#### Scenario: Every drug is resolved and checked
- **WHEN** all requested drugs resolve and all interaction-source requests succeed
- **THEN** every coverage entry is `checked` and aggregate coverage is `complete`

#### Scenario: One drug cannot be resolved
- **WHEN** one requested drug cannot be mapped to a recognized drug identity
- **THEN** that drug is `unresolved` and aggregate coverage is `partial`

#### Scenario: Every source request fails
- **WHEN** no requested drug can be checked because the source is unavailable
- **THEN** aggregate coverage is `unavailable` and the tool does not report a negative interaction result

### Requirement: Negative interaction claims require complete coverage
The tool SHALL report `none_found` only when aggregate coverage is `complete` and no interactions were detected. Partial or unavailable coverage SHALL produce `unknown`, even when the interactions array is empty.

#### Scenario: Complete successful check finds no interaction
- **WHEN** aggregate coverage is `complete` and no source evidence identifies an interaction
- **THEN** the interaction status is `none_found`

#### Scenario: Partial check finds no interaction
- **WHEN** aggregate coverage is `partial` and the checked subset contains no interaction
- **THEN** the interaction status is `unknown`, not `none_found`

#### Scenario: Partial check finds an interaction
- **WHEN** aggregate coverage is `partial` and a checked source identifies an interaction
- **THEN** the interaction status is `found`, the finding is returned, and the incomplete-coverage warning is retained

### Requirement: Source limitations are visible to agents
The interaction result SHALL identify the evidence source and SHALL state that absence of a literal drug mention in label text is not proof that no interaction exists.

#### Scenario: Agent receives an FDA-label negative result
- **WHEN** complete label retrieval finds no literal interaction mention
- **THEN** the result includes the source limitation and does not describe the result as a comprehensive clinical clearance
