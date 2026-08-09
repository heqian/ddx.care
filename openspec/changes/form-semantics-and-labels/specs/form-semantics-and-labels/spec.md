## Purpose

Makes the primary case-entry task accessible and understandable by using native form semantics, programmatic labels, field grouping, accessible descriptions, and visible submit-time validation, so screen-reader, voice-control, and keyboard users can complete and submit a case.

## ADDED Requirements

### Requirement: Case-entry uses a native form with associated labels

The case-entry fields SHALL be wrapped in a `<form>` element with an `onSubmit` handler. Every input and textarea SHALL have an associated `<label>` via `htmlFor`/`id`. The three clinical textareas (medical history, conversation transcript, lab results) SHALL each have a programmatic label.

#### Scenario: Textarea has a programmatic label
- **WHEN** a screen reader encounters the medical history textarea
- **THEN** it announces the associated label text

#### Scenario: Enter submits the form
- **WHEN** the user presses Enter while focused in a text field
- **THEN** the form submission handler is invoked

### Requirement: Field grouping and input semantics

The patient-context fields (age, sex, chief complaint) SHALL be grouped using `<fieldset>`/`<legend>`. The age input SHALL use `inputMode="numeric"`. All fields SHALL have `name` attributes.

#### Scenario: Patient-context fields are grouped
- **WHEN** the patient-context section is inspected
- **THEN** a `<fieldset>` with a `<legend>` wraps the age, sex, and chief-complaint fields

#### Scenario: Age shows a numeric keyboard on mobile
- **WHEN** the age input is focused on a mobile device
- **THEN** a numeric keyboard is offered because `inputMode="numeric"` is set

### Requirement: Disabled submission shows an accessible reason

When submission is disabled because no clinical content is present, the UI SHALL show a visible, programmatic error message explaining that at least one text area must be populated. The message SHALL be announced to assistive technology. Pressing Enter in this state SHALL surface the validation feedback rather than silently doing nothing.

#### Scenario: Empty form shows validation guidance
- **WHEN** all three text areas are empty and the user attempts to submit
- **THEN** a visible message states that at least one text area is required and it is announced to assistive technology

#### Scenario: Populated form submits
- **WHEN** at least one text area has content and the user submits
- **THEN** the form submits and the diagnosis workflow begins

### Requirement: Character limits are associated via accessible descriptions

Character-limit counters and field instructions SHALL be associated with their inputs via `aria-describedby` so assistive technology announces the limit and current count.

#### Scenario: Screen reader announces character count
- **WHEN** a user types into a text area and a character counter is present
- **THEN** the counter is associated via `aria-describedby` and its updates are available to assistive technology