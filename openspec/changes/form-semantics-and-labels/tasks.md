## 1. Native Form and Labels

- [ ] 1.1 Wrap the case-entry fields in `src/frontend/pages/InputDashboard.tsx` in a `<form onSubmit={handleSubmit}>`; update `handleSubmit` to `e.preventDefault()` then proceed
- [ ] 1.2 Change the submit `Button` to `type="submit"`
- [ ] 1.3 Add stable `id`s to every input and textarea and connect each `<label>` via `htmlFor`
- [ ] 1.4 Add programmatic labels to the three clinical textareas

## 2. Field Grouping and Input Semantics

- [ ] 2.1 Group the patient-context fields in `<fieldset><legend>Patient Context</legend>`
- [ ] 2.2 Set `inputMode="numeric"` on the age input
- [ ] 2.3 Add `name` attributes to all fields

## 3. Submit-Time Validation Feedback

- [ ] 3.1 When submission is disabled due to empty content, show a `role="alert"` message explaining the requirement
- [ ] 3.2 On Enter submission while disabled, focus the validation message

## 4. Accessible Descriptions

- [ ] 4.1 Give each `CharCount` a stable `id` and reference it from the textarea via `aria-describedby`

## 5. Tests

- [ ] 5.1 Add `tests/frontend.test.tsx` cases: each input/textarea has an associated label; Enter submits the form; disabled submission shows and announces the validation message
- [ ] 5.2 Add a test asserting the patient-context fields are grouped in a fieldset/legend
- [ ] 5.3 Add a test asserting the age input has `inputMode="numeric"`
- [ ] 5.4 Update `tests/e2e/helpers.ts` to select fields by label instead of placeholder

## 6. Documentation and Verification

- [ ] 6.1 Update `AGENTS.md` accessibility notes
- [ ] 6.2 Run `bun run lint`, `bun run typecheck`, `bun run test:frontend`, and E2E tests