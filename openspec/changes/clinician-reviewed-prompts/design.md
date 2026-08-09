## Context

The toxicologist prompt at `src/backend/agents/toxicologist.ts:27-35` lists *Amanita muscaria* under the cholinergic toxidrome, which is medically incorrect (its primary toxins are ibotenic acid/muscimol; the classic muscarinic mushroom syndrome is from *Inocybe*/*Clitocybe*). No prompt carries a version or review record. There are no regression tests for prompt medical facts. This indicates a systemic gap: 36 specialist prompts plus the CMO contain medical facts without clinician review or version control.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Correct the known toxicology error.
- Establish clinician review for all prompts.
- Version prompts and record reviews.
- Regression-test key medical facts.

**Non-Goals:**
- Replacing prompts with a clinical knowledge base (larger architectural change).
- Credentialing reviewers (the project records attribution; legal credentialing is out of scope).
- Translating prompts into other languages.

## Decisions

### D1: Correct the toxicology prompt

**Decision:** Rewrite the cholinergic toxidrome section to list organophosphates, carbamates, and muscarinic mushrooms (*Inocybe*, *Clitocybe*). Move *Amanita muscaria* to an isoxazole/ibotenic acid category. Add poison-control and emergency-escalation guidance.

**Rationale:** The current text is medically wrong and could cause incorrect antidote reasoning in a mushroom-ingestion case.

### D2: Clinician review process and record

**Decision:** Establish a `prompt-reviews/` directory (or a section in each agent file) recording, per prompt: reviewer name and credentials, review date, change summary, and `promptVersion`. A prompt SHALL not ship without a review record.

**Rationale:** A versioned review trail makes prompt medical accuracy auditable and deters unreviewed edits.

### D3: Prompt versioning

**Decision:** Each prompt exports a `promptVersion` string. The factory records the version in agent metadata. The report provenance (from the evidence-provenance-ledger change) includes the prompt versions used.

**Rationale:** Provenance without prompt versions cannot distinguish reports generated under corrected vs uncorrected prompts.

### D4: Medical-fact regression tests

**Decision:** Add `tests/prompt-medical-facts.test.ts` asserting the presence of key facts: cholinergic mushroom causes, opioid/salicylate antidotes, ACS/stroke/sepsis red flags in the CMO, etc. A test fails if a guarded fact is absent.

**Rationale:** Prompts are code-like artifacts with medical consequences; regression tests catch accidental removals.

## Risks / Trade-offs

- **[Clinician review is a human process]** → No automated gate can verify a clinician reviewed a prompt. **Mitigation:** Require the review record to exist; CI checks for the record file, not the review quality.
- **[Regression tests encode facts that may evolve]** → Medical guidance changes. **Mitigation:** A test fails loudly, prompting an updated review record rather than silent drift.
- **[Review records add maintenance overhead]** → Each prompt edit requires a review entry. **Mitigation:** This is the intended safety control for a medical-adjacent system.

## Migration Plan

1. Correct the toxicology prompt and add its review record.
2. Conduct clinician review of all prompts; record versions.
3. Add regression tests for guarded facts.
4. Rollback: reverting a prompt reverts its version and review record; regression tests catch unsafe reverts.

## Open Questions

- Should review records live in each agent file as a comment/constant or in a separate `prompt-reviews/` directory? (Leaning: separate directory to keep prompt source readable and reviews greppable.)
- How many medical facts should be regression-guarded initially? (Leaning: start with the highest-risk domains — toxicology, emergency, CMO red flags — and expand.)