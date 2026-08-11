## 1. Form Submission and Validation

- [x] 1.1 Replace the case-entry root in `src/frontend/pages/InputDashboard.tsx` with a `<form onSubmit={handleSubmit}>`, accept the form submit event in `handleSubmit`, and call `preventDefault()` before validation
- [x] 1.2 Make Submit for Diagnosis `type="submit"`, remove its submission `onClick`, and ensure no key handler or other control calls the diagnosis submission path
- [x] 1.3 Keep the submit control natively enabled for empty, invalid-age, and over-limit states; set `disabled` only while `submitting` is true
- [x] 1.4 Move the empty-content, current age, and character-limit guards into the form submit path so invalid attempts make no API request, even when invalid Age came from a draft and has not been touched
- [x] 1.5 Add one stable, visible client-validation `role="alert"` summary with `tabIndex={-1}` and focus it after every failed submit attempt, including repeated attempts with unchanged errors
- [x] 1.6 Set `type="button"` explicitly on Clear All and every dictation or other non-submit native button inside the form
- [x] 1.7 Clear each resolved validation error and the summary when appropriate without moving focus from the control the user is correcting

## 2. Labels, Grouping, and Input Semantics

- [x] 2.1 Apply the design's stable `id` and `name` mapping to Age, Sex, Chief Complaint, Medical History, Conversation Transcript, and Lab Results
- [x] 2.2 Associate the Age, Sex, and Chief Complaint labels with their controls using `htmlFor`, including a unique accessible name for the Sex select
- [x] 2.3 Keep each clinical section `h2` and place a narrowly scoped `label` around only its heading text, associated with the corresponding textarea
- [x] 2.4 Wrap Age, Sex, and Chief Complaint in one `fieldset` with a non-empty legend while retaining the visible Patient Context heading
- [x] 2.5 Keep Age as `type="text"` and add `inputMode="numeric"`
- [x] 2.6 Leave FileDropZone's separately named role-button trigger and hidden, `aria-hidden`, non-tabbable file input pattern unchanged; do not add primary-control labels, IDs, or names to those hidden implementation inputs

## 3. Persistent Descriptions

- [x] 3.1 Add stable, visible shared at-least-one-field guidance and stable field-specific instructions for the three clinical textareas instead of relying on placeholders alone
- [x] 3.2 Extend `CharCount` to render a supplied stable ID and connect each textarea to its shared instruction, field instruction, own counter, and conditional field-specific over-limit error with `aria-describedby`
- [x] 3.3 Add a stable persistent Age format hint, validate Age independently of prior interaction on submit, and compose its `aria-describedby` from the hint plus the conditional age-error ID
- [x] 3.4 Keep character counters out of live regions and ensure validation alerts are introduced only on validation transitions or explicit submission attempts, not remounted on every keystroke
- [x] 3.5 Set `aria-invalid` and render associated feedback for each textarea above 50,000 characters, then remove only that error state and reference when corrected

## 4. Component Tests

- [x] 4.1 Extend `tests/frontend.test.tsx` to query all six primary controls by label and assert each label association plus the stable `id` and `name`, explicitly covering Sex
- [x] 4.2 Add component assertions for the Patient Context fieldset/legend, retained clinical headings, Age `inputMode`, resolved `aria-describedby` references, and non-live counters
- [x] 4.3 Add component validation coverage proving an empty submit control remains activatable, a submit attempt makes no request, and the focusable `role="alert"` becomes visible and focused
- [x] 4.4 Add component coverage proving the diagnosis control is the form's only `type="submit"`, every other native form button is `type="button"`, and native disabled is used only during submission
- [x] 4.5 Add a component test with valid clinical content and untouched invalid Age that asserts no POST, touched/validated Age state, `aria-invalid`, resolved hint/error descriptions, repeated-submit refocus, and correction without focus theft
- [x] 4.6 Add a component test with a 50,001-character clinical field that asserts no POST, field-specific associated over-limit feedback, repeated-submit refocus, and correction at 50,000 characters without focus theft

## 5. Chromium E2E and Locator Migration

- [x] 5.1 Update `tests/e2e/helpers.ts` to fill all six primary controls with role/label selectors instead of placeholder selectors
- [x] 5.2 Replace every direct InputDashboard placeholder locator in `tests/full-flow.spec.ts` and `tests/inactivity-purge.spec.ts`, and rewrite only the case-validity assertions that expect Submit for Diagnosis to be disabled
- [x] 5.3 Add a Chromium test that presses Enter in a labeled single-line text input with all clinical textareas empty and verifies no request, a visible validation alert, and focus on that alert
- [x] 5.4 Add a Chromium test that supplies valid clinical content, presses Enter in a labeled single-line text input, and verifies exactly one native form submission reaches the waiting/results flow
- [x] 5.5 Add a Chromium test that presses Enter in a labeled clinical textarea and verifies a newline is inserted without a request or navigation
- [x] 5.6 Add a Chromium test with valid clinical content and untouched invalid Age that counts zero diagnosis POSTs, verifies touched/invalid Age and resolved descriptions, refocuses the summary on a repeated attempt, and confirms correction clears feedback without stealing focus
- [x] 5.7 Add a Chromium test with a 50,001-character clinical field that counts zero diagnosis POSTs, verifies associated field-level over-limit feedback, refocuses the summary on a repeated attempt, and confirms truncation to 50,000 clears feedback without stealing focus

## 6. Verification

- [x] 6.1 Run `bun run lint` and `bun run typecheck`
- [x] 6.2 Run the complete application suite with `bun run test:all`
- [x] 6.3 Run the opt-in integration suite with `bun run test:integration` and record every skip with its reported reason or missing external prerequisite
