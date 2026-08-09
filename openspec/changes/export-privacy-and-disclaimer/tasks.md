## 1. Split Print and Share Actions

- [ ] 1.1 In `src/frontend/pages/ResultsView.tsx`, replace `handlePrint` with `handlePrint` (always `window.print()`) and `handleShare` (guarded by `navigator.share` availability)
- [ ] 1.2 Remove the user-agent sniffing branch
- [ ] 1.3 Add a Share button next to Print with a distinct icon and label; disable or explain when `navigator.share` is unavailable

## 2. Share Confirmation Modal

- [ ] 2.1 Add a confirmation `Modal` that previews the exact text to be shared and warns that sharing transmits health data
- [ ] 2.2 Only call `navigator.share()` after explicit "Confirm Share"

## 3. Disclaimer and Scope in Exports

- [ ] 3.1 In `src/frontend/index.css`, remove `.disclaimer` and the research-only disclaimer block from the print `display: none` rule
- [ ] 3.2 Add a print-only footer in `ResultsView` / `ConsultNotes` with the generated date and report scope
- [ ] 3.3 Include the generated date, report scope, and full disclaimer in the shared text payload

## 4. Accessible Labels

- [ ] 4.1 Add `aria-label="Print report"` and `aria-label="Share report"` to the buttons so icon-only mobile rendering remains accessible

## 5. Tests

- [ ] 5.1 Add `tests/frontend.test.tsx` cases: Print always calls `window.print` (never `navigator.share`) on a mobile UA; Share opens a confirmation modal; confirming invokes `navigator.share`; canceling does not
- [ ] 5.2 Add a test asserting the disclaimer is visible under print CSS
- [ ] 5.3 Add a test asserting both buttons have accessible names on narrow viewports
- [ ] 5.4 Add E2E coverage for print output retaining the disclaimer and share requiring confirmation

## 6. Documentation and Verification

- [ ] 6.1 Update `AGENTS.md` to document the distinct Print/Share behavior and disclaimer preservation
- [ ] 6.2 Run `bun run lint`, `bun run typecheck`, `bun run test:frontend`, and E2E tests