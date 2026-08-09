## 1. Centralized Purge

- [ ] 1.1 Add a `purgeSensitiveSession()` function in `src/frontend/main.tsx` that stops voice dictation, clears `sessionStorage` draft and credentials, clears in-memory state, and renders a locked view
- [ ] 1.2 Expose `stopVoiceInput` and a `clearAll` callback from `InputDashboard` to `App` via props or a ref so the purge can drive them
- [ ] 1.3 Replace the inactivity `handleReset` callback with `purgeSensitiveSession`
- [ ] 1.4 Call `window.history.replaceState({ screen: "input" }, "", "/")` during purge

## 2. Auto-Logout Timer Behavior

- [ ] 2.1 Update `src/frontend/hooks/useAutoLogout.ts` to accept `timeoutMs` and `waitingTimeoutMs` parameters
- [ ] 2.2 In `src/frontend/main.tsx`, pass `waitingTimeoutMs` (default 15 minutes) when `route.screen` is `waiting` or `results` and do not pause the timer
- [ ] 2.3 Keep the 10-minute `timeoutMs` for the input screen

## 3. Autosave Disclosure

- [ ] 3.1 Add a visible disclosure note under the form in `src/frontend/pages/InputDashboard.tsx` stating drafts are auto-saved for this tab and cleared on inactivity or tab close

## 4. Tests

- [ ] 4.1 Add `tests/frontend.test.tsx` cases asserting the purge removes the draft from `sessionStorage`, clears form fields, drops the token, and replaces the history entry
- [ ] 4.2 Add a test asserting the timer is not paused on the waiting screen
- [ ] 4.3 Add a test asserting the autosave disclosure text is present
- [ ] 4.4 Add E2E coverage for an unattended results screen triggering the purge and back navigation showing no case content

## 5. Documentation and Verification

- [ ] 5.1 Update `AGENTS.md` frontend PHI section to describe the purge and extended timeout
- [ ] 5.2 Run `bun run lint`, `bun run typecheck`, `bun run test:frontend`, and E2E tests