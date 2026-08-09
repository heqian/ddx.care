## Purpose

On inactivity timeout, performs a complete purge of sensitive browser-side state — drafts, credentials, visible form content, and history entries — so the "Patient data will be cleared" promise is actually true and an unattended shared device does not remain exposed.

## Requirements

### Requirement: Inactivity timeout performs a complete sensitive purge

When the inactivity timeout fires, the client SHALL, in a single coordinated action: stop any active voice dictation; remove the draft from `sessionStorage`; clear in-memory form fields (age, sex, chief complaint, history, transcript, labs); clear the current job token and result state; replace the current history entry with a neutral, credential-free route via `history.replaceState`; and render a locked or redacted state rather than navigating to a still-populated input page.

#### Scenario: Timeout clears all sensitive state
- **WHEN** the inactivity timeout fires while on the waiting or results screen
- **THEN** voice dictation is stopped, the draft is removed from `sessionStorage`, all form fields are cleared, the job token is dropped, the history entry is replaced with a neutral route, and the UI shows a locked state

#### Scenario: Timeout clears draft on the input page
- **WHEN** the inactivity timeout fires while on the input page with unsaved draft content
- **THEN** the draft is removed from `sessionStorage`, the visible form fields are cleared, and the history entry no longer references case content

### Requirement: Auto-logout remains active during waiting and results

The auto-logout timer SHALL NOT be paused for the entire duration of a diagnosis. It SHALL run during the waiting and results screens with an extended timeout (default 15 minutes) so that an unattended terminal screen still triggers the purge. The timer MAY be reset by user activity as on other screens.

#### Scenario: Unattended results screen triggers purge
- **WHEN** a results screen is left unattended for the extended timeout
- **THEN** the purge fires and the sensitive state is cleared

#### Scenario: Active interaction resets the timer
- **WHEN** the user interacts with the results screen
- **THEN** the extended timer resets, as on the input screen

### Requirement: Autosave is disclosed

The input form SHALL disclose that drafts are auto-saved to `sessionStorage` for the current tab session. The disclosure SHALL state that closing the tab clears the draft and that the inactivity purge removes it early.

#### Scenario: User sees autosave disclosure
- **WHEN** the input form is rendered
- **THEN** visible text indicates that drafts are auto-saved for this tab and cleared on inactivity or tab close

### Requirement: History is scrubbed on purge

The purge SHALL use `history.replaceState` to replace any capability-bearing or case-bearing entry with a neutral route, so browser back navigation cannot recover sensitive content or credentials.

#### Scenario: Back navigation after purge shows no case content
- **WHEN** the purge has fired and the user presses the browser back button
- **THEN** the previous entry is the neutral route and does not display case content or a capability URL