## 1. Config

- [ ] 1.1 Add `MAX_SPECIALISTS_PER_ROUND` (default 5) and `MAX_TOTAL_SPECIALISTS` (default 12) to `src/backend/config.ts` with validation
- [ ] 1.2 Document both in `.env.example` and `AGENTS.md`

## 2. Schema and Budget Enforcement

- [ ] 2.1 Add `.max(MAX_SPECIALISTS_PER_ROUND)` to the `specialistsToConsult` array schema in `src/backend/workflows/diagnostic-workflow.ts`
- [ ] 2.2 Track a cumulative `consultedCount` across rounds; before dispatch, truncate requests to the remaining total budget and emit a progress event
- [ ] 2.3 When `consultedCount >= MAX_TOTAL_SPECIALISTS`, force final report generation instead of requesting more specialists
- [ ] 2.4 Update the CMO prompt in `src/backend/agents/chief-medical-officer.ts` to state the per-round and total caps explicitly

## 3. Context Budget and Packing

- [ ] 3.1 Rewrite `buildCmoContext` to enforce `maxChars` as a hard limit: truncate the patient summary independently, pack newest rounds first, no exemption for the first two entries
- [ ] 3.2 Rewrite `buildSpecialistContext` to exclude patient data (already in the prompt) and pack newest consultation results first
- [ ] 3.3 Append truncation notices where content is cut

## 4. Tests

- [ ] 4.1 Update `tests/workflow.test.ts` to assert the hard CMO context limit (replace the test at line 863-872 that asserts exemption)
- [ ] 4.2 Add a test asserting `buildCmoContext` truncates an oversized patient summary to fit `maxChars`
- [ ] 4.3 Add a test asserting `buildSpecialistContext` includes newest prior-round findings and excludes patient data
- [ ] 4.4 Add a test asserting the schema rejects a `specialistsToConsult` array exceeding `MAX_SPECIALISTS_PER_ROUND`
- [ ] 4.5 Add a test asserting the workflow forces final report generation when `MAX_TOTAL_SPECIALISTS` is reached

## 5. Verification

- [ ] 5.1 Run `bun run lint`, `bun run typecheck`, and `bun run test`