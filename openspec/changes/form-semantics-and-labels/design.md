## Context

`src/frontend/pages/InputDashboard.tsx:235-310` renders Age, Sex, and Chief Complaint with `<label>` elements not connected via `htmlFor`. The three textareas at lines 341-347, 391-397, and 422-428 have no labels. There is no `<form>` or `onSubmit` (`handleSubmit` is wired to a Button `onClick` at line 490-497). The age input at line 262 is `type="text"` with no `inputMode`. The `canSubmit` guard at line 124-127 only disables the button with no visible reason. E2E helpers at `tests/e2e/helpers.ts:42-61` use placeholders instead of labels, allowing the missing associations to pass.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Native form semantics and programmatic labels.
- Field grouping and numeric input hint.
- Visible, accessible submit-time validation.
- `aria-describedby` for limits and instructions.

**Non-Goals:**
- Full WCAG audit of every screen (separate accessibility change).
- Redesigning the form layout.
- Inline per-field validation beyond the empty-form and over-limit cases.

## Decisions

### D1: Wrap in a form with onSubmit

**Decision:** Wrap the case-entry fields in `<form onSubmit={handleSubmit}>`. The submit Button uses `type="submit"`. `handleSubmit` calls `e.preventDefault()` then proceeds.

**Rationale:** Enables Enter-to-submit and standard form semantics.

### D2: Associate labels via htmlFor/id

**Decision:** Add stable `id`s to each input/textarea and connect each `<label>` via `htmlFor`. Add labels to the three textareas (using the existing section headings as label text, or new visible labels).

**Rationale:** Programmatic association is required for WCAG 1.3.1/4.1.2.

### D3: fieldset/legend and inputMode

**Decision:** Group the patient-context fields in `<fieldset><legend>Patient Context</legend>`. Set `inputMode="numeric"` on the age input.

**Rationale:** Grouping aids screen-reader navigation; `inputMode` improves mobile UX.

### D4: Visible disabled-submission reason

**Decision:** When `!canSubmit` due to empty content, show a `role="alert"` message: "Enter at least one of medical history, transcript, or lab results to submit." On Enter submission while disabled, focus the message.

**Rationale:** A silently disabled button violates 3.3.2; an announced message explains the requirement.

### D5: aria-describedby for counters

**Decision:** Give each `CharCount` a stable `id` and reference it from the textarea via `aria-describedby`.

**Rationale:** Lets assistive technology announce the current count and limit.

## Risks / Trade-offs

- **[Form submission on Enter may surprise textarea users]** → Enter in a textarea normally inserts a newline. **Mitigation:** Only the form-level Enter (not textarea Enter) submits; this is standard form behavior.
- **[New labels add visual height]** → Adding labels to textareas changes layout slightly. **Mitigation:** Use the existing section heading as the label to avoid duplicate visible text.

## Migration Plan

1. Deploy frontend; form semantics take effect immediately.
2. Update E2E helpers to select by label instead of placeholder.
3. Rollback: revert to the label-less form (inaccessible but backward-compatible).

## Open Questions

- Should the textarea labels reuse the section headings or add new visible label text? (Leaning: reuse headings to avoid duplicate text; associate the heading as the label.)