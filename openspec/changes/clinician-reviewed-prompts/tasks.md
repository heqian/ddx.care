## 1. Toxicology Prompt Correction

- [ ] 1.1 Rewrite the cholinergic toxidrome section in `src/backend/agents/toxicologist.ts` to list organophosphates, carbamates, and muscarinic mushrooms (*Inocybe*, *Clitocybe*)
- [ ] 1.2 Move *Amanita muscaria* to an isoxazole/ibotenic acid category
- [ ] 1.3 Add poison-control and emergency-escalation guidance to the toxicologist triage rules

## 2. Clinician Review Process

- [ ] 2.1 Create a `prompt-reviews/` directory with one review record per specialist and the CMO, recording reviewer, credentials, date, change summary, and `promptVersion`
- [ ] 2.2 Conduct clinician review of all 36 specialist prompts and the CMO prompt; record corrections
- [ ] 2.3 Add a CI check that a review record exists for each prompt

## 3. Prompt Versioning

- [ ] 3.1 Add a `promptVersion` export to each agent prompt module and the CMO
- [ ] 3.2 Record the prompt version in agent metadata via the factory
- [ ] 3.3 Include prompt versions in the report provenance metadata

## 4. Medical-Fact Regression Tests

- [ ] 4.1 Create `tests/prompt-medical-facts.test.ts` asserting key facts: cholinergic mushroom causes, antidote mappings, CMO red flags (ACS, stroke, sepsis, anaphylaxis, ectopic pregnancy, overdose, suicidality)
- [ ] 4.2 Ensure a missing guarded fact fails the test

## 5. Documentation and Verification

- [ ] 5.1 Document the clinician review process in `AGENTS.md`
- [ ] 5.2 Run `bun run lint`, `bun run typecheck`, and `bun run test`