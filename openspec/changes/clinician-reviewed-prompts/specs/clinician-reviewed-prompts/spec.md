## Purpose

Ensures specialist and CMO prompts are reviewed by a qualified clinician for medical accuracy, versioned with a review trail, and guarded by regression tests so prompt-embedded medical facts are correct and changes are traceable.

## ADDED Requirements

### Requirement: Prompts are clinician-reviewed for medical accuracy

Every specialist prompt and the CMO prompt SHALL be reviewed by a qualified licensed clinician for medical accuracy before deployment. The review SHALL cover toxidrome causes, antidote mappings, red-flag symptoms, triage rules, and delegation guidance. Corrections SHALL be recorded with reviewer attribution and date.

#### Scenario: Toxicology prompt corrected
- **WHEN** the toxicologist prompt is reviewed
- **THEN** muscarinic mushroom poisoning is separated from *Amanita muscaria* isoxazole toxicity, *Inocybe*/*Clitocybe* are listed as cholinergic mushroom causes, and poison-control/emergency escalation is present

#### Scenario: All prompts have a review record
- **WHEN** the prompt review trail is inspected
- **THEN** every specialist and CMO prompt has a recorded reviewer, date, and change summary

### Requirement: Prompts are versioned

Each prompt SHALL carry a `promptVersion` identifier. When a prompt's medical content changes, the version SHALL increment and the review record SHALL be updated. The `promptVersion` SHALL be included in the report's provenance metadata.

#### Scenario: Prompt change increments the version
- **WHEN** a clinician corrects a toxidrome cause in the toxicologist prompt
- **THEN** the prompt's `promptVersion` increments and the review record is updated

#### Scenario: Provenance includes prompt versions
- **WHEN** a report is finalized
- **THEN** the provenance metadata includes the `promptVersion` of each prompt used

### Requirement: Prompt medical facts are regression-tested

Key medical facts embedded in prompts SHALL be covered by regression tests asserting their presence and correctness (e.g., toxidrome causes, antidote mappings, red-flag symptoms). A change that removes or alters a guarded fact SHALL fail the test unless accompanied by a review record.

#### Scenario: Toxidrome cause regression
- **WHEN** the toxicologist prompt no longer lists *Inocybe*/*Clitocybe* as cholinergic mushroom causes
- **THEN** the regression test fails

#### Scenario: Antidote mapping regression
- **WHEN** an antidote mapping is removed from a prompt
- **THEN** the regression test fails unless the review record documents the change