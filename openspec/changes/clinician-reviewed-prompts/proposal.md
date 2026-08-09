## Why

The toxicologist prompt incorrectly lists *Amanita muscaria* as a canonical cholinergic mushroom cause. Its characteristic toxicity is primarily from ibotenic acid/muscimol and is not the classic muscarinic cholinergic mushroom syndrome associated with genera such as *Inocybe* and *Clitocybe*. In a mushroom-ingestion case this could produce the wrong toxidrome classification and inappropriate antidote reasoning. This single error indicates that all 36 specialist prompts and the CMO prompt contain medical facts that have not been systematically reviewed by a qualified clinician, and there is no versioned review trail or regression test guarding prompt medical accuracy.

## What Changes

- **Correct the toxicology prompt error**: separate muscarinic mushroom poisoning from *Amanita muscaria* isoxazole toxicity and add poison-control/emergency escalation.
- **Clinician review of all specialist and CMO prompts**: a qualified clinician SHALL review every specialist and CMO prompt for medical accuracy; corrections SHALL be recorded with reviewer attribution and date.
- **Versioned prompt review trail**: each prompt SHALL carry a `promptVersion` and a review record (reviewer, date, change summary) stored alongside the prompt source.
- **Prompt medical-fact regression tests**: add tests asserting key medical facts in prompts (e.g., toxidrome causes, antidote mappings, red-flag symptoms) so regressions are caught.

## Capabilities

### New Capabilities

- `clinician-reviewed-prompts`: Establishes that specialist and CMO prompts are clinician-reviewed for medical accuracy, versioned, and guarded by regression tests so prompt medical facts are correct and traceable.

## Impact

- **Backend**: `src/backend/agents/toxicologist.ts` (toxidrome correction), all `src/backend/agents/*.ts` prompts, `src/backend/agents/chief-medical-officer.ts`, `src/backend/agents/factory.ts` (version metadata), `src/backend/config.ts` (prompt version).
- **Tests**: new `tests/prompt-medical-facts.test.ts`.
- **Documentation**: `AGENTS.md` (clinician review process), a new `prompt-reviews/` record or section.