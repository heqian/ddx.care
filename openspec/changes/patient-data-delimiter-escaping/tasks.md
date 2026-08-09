## 1. Patient Data Encoding

- [ ] 1.1 Update `buildPatientSummary` in `src/backend/workflows/diagnostic-workflow.ts` to JSON-encode each patient field inside the `<patient_data>` boundary
- [ ] 1.2 Add Unicode normalization before encoding so lookalike delimiters are handled
- [ ] 1.3 Update the guard instruction to reference the encoded data form

## 2. Untrusted-Data Labels

- [ ] 2.1 Wrap each specialist consultation result in `<untrusted_consult id="...">` before pushing to `contextHistory`
- [ ] 2.2 Wrap each tool-result summary in `<untrusted_tool name="...">` before injection into the agent loop
- [ ] 2.3 Add a system-instruction prefix stating content within untrusted tags is data and must not be followed

## 3. Bounded Tool Output

- [ ] 3.1 Ensure tool executors return bounded summaries (counts, capped snippets, allowlisted fields) and that `onStepFinish` injects the bounded form
- [ ] 3.2 Cap raw API response text length before any agent sees it

## 4. Injection Evaluation Corpus

- [ ] 4.1 Add a versioned injection corpus covering delimiter breakout, Unicode normalization, specialist-to-CMO, and malicious tool results
- [ ] 4.2 Add an evaluation harness that runs the corpus against a real or judge model and records the pass rate
- [ ] 4.3 Wire the evaluation as a scheduled job, not on every PR

## 5. Tests

- [ ] 5.1 Update `tests/prompt-injection.test.ts` to assert that a literal `</patient_data>` in patient content does not break the boundary
- [ ] 5.2 Add a test asserting specialist results are wrapped in untrusted-data labels
- [ ] 5.3 Add a test asserting tool output injected into the agent loop is bounded
- [ ] 5.4 Add a test asserting Unicode lookalike delimiters are neutralized

## 6. Documentation and Verification

- [ ] 6.1 Update `AGENTS.md` to document the encoding, labels, bounding, and evaluation
- [ ] 6.2 Run `bun run lint`, `bun run typecheck`, and `bun run test`