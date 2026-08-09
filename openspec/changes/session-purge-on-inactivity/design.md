## Context

`handleReset` in `src/frontend/main.tsx:57-60` only clears `jobResult` and navigates to the input route. The draft remains in `sessionStorage` and in `InputDashboard` state (`src/frontend/pages/InputDashboard.tsx:36-59`, `102-114`). The inactivity warning at `main.tsx:123-128` claims "Patient data will be cleared." `useAutoLogout` is paused throughout diagnosis (`main.tsx:62-65`, `useAutoLogout.ts:29-35`), so an unattended waiting/results screen never times out. History scrubbing is not performed. There is no autosave disclosure.

See `proposal.md` for motivation.

## Goals / Non-Goals

**Goals:**
- Make the "data will be cleared" promise true.
- Keep the timer active on waiting/results with an extended timeout.
- Disclose autosave and its boundary.
- Scrub browser history on purge.

**Non-Goals:**
- Encrypting `sessionStorage` (browser storage encryption is out of scope).
- Removing autosave entirely (it is a useful recovery feature if disclosed).
- Changing the consent gate behavior.

## Decisions

### D1: Centralized purge function

**Decision:** Add a `purgeSensitiveSession()` function that: stops voice dictation via a ref-exposed `stopVoiceInput`; removes `sessionStorage` keys (`ddx_draft`, job credentials); clears `InputDashboard` state via a lifted `clearAll` callback; clears `jobResult`, `wsToken`, and `lastPayload` in `App`; calls `history.replaceState` with `{ screen: "input" }`; and renders a "Session locked" view instead of the populated input page.

**Rationale:** The current `handleReset` is incomplete. Centralizing ensures every purge path (inactivity, explicit reset) performs the full set. Rendering a locked view prevents a flash of populated input.

### D2: Extended timeout on waiting/results

**Decision:** `useAutoLogout` SHALL accept a `timeoutMs` and a separate `waitingTimeoutMs` (default 15 minutes). When `route.screen` is `waiting` or `results`, the timer uses `waitingTimeoutMs` and is NOT paused. On `input`, it uses `timeoutMs` (10 minutes).

**Rationale:** Pausing the timer for the entire diagnosis leaves shared devices exposed. A 15-minute extended timeout is longer than typical workflows but still bounds exposure.

**Alternatives considered:**
- Keep pausing and rely on the user to lock the device — not safe for shared/kiosk use.
- Use the same 10-minute timeout everywhere — could interrupt a legitimate 12-minute workflow review; the extended timeout is a compromise.

### D3: Autosave disclosure

**Decision:** Add a small visible note under the form: "Drafts are auto-saved for this tab and cleared on inactivity or tab close."

**Rationale:** Users should know their input persists across reloads. The disclosure is non-technical and actionable.

### D4: History scrubbing via replaceState

**Decision:** During purge, call `window.history.replaceState({ screen: "input" }, "", "/")` so the current entry becomes neutral. For prior entries, browsers do not allow bulk history mutation, so the neutral replace plus the lack of capability URLs (from the capability-transport-hardening change) bounds recovery.

**Rationale:** `replaceState` is the only safe history mutation available; combined with removing tokens from URLs it is sufficient.

## Risks / Trade-offs

- **[Extended timeout still interrupts long review]** → A user reviewing a complex report for >15 minutes could be purged. **Mitigation:** User activity resets the timer; the extended value is configurable.
- **[Purge during active diagnosis removes the draft but not server work]** → The server workflow continues. **Mitigation:** The draft is client-side recovery only; the running job is unaffected and its result is retrievable only with the (now-cleared) token, which is the intended privacy behavior on a shared device.
- **[History scrubbing is limited to the current entry]** → Prior history entries may persist. **Mitigation:** Removing capability URLs (separate change) ensures prior entries cannot recover data; full history clearing is not possible from JS.

## Migration Plan

1. Deploy frontend; the purge takes effect immediately.
2. No backend changes required.
3. Rollback: revert to the partial `handleReset`; the warning becomes misleading again (unsafe but backward-compatible).

## Open Questions

- Should the locked view require re-accepting consent, or just a "tap to continue" that returns to a blank input? (Leaning: tap to continue to a blank input; consent is session-scoped and re-accepting is friction.)
- Should the extended timeout be configurable via env or hardcoded? (Leaning: hardcoded 15 minutes for now; add a setting only if kiosk deployments require it.)