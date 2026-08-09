## Why

The core case-entry flow lacks programmatic labels and native form semantics. The Age, Sex, and Chief Complaint labels are not connected with `htmlFor`; the three clinical textareas have no labels at all. There is no `<form>` or `onSubmit`, no field names, and no mobile numeric input hint for age. The requirement that at least one text area be populated is represented only by a silently disabled submit button, leaving users without an explanation for why they cannot proceed. This fails WCAG 1.3.1, 3.3.2, and potentially 4.1.2 for the application's primary task: screen-reader and voice-control users cannot reliably identify fields, Enter does not submit, and all users can be left without an explanation for the disabled action.

## What Changes

- **Native form with labels**: the case-entry fields SHALL be wrapped in a `<form>` with an `onSubmit` handler; every input SHALL have an associated `<label>` via `htmlFor`/`id`; the three textareas SHALL have labels.
- **Field semantics**: the age input SHALL use `inputMode="numeric"` and a numeric hint; fields SHALL have `name` attributes; `fieldset`/`legend` SHALL group the patient-context fields.
- **Submit-time validation feedback**: when submission is disabled because no clinical content is present, the UI SHALL show a visible, programmatic error message explaining the requirement; pressing Enter SHALL attempt submission and surface validation feedback.
- **Accessible descriptions**: character limits and instructions SHALL be associated via `aria-describedby`.

## Capabilities

### New Capabilities

- `form-semantics-and-labels`: The case-entry form SHALL use native form semantics, programmatic labels, field grouping, accessible descriptions, and visible submit-time validation so the primary task is accessible and understandable.

## Impact

- **Frontend**: `src/frontend/pages/InputDashboard.tsx` (form, labels, fieldset/legend, inputMode, validation message, aria-describedby), `src/frontend/components/ui/Button.tsx` (submit type).
- **Tests**: `tests/frontend.test.tsx` (label association, form submission, validation message), E2E helpers using labels instead of placeholders.
- **Documentation**: `AGENTS.md` (accessibility).