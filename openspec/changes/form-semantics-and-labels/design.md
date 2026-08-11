## Context

`InputDashboard` currently renders its case controls in a `div`, calls `handleSubmit` from the submit button's `onClick`, and uses `canSubmit` to natively disable that button for empty content, an invalid age, or an over-limit textarea. That prevents an invalid submission attempt from reaching application validation. Once the content is wrapped in a form, the existing Clear All and dictation buttons would also default to submit buttons because they do not declare a type.

Age has an `id`, but its label is not associated; Sex, Chief Complaint, and all three clinical textareas lack complete label/id/name associations. Character counters are visible but have no IDs or description relationships. The three FileDropZone components expose a separately named keyboard-operable `role="button"`; each delegates to a hidden, `aria-hidden`, non-tabbable file input that is an implementation detail rather than a primary user-facing field.

The current component tests cover only part of the age structure, and Chromium helpers and flow tests locate case controls by placeholder and expect the invalid submit button to be disabled. See `proposal.md` for motivation and the capability spec for required behavior.

## Goals / Non-Goals

**Goals:**
- Use standard form submission without a second click or keyboard submission path.
- Make an invalid submission actionable and provide focused, programmatic feedback.
- Give all six user-facing case controls stable labels, identifiers, grouping, and persistent descriptions where guidance is needed.
- Preserve heading navigation and native multiline keyboard behavior.
- Verify semantics in component tests and browser behavior in the configured Chromium project.

**Non-Goals:**
- Redesigning FileDropZone or exposing its hidden file inputs.
- Redesigning the page layout or changing the diagnosis request payload.
- Replacing the existing age, character-limit, or server-error rules with a new validation framework.
- Performing a broader accessibility audit outside the case-entry form.

## Decisions

### D1: The form onSubmit handler is the only submission path

**Decision:** Replace the outer case-entry container with a `<form onSubmit={handleSubmit}>`. `handleSubmit` accepts the form submit event and calls `preventDefault()` before validation. The diagnosis submit Button is `type="submit"` and has no `onClick` submission handler. No keydown handler simulates submission; Enter in a single-line text input relies on the browser's native form behavior, while Enter in a textarea retains its native newline behavior.

Every other native button rendered inside the form, including Clear All and both dictation controls, explicitly uses `type="button"`. The FileDropZone trigger remains a `div` with `role="button"`, so it has no button type.

**Rationale:** One event path prevents click and keyboard behavior from drifting or firing duplicate requests. Explicit non-submit types prevent incidental actions from becoming submit controls after the form wrapper is introduced.

**Alternative considered:** Keep the submit Button's `onClick` and add a form handler or keydown handler. Rejected because it creates parallel paths and makes Enter behavior harder to verify.

### D2: Validation does not make the submit control inert

**Decision:** Use a normal, activatable submit control for empty, invalid-age, and over-limit states. Its native `disabled` attribute is set only while `submitting` is true, preventing duplicate in-flight requests. The form submit handler evaluates the current values independently of prior interaction, marks Age as touched/validated when submission is attempted, blocks the API call when any existing validation rule fails, and surfaces the corresponding feedback. It does not add native constraints that would prevent the submit event from reaching the handler.

Every failed client-validation attempt renders or updates one stable validation summary with `role="alert"`, `tabIndex={-1}`, and a ref. After each failed attempt, focus moves to that alert, including when the same errors remain and the alert is already mounted. Field-level feedback remains next to and associated with the affected control. Correcting a value removes that field's resolved error state and removes the summary when no validation errors remain, but correction never moves focus away from the edited control. Server errors remain distinct from this client-validation summary.

**Rationale:** Disabled controls cannot be activated or focused and therefore cannot explain an unmet cross-field rule. A programmatically focusable alert gives both keyboard and assistive-technology users an immediate destination while preserving one submit path.

**Alternative considered:** Add `aria-disabled="true"` while leaving the button clickable and enforce it in JavaScript. Rejected for this implementation because a normal submit control communicates the intended "attempt to validate" behavior more directly and needs fewer exceptional activation rules.

### D3: The six primary controls have fixed label and identifier mappings

**Decision:** Use the following stable associations:

| Visible label | Control | `id` | `name` |
|---|---|---|---|
| Age | text input | `age-input` | `age` |
| Sex | select | `sex-select` | `sex` |
| Chief Complaint | text input | `chief-complaint-input` | `chiefComplaint` |
| Medical History | textarea | `medical-history-input` | `medicalHistory` |
| Conversation Transcript | textarea | `conversation-transcript-input` | `conversationTranscript` |
| Lab Results | textarea | `lab-results-input` | `labResults` |

Each visible label uses `htmlFor` to reference its control's `id`. The current hidden FileDropZone file inputs remain `aria-hidden` and non-tabbable and do not receive labels, IDs, or names in this change. Their user-facing drop-zone triggers retain their existing accessible names. If a future design exposes a native file input as an operable control, that control must then receive its own complete association.

**Rationale:** A fixed mapping makes accessible names and test locators deterministic without incorrectly treating hidden implementation inputs as seven through nine primary fields.

### D4: Heading navigation and label scope remain distinct

**Decision:** Keep the existing `h2` for each clinical section. Inside each heading, wrap only the visible text in the textarea's `<label htmlFor>`; decorative icons remain outside the label and hidden from assistive technology. Dictation buttons, counters, textareas, and upload zones remain siblings rather than label descendants.

Keep the visible Patient Context `h2`. Wrap Age, Sex, and Chief Complaint in one `fieldset` with a non-empty `legend` naming the group. The legend may use the existing visually-hidden utility to avoid duplicate visible "Patient Context" copy, but it remains in the accessibility tree.

**Rationale:** Users retain heading navigation while clicking the heading text focuses the intended textarea. Narrow label contents prevent action buttons or helper content from becoming part of a control's accessible name.

### D5: Age keeps text behavior and gains a numeric hint

**Decision:** Keep Age as `type="text"`, add `inputMode="numeric"`, and render a persistent instruction such as "Age in years; use 1 to 3 digits." The hint has a stable ID referenced by Age's `aria-describedby`. Submission validates the current Age even when it came from a draft and the user has not interacted with it; an invalid value puts Age in its touched/validated state, appends the stable error ID to `aria-describedby`, and sets `aria-invalid="true"`. Correcting Age removes the error reference and invalid state while retaining the hint reference and current focus.

**Rationale:** `inputMode` requests a numeric mobile keyboard without the spinner and value-coercion behavior of `type="number"`; application validation continues to own the one-to-three-digit rule.

### D6: Instructions and counters are persistent descriptions, not per-key live output

**Decision:** Render a persistent shared instruction stating that at least one of Medical History, Conversation Transcript, or Lab Results is required. Render persistent field-specific guidance for each clinical textarea rather than relying on placeholder text alone. Give the shared instruction, each field instruction, each character counter, and each field-specific over-limit message a stable ID. Each textarea's `aria-describedby` contains the shared instruction ID, its own instruction ID, and its own counter ID; when its value exceeds 50,000 characters, append its own over-limit message ID and set `aria-invalid="true"`. Returning to 50,000 or fewer characters removes only that error reference and invalid state and does not move focus. Placeholder examples may remain visual supplements but are not labels, required instructions, or test hooks.

The counters update visually and remain available through `aria-describedby`, but they do not use `aria-live`, `role="status"`, or `role="alert"`; every keystroke must not trigger an announcement. Validation alerts are announced only when a validation state first appears or a submit attempt requests feedback, and are not repeatedly remounted for each character.

**Rationale:** Persistent descriptions survive typing and satisfy users who cannot perceive placeholder text. Keeping raw counts out of live regions avoids noisy announcements while leaving the current count discoverable.

### D7: Component tests verify structure; Chromium verifies browser keyboard behavior

**Decision:** Extend `tests/frontend.test.tsx` to verify all six label/control associations, stable IDs and names, grouping, numeric and description attributes, validation alert focus, submit availability, and native button types. Component validation tests dispatch a form submission or activate the submit control; they do not use happy-dom as proof of browser implicit-submit behavior. They also cover valid clinical content with an untouched invalid Age and a 50,001-character clinical field. Each case asserts no diagnosis POST, the affected control's invalid and description associations, focus on the summary after the first and repeated invalid attempts, and correction that clears the resolved error without moving focus from the edited control. The Age case additionally verifies that submit puts the untouched field into its touched/validated state while preserving its persistent hint relationship.

Add Chromium cases in `tests/full-flow.spec.ts` that press Enter in a labeled single-line text input with empty clinical content, press Enter in a labeled single-line text input after valid clinical content is present, and press Enter in a labeled textarea. The tests respectively verify focused validation with no request, native submission, and newline insertion with no submission. Add browser-level counterparts for the untouched invalid-Age and 50,001-character cases, intercepting/counting diagnosis POSTs and asserting the same association, repeated-refocus, and correction-without-focus-theft behavior. Update all InputDashboard placeholder locators in `tests/e2e/helpers.ts`, `tests/full-flow.spec.ts`, and `tests/inactivity-purge.spec.ts` to role/label selectors. Rewrite only disabled assertions that describe case-form validity; unrelated disabled-state tests such as consent and in-flight retry remain unchanged.

**Rationale:** DOM-level tests provide fast semantic regression coverage, while a real browser is required to prove implicit form submission and textarea keyboard behavior.

### D8: Verification covers the complete application suite

**Decision:** After implementation, run `bun run lint`, `bun run typecheck`, `bun run test:all`, and the opt-in `bun run test:integration`. Record the result of each command and list every integration skip with its reported reason or missing external prerequisite in the completion report; do not represent skipped opt-in coverage as a pass.

**Rationale:** The form change is frontend-focused, but shared test setup, routing, submission, and live integration behavior can regress outside the focused component and E2E files.

## Risks / Trade-offs

- **[An enabled invalid submit control may look ready]** -> Persistent at-least-one guidance and immediate focused feedback explain that activation validates before sending.
- **[Focusing a new alert can cause duplicate speech in some screen readers]** -> Focus occurs only after an explicit failed submit attempt, not during typing, and the alert is not remounted per keystroke.
- **[A visually hidden legend repeats the visible group heading semantically]** -> The duplicate is narrowly limited to the Patient Context group so native grouping and heading navigation are both retained.
- **[Non-live counters are not announced as every character changes]** -> The current count remains associated and queryable; validation state changes provide the meaningful announcements.

## Migration Plan

1. Implement the form, validation, semantic associations, and explicit button types together so no intermediate form can submit from Clear All or dictation controls.
2. Update component tests, semantic E2E locators, Chromium keyboard scenarios, and both validation-edge cases in the same change.
3. Run lint, type checking, the complete application suite, and opt-in integration tests, recording integration skips.
4. Deploy frontend and tests together; no backend or stored-data migration is required.
5. Roll back the frontend and its selector expectations together if necessary.
