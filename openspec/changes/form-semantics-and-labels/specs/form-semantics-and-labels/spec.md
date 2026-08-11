## Purpose

Makes case entry operable and understandable through one native form submission path, complete control labels, persistent descriptions, and actionable validation feedback for keyboard and assistive-technology users.

## ADDED Requirements

### Requirement: Case entry has one native submission path

The case-entry controls SHALL be contained in a native form whose `onSubmit` handler is the sole path that starts diagnosis submission. The diagnosis control SHALL be `type="submit"` and SHALL NOT invoke submission from a parallel click or keyboard handler. Every other native button inside the form SHALL explicitly be `type="button"`.

#### Scenario: Submit control uses the form handler
- **WHEN** a user activates Submit for Diagnosis by click or by pressing Enter in a single-line text input
- **THEN** the form's submit handler runs exactly once

#### Scenario: Incidental action does not submit
- **WHEN** a user activates Clear All or a dictation control
- **THEN** that action does not submit the case

#### Scenario: Enter remains multiline in a textarea
- **WHEN** a user presses Enter while focused in a clinical textarea
- **THEN** a newline is inserted and the case is not submitted

### Requirement: All six primary controls have stable programmatic labels

Age, Sex, Chief Complaint, Medical History, Conversation Transcript, and Lab Results SHALL each have a stable `id`, a stable `name`, and a `<label>` associated through `htmlFor` and `id`. The clinical section headings SHALL remain available for heading navigation, and each textarea label SHALL contain only its heading text rather than adjacent action buttons, counters, textareas, or upload controls.

Hidden, `aria-hidden`, non-tabbable file inputs used only to implement the separately named FileDropZone triggers are exempt from this six-primary-control requirement while they remain hidden implementation details. If a file input is redesigned as a user-facing operable control, it SHALL receive its own label, stable `id`, and stable `name`.

#### Scenario: Primary controls expose their visible names
- **WHEN** a user queries the form by label
- **THEN** each of the six primary controls, including the Sex select, is uniquely available by its visible label

#### Scenario: Clinical labels preserve heading navigation
- **WHEN** a user navigates the page by headings
- **THEN** Medical History, Conversation Transcript, and Lab Results remain section headings while their text labels only the corresponding textarea

#### Scenario: Hidden FileDropZone input remains an implementation detail
- **WHEN** FileDropZone retains its named keyboard-operable trigger and hidden `aria-hidden` file input
- **THEN** the trigger retains its accessible name and the hidden input is not treated as one of the six primary controls

### Requirement: Patient context is grouped and Age provides numeric guidance

Age, Sex, and Chief Complaint SHALL be contained in one `fieldset` with a non-empty `legend` that names the Patient Context group. The visible Patient Context heading SHALL remain available for heading navigation. Age SHALL remain a text input with `inputMode="numeric"` and SHALL have persistent guidance describing its accepted one-to-three-digit format.

#### Scenario: Patient context exposes a native group name
- **WHEN** assistive technology encounters Age, Sex, and Chief Complaint
- **THEN** the controls are presented within a fieldset named by its legend

#### Scenario: Age offers numeric entry guidance
- **WHEN** a user focuses Age on a mobile device or reads its description
- **THEN** a numeric keyboard hint is present and the persistent description states the expected digit format

### Requirement: Invalid submission remains activatable and reports the error

Form validity alone SHALL NOT natively disable the diagnosis submit control. Empty clinical content, invalid Age content, and over-limit clinical content SHALL be checked by the sole submit handler and SHALL prevent an API request while allowing the user to attempt submission. The submit control SHALL use native `disabled` only while a diagnosis request is actively submitting.

Every failed client-validation attempt SHALL render or update one visible `role="alert"` summary. The summary SHALL be programmatically focusable and SHALL receive focus after every failed attempt, including a repeated attempt with unchanged errors. When all three clinical textareas are empty or whitespace-only, the summary SHALL explain that at least one of the three fields is required. Correcting a field SHALL clear its resolved feedback and SHALL clear the summary when no errors remain, without moving focus from the control being edited.

#### Scenario: Empty click submission focuses guidance
- **WHEN** all three clinical textareas are empty and a user activates Submit for Diagnosis
- **THEN** no diagnosis request starts and focus moves to the visible alert describing the at-least-one-field rule

#### Scenario: Empty Enter submission focuses guidance
- **WHEN** all three clinical textareas are empty and a user presses Enter in a single-line text input
- **THEN** no diagnosis request starts and focus moves to the same visible alert

#### Scenario: Valid Enter submission starts diagnosis
- **WHEN** at least one clinical textarea has non-whitespace content and all other validation rules pass and the user presses Enter in a single-line text input
- **THEN** one diagnosis request starts through the form submit handler

#### Scenario: Untouched invalid Age blocks submission
- **WHEN** valid clinical content is present, Age contains an invalid value that the user has not interacted with, and the user attempts submission
- **THEN** no diagnosis request starts, Age enters its touched/validated state with `aria-invalid="true"`, its description references both the persistent hint and associated error, and focus moves to the validation summary

#### Scenario: A 50,001-character field blocks submission
- **WHEN** one clinical textarea contains 50,001 characters and the user attempts submission
- **THEN** no diagnosis request starts, that textarea has `aria-invalid="true"`, its description references its associated over-limit feedback, and focus moves to the validation summary

#### Scenario: Repeated invalid submission refocuses feedback
- **WHEN** validation errors remain, focus has moved elsewhere, and the user attempts submission again
- **THEN** no diagnosis request starts and focus returns to the existing validation summary

#### Scenario: Correction clears feedback without stealing focus
- **WHEN** a user corrects invalid Age or reduces an over-limit textarea to 50,000 or fewer characters
- **THEN** the resolved error, invalid state, and error description reference are removed while persistent descriptions remain and focus stays on the edited control

#### Scenario: In-flight submission prevents duplicates
- **WHEN** a diagnosis request is actively submitting
- **THEN** the submit control is natively disabled until that attempt settles

### Requirement: Instructions and counters are persistent accessible descriptions

Instructions that affect completion or input format SHALL remain visible instead of being conveyed only by placeholder text. A persistent shared instruction SHALL explain that at least one of Medical History, Conversation Transcript, or Lab Results is required, and each clinical textarea SHALL have persistent field-specific guidance. The shared instruction, field-specific instructions, Age format hint, Age error, field-specific over-limit errors, and character counters SHALL use stable IDs and SHALL be referenced from their applicable controls with valid `aria-describedby` ID lists.

Character counters SHALL update visually and remain available through their description relationships, but SHALL NOT use an assertive or per-keystroke live region. Any live validation announcement SHALL be limited to a validation-state transition or an explicit submission attempt rather than repeating for every character.

#### Scenario: Textarea exposes instructions and current count
- **WHEN** assistive technology inspects a clinical textarea
- **THEN** its description references the shared requirement, its field guidance, and its own current character counter

#### Scenario: Age error preserves its persistent hint
- **WHEN** Age has a validation error
- **THEN** its description references both the persistent numeric-format hint and the current error and the control is marked invalid

#### Scenario: Over-limit feedback is associated with its field
- **WHEN** a clinical textarea exceeds 50,000 characters
- **THEN** its description references its own over-limit error in addition to its persistent instructions and counter and the control is marked invalid

#### Scenario: Typing does not announce every count change
- **WHEN** a user types multiple characters into a clinical textarea
- **THEN** the visual counter updates without generating a live announcement for each keystroke
