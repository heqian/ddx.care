## Context

`handlePrint` in `src/frontend/pages/ResultsView.tsx:63-85` sniffs the user agent and calls `navigator.share()` on mobile when the user clicks Print, exposing PHI to the OS share sheet. The shared text omits evidence, context, and the disclaimer. The Print button's visible label is hidden on mobile (`ResultsView.tsx:131-139`) without an `aria-label`. Print CSS (`src/frontend/index.css:145-159`) hides `.disclaimer`, `[data-print-hide]`, header, and footer, so printed reports lose all warnings.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Separate Print and Share with honest labels.
- Require explicit confirmation before sharing.
- Preserve disclaimer and report scope in all exports.
- Make controls accessible on all viewports.

**Non-Goals:**
- PDF export (separate change: `pdf-export-report`).
- Watermarking printed pages.
- Removing the share feature entirely.

## Decisions

### D1: Separate Print and Share buttons

**Decision:** Replace the single Print button with two buttons: Print (always `window.print()`) and Share (only `navigator.share()` when available, with a disabled/explanatory state otherwise). Remove the UA sniff.

**Rationale:** The user's intent differs between printing (local output) and sharing (transmitting to another app). UA sniffing misroutes intent.

### D2: Share confirmation modal with preview

**Decision:** Clicking Share opens a `Modal` showing the exact text to be shared and a warning that sharing transmits health data. Only explicit "Confirm Share" calls `navigator.share()`.

**Rationale:** Prevents accidental exposure and lets the user verify the content, including the disclaimer.

### D3: Disclaimer preserved in print and share

**Decision:** Remove `.disclaimer` and the research-only disclaimer block from the print-CSS `display: none` list. Add a print-only footer with the generated date and report scope. Include the same disclaimer text in the shared payload.

**Rationale:** Exports that lose the disclaimer appear authoritative. Keeping it in print and share is the minimum safety posture.

### D4: Accessible labels

**Decision:** Add `aria-label="Print report"` and `aria-label="Share report"` to the respective buttons, so icon-only mobile rendering still exposes a name to assistive tech.

**Rationale:** The current hidden span leaves the button unnamed on mobile.

## Risks / Trade-offs

- **[Two buttons add UI complexity]** → The results header gains one button. **Mitigation:** Keep them adjacent with clear icons.
- **[Share confirmation adds friction]** → A user who shares often must confirm each time. **Mitigation:** The privacy benefit outweighs the friction; the modal is dismissible.

## Migration Plan

1. Deploy frontend; print and share behavior takes effect immediately.
2. No backend changes.
3. Rollback: revert to the single UA-sniffing Print button (unsafe but backward-compatible).

## Open Questions

- Should the share text include the full ranked diagnoses or only the top 3? (Leaning: include top 3 to keep the share payload compact; the full report is available via print.)