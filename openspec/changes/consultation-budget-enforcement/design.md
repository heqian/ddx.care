## Context

The CMO structured output array at `src/backend/workflows/diagnostic-workflow.ts:837-853` has no `.max()`. The prompt at `src/backend/agents/chief-medical-officer.ts:77-84` recommends 2–5 but the application executes every valid ID. `buildCmoContext` at `diagnostic-workflow.ts:317-347` returns the full context when `contextHistory.length <= 2`, allowing ~150,000 characters (3 × 50,000) into initial CMO calls. `buildSpecialistContext` at `diagnostic-workflow.ts:272-315` slices `contextHistory` from index 1 and truncates from the front, so with realistic input a later specialist receives another copy of patient data but no prior findings. The oversize behavior is explicitly tested as desired at `tests/workflow.test.ts:863-872`.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Bound per-round and total specialist calls.
- Make the CMO context cap a real hard limit.
- Fix specialist context packing so prior findings survive.

**Non-Goals:**
- Token-based budgeting (character-based is a pragmatic proxy; token budgeting is a follow-up).
- Changing the CMO's clinical selection logic beyond communicating the cap.
- Removing the multi-round architecture.

## Decisions

### D1: Schema `.max()` plus cumulative budget

**Decision:** Add `.max(MAX_SPECIALISTS_PER_ROUND)` to the `specialistsToConsult` array schema. Track a cumulative `consultedCount`; before each round, if `consultedCount + requested.length > MAX_TOTAL_SPECIALISTS`, truncate the request to the remaining budget and emit a progress event. If `consultedCount >= MAX_TOTAL_SPECIALISTS`, force final report generation.

**Rationale:** The schema cap rejects gross over-requests at validation time. The cumulative budget handles the case where many small rounds accumulate. Truncating preserves the CMO's priority order.

**Alternatives considered:**
- Reject and re-prompt on any over-cap — wastes a round and a retry; truncation is faster and deterministic.
- Hardcode the cap in the prompt only — LLMs are non-deterministic; the schema must enforce.

### D2: Hard CMO context budget with patient truncation

**Decision:** Rewrite `buildCmoContext` to: truncate the patient summary (entry 1) independently to `maxChars * 0.5` if needed; then pack newest rounds first into the remaining budget; include the case header (entry 0) without exemption. The total assembled context SHALL NOT exceed `maxChars`.

**Rationale:** The current exemption for the first two entries defeats the cap. Reserving ~50% for the patient summary and packing newest rounds first preserves the most decision-relevant recent findings.

**Alternatives considered:**
- Summarize the patient summary with an LLM call — adds latency and cost; character truncation with a notice is deterministic.
- Drop the patient summary entirely in later rounds — specialists already saw it; the CMO needs a reminder but not the full 50,000 chars.

### D3: Specialist context packing fix

**Decision:** Rewrite `buildSpecialistContext` to: never include patient data (it is already in the specialist prompt separately); build context only from `contextHistory.slice(2)` (consultation results); pack newest results first into `SPECIALIST_CONTEXT_MAX_CHARS`.

**Rationale:** Patient data is appended to every specialist prompt at `diagnostic-workflow.ts:1013-1015`. Including it again in context wastes budget and displaces findings.

## Risks / Trade-offs

- **[Schema `.max()` rejects valid-but-large requests]** → A clinically complex case needing 6 specialists in one round would be truncated to 5. **Mitigation:** The cap is configurable; 5 matches the CMO's stated guidance, and the workflow can use multiple rounds.
- **[Patient truncation loses detail]** → Truncating a 50,000-char history to 30,000 chars loses later content. **Mitigation:** Reserve enough budget and append a truncation notice; the CMO can request the relevant specialist for detail.
- **[Cumulative budget forces early synthesis]** → A case needing 15 specialists would stop at 12. **Mitigation:** 12 is generous for a POC and configurable; forcing synthesis is safer than running out of time.

## Migration Plan

1. Deploy backend; the caps take effect with safe defaults.
2. Update `tests/workflow.test.ts:863-872` to assert the hard limit instead of asserting exemption.
3. Rollback: remove the `.max()` and revert `buildCmoContext` (unsafe but backward-compatible).

## Open Questions

- Should the per-round cap truncate or request a corrected response? (Leaning: truncate by CMO priority order; faster and deterministic.)
- Should the patient-summary reservation ratio be configurable? (Leaning: no for now; 50% is a reasonable default.)