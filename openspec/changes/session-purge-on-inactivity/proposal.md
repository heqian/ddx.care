## Why

The inactivity warning tells the user "Patient data will be cleared," but `handleReset` only clears `jobResult` and navigates to the input route — it does not clear the draft, current form state, the consent flag, the job token, or sensitive history entries. The auto-logout timer is paused throughout diagnosis, so on shared devices an unattended waiting or results screen can remain exposed far longer than the 10-minute timeout. Drafts are auto-saved to `sessionStorage` every 500ms without any visible autosave disclosure. After the timeout fires, case content can still be visible, restorable from `sessionStorage`, and reachable through browser history.

## What Changes

- **Real sensitive-session purge**: the inactivity timeout SHALL stop voice dictation, remove the draft from `sessionStorage`, clear in-memory form fields and job credentials, replace browser history with a neutral route, and render a locked/redacted state instead of navigating to a still-populated input page.
- **Autosave disclosure**: the input form SHALL disclose that drafts are auto-saved to `sessionStorage` and SHALL provide a visible retention boundary; autosave SHALL be opt-out or clearly indicated.
- **Inactivity applies during waiting/results**: the auto-logout timer SHALL NOT be paused for the entire duration of a diagnosis; it SHALL run during waiting and results with an extended timeout, so an unattended terminal screen still triggers the purge.
- **History scrubbing on purge**: the purge SHALL use `history.replaceState` to remove capability-bearing and case-bearing entries from browser history.

## Capabilities

### New Capabilities

- `inactivity-session-purge`: On inactivity timeout, the client SHALL perform a complete sensitive-session purge that removes drafts, credentials, visible state, and history entries, and renders a locked state.

### Modified Capabilities

- `frontend-job-context-isolation`: The inactivity purge SHALL clear job credentials and history entries, and the auto-logout timer SHALL remain active during waiting/results with an extended timeout.

## Impact

- **Frontend**: `src/frontend/main.tsx` (handleReset → purge), `src/frontend/hooks/useAutoLogout.ts` (do not pause during waiting; extended timeout), `src/frontend/pages/InputDashboard.tsx` (autosave disclosure, expose a clear-draft method), `src/frontend/hooks/useRouter.ts` (history scrubbing).
- **Tests**: `tests/frontend.test.tsx`, E2E inactivity-purge coverage.
- **Documentation**: `AGENTS.md` (PHI frontend section).