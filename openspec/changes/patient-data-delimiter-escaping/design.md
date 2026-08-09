## Context

`buildPatientSummary` at `src/backend/workflows/diagnostic-workflow.ts:178-195` inserts patient fields raw inside `<patient_data>` tags. Specialist results are pasted into later CMO context at `diagnostic-workflow.ts:1064`, `1086-1089`. Tool output returns raw API prose into the agent loop. `jsonPromptInjection: true` at `diagnostic-workflow.ts:574`, `835` is structured-output coercion, not injection defense. The injection test at `tests/prompt-injection.test.ts:82-113` checks marker placement, not the exact `</patient_data>` breakout.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Prevent literal delimiter breakout.
- Label untrusted model/tool-derived content.
- Bound tool output.
- Evaluate injection resistance against a corpus.

**Non-Goals:**
- Perfect injection prevention (impossible for natural language).
- Replacing the single-prompt agent interface (Mastra constraint).
- Removing tools from agents.

## Decisions

### D1: JSON-encode patient fields inside the boundary

**Decision:** Inside `<patient_data>`, emit each field as a JSON string literal (e.g., `"--- MEDICAL HISTORY ---\n<escaped content>"`). JSON encoding escapes `<`, `>`, backticks, and quotes, so `</patient_data>` becomes `<\/patient_data>`-equivalent and cannot close the tag.

**Rationale:** JSON is reversible, well-understood, and models parse it as data. It is more robust than ad-hoc escaping.

**Alternatives considered:**
- Replace `</patient_data>` with a placeholder — fragile; misses Unicode lookalikes.
- Use a random per-call delimiter — stronger but Mastra takes a single prompt string and the random token must still be escaped against.

### D2: Untrusted-data labels for specialist and tool content

**Decision:** Wrap each consultation result as `<untrusted_consult id="cardiologist">...</untrusted_consult>` and each tool summary as `<untrusted_tool name="drug-interaction">...</untrusted_tool>`. Add a system-instruction prefix stating content within these tags is data and must not be followed.

**Rationale:** Labels create a structural distinction the CMO can recognize, mirroring the patient-data boundary pattern.

### D3: Bounded tool output

**Decision:** Tool executors SHALL return bounded summaries (counts, capped snippets, allowlisted fields) to the agent via the existing `summarizeToolResult` path, and the `onStepFinish` handler SHALL inject the bounded form rather than raw API text.

**Rationale:** Raw multi-kilobyte API responses are both a token-cost and an injection vector. Bounding reduces both.

### D4: Evaluated injection corpus

**Decision:** Add a corpus of injection cases (delimiter breakout, Unicode normalization, specialist-to-CMO, malicious tool results) and an evaluation harness that runs them against a real model or an adversarial judge, recording the pass rate. The corpus is versioned and clinician-reviewed for safety.

**Rationale:** The current marker-placement test does not measure resistance. An evaluated corpus creates a measurable baseline and regression guard.

## Risks / Trade-offs

- **[JSON encoding increases token usage]** → Escaped content is slightly longer. **Mitigation:** The increase is small for typical clinical text; the safety benefit outweighs it.
- **[Labels are not a perfect defense]** → A sophisticated attack may still influence the model. **Mitigation:** This is a research demo; the combination of encoding, labels, bounding, and evaluation is materially stronger than the current single-sentence guard.
- **[Evaluated corpus requires model calls]** → Running the corpus costs provider budget. **Mitigation:** Run it as a scheduled job, not on every PR.

## Migration Plan

1. Deploy backend with encoding, labels, and bounding; existing tests are updated.
2. Add the injection corpus as a scheduled evaluation.
3. Rollback: revert to raw insertion (unsafe but backward-compatible).

## Open Questions

- Should the untrusted-data labels use XML or a JSON envelope for the whole context? (Leaning: XML labels for compatibility with the existing boundary pattern; revisit if the model performs better with JSON.)
- Should the injection corpus run against the production model or a cheaper judge model? (Leaning: production model for the cases that matter; judge model for scale.)