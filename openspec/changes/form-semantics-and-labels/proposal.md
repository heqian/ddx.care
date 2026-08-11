## Why

The case-entry screen lacks a native form contract, complete programmatic labels, and persistent instructions for its primary controls. Its invalid-state submit button is silently disabled, so users cannot attempt submission to learn what is required or use standard Enter-to-submit behavior.

## What Changes

- Make the form's `onSubmit` handler the sole submission path. Keep the submit control activatable for validation, disable it natively only while a request is submitting, and give every non-submit button inside the form an explicit `type="button"`.
- On any client-invalid submission attempt, show and focus a programmatically focusable `role="alert"` summary instead of silently blocking activation. Validate an untouched invalid Age and a 50,001-character clinical field, associate their field-level feedback, refocus the summary on repeated attempts, and clear corrected feedback without stealing focus.
- Give the six primary controls - Age, Sex, Chief Complaint, Medical History, Conversation Transcript, and Lab Results - associated labels plus stable `id` and `name` attributes. Preserve the clinical section headings and scope each label only to its control.
- Group Age, Sex, and Chief Complaint with `fieldset`/`legend`, and give Age a numeric mobile-input hint plus persistent format guidance.
- Associate persistent field instructions, character counters, and applicable Age or over-limit errors through stable `aria-describedby` references. Do not announce a changing count on every keystroke; live validation feedback is limited to meaningful validation transitions or submit attempts.
- Keep the existing hidden, `aria-hidden` FileDropZone file inputs outside the six-primary-control labeling requirement unless FileDropZone is redesigned to expose those inputs directly.
- Add component and real Chromium coverage for Enter behavior, untouched invalid Age, a 50,001-character field, repeated invalid attempts, correction focus behavior, associations, and button types. Replace form placeholder locators and obsolete invalid-state disabled assertions with role/label-based expectations, then run the full project and opt-in integration verification with any skips recorded.

## Capabilities

### New Capabilities

- `form-semantics-and-labels`: The case-entry form provides one native submission path, complete primary-control labels and grouping, persistent accessible guidance, and actionable validation feedback.

## Impact

- **Frontend**: `src/frontend/pages/InputDashboard.tsx` gains the form, submission guards, labels, grouping, descriptions, and explicit button types. `src/frontend/components/ui/FileDropZone.tsx` is not redesigned by this change.
- **Tests**: `tests/frontend.test.tsx`, `tests/e2e/helpers.ts`, `tests/full-flow.spec.ts`, and `tests/inactivity-purge.spec.ts` gain or update semantic selectors and form-behavior coverage.
- **Backend and data**: No API, payload, persistence, dependency, or migration changes.
